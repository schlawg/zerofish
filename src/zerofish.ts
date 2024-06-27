export interface ZerofishOpts {
  root?: string;
  wasm?: string;
  dev?: boolean;
}

export interface ZeroNet {
  name: string;
  fetch: (name?: string) => Promise<Uint8Array>;
}

export type SearchBy = { depth: number } | { movetime: number } | { nodes: number };

export interface FishSearch {
  multipv: number;
  level?: number;
  by: SearchBy;
}

export interface ZeroSearch {
  multipv: number;
  net: ZeroNet;
}

export interface Position {
  fen?: string;
  moves?: string[];
}

export interface Line {
  moves: string[];
  scores: number[];
}

export interface SearchResult {
  pvs: Line[];
  bestmove: string;
  engine: 'fish' | 'zero';
}

export interface Zerofish {
  goZero(pos: Position, search: ZeroSearch): Promise<SearchResult>;
  goFish(pos: Position, search: FishSearch): Promise<SearchResult>;
  quit(): void;
  stop(): void;
  reset(): void;
}

export default async function initModule({ root, wasm, dev }: ZerofishOpts = {}): Promise<Zerofish> {
  const module = await import(`${root ?? '.'}/zerofishEngine.js`);
  const enginePromises = Array.from({ length: dev ? 2 : 1 }, () =>
    module.default({
      locateFile: wasm ? () => wasm : undefined,
      noInitialRun: true,
    })
  );
  const engines = await Promise.all(enginePromises);
  engines[0].callMain([dev ? `${navigator.hardwareConcurrency}` : '4']); // 4 fish threads on main engine
  if (dev) engines[1].callMain(['0']);
  return new ZerofishImpl(engines);
}

type Worker = any;

interface PB {
  multipv: number;
  by: SearchBy;
  level?: number;
  worker: Worker;
  engine: 'fish' | 'zero';
  listen: 'listenFish' | 'listenZero';
}

class ZerofishImpl implements Zerofish {
  private lru = new Map<string, number>();

  constructor(private workers: Worker[]) {
    this.newGame();
  }

  get fish(): Worker {
    return this.workers[0].fish;
  }

  async goFish(pos: Position, s: FishSearch): Promise<SearchResult> {
    return this.go(pos, {
      ...s,
      worker: this.workers[0],
      engine: 'fish',
      listen: 'listenFish',
    });
  }

  async goZero(pos: Position, s: ZeroSearch): Promise<SearchResult> {
    const index = this.lru.get(s.net.name) ?? (await this.getNet(s.net));
    this.lru.set(s.net.name, index);
    return this.go(pos, {
      multipv: s.multipv,
      by: { nodes: 1 },
      worker: this.workers[index],
      engine: 'zero',
      listen: 'listenZero',
    });
  }

  quit() {
    this.stop();
    for (const w of this.workers) w.quit();
  }

  stop() {
    this.fish('stop');
    for (const w of this.workers) w.zero('stop');
  }

  reset() {
    this.stop();
    this.newGame();
  }

  private newGame() {
    this.fish('ucinewgame');
    this.fish('setoption name uci_chess960 value true');
    for (const w of this.workers) w.zero('ucinewgame');
  }

  private async getNet(net: ZeroNet): Promise<number> {
    let netIndex: number;
    if (this.lru.size < this.workers.length) {
      netIndex = this.lru.size;
    } else {
      const [netName, index] = this.lru.entries().next().value as [string, number];
      this.lru.delete(netName);
      netIndex = index;
    }
    this.workers[netIndex].zero('ucinewgame');
    this.workers[netIndex].setZeroWeights(await net.fetch(net.name));
    return netIndex;
  }

  private go(pos: Position, { multipv, by, level, worker, engine, listen }: PB): Promise<SearchResult> {
    const pvs: Line[] = Array.from({ length: multipv }, () => ({
      moves: [],
      scores: [],
    }));
    const { fen, moves } = pos;
    const uci = worker[engine];

    return new Promise<SearchResult>(async (resolve, reject) => {
      const onError = (err: string) => {
        worker[listen] = undefined;
        reject(err);
      };
      worker[listen] = (line: string) => {
        const tokens = line.split(' ');
        if (tokens[0] === 'bestmove') {
          worker[listen] = undefined;
          resolve({
            bestmove: tokens[1],
            pvs: pvs.find(pv => pv.moves[0] === tokens[1]) ? pvs : [{ moves: [tokens[1]], scores: [0] }],
            engine: engine,
          });
        } else if (tokens[0] === 'info') {
          if (tokens[1] !== 'depth') return;
          const find = (field: string) => {
            for (let iter = 2; iter < tokens.length - 1; ) if (tokens[iter++] === field) return tokens[iter];
            return undefined;
          };
          const pvIndex = parseInt(find('multipv') ?? '1');
          const pv: Line = pvs[pvIndex - 1];
          pv.scores.push(find('score') === 'mate' ? Infinity : parseInt(find('cp') ?? '0'));
          pv.moves = tokens.slice(tokens.indexOf('pv') + 1);
        }
      };
      uci('position ' + (fen ? `fen ${fen}` : 'startpos') + (moves?.[0] ? ` moves ${moves.join(' ')}` : ''));
      uci(`setoption name multipv value ${multipv}`);
      if (engine === 'fish') uci(`setoption name skill level value ${level ?? 30}`);
      if ('movetime' in by) uci(`go movetime ${by.movetime}`);
      else if ('nodes' in by) uci(`go nodes ${by.nodes}`);
      else if ('depth' in by) uci(`go depth ${by.depth}`);
      else reject(`invalid search ${JSON.stringify(by)}`);
    });
  }
}
