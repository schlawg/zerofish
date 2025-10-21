export interface ZerofishOpts {
  locator: (file: string) => string;
  nonce?: string;
  dev?: boolean;
}

export interface ZeroNet {
  key: string;
  fetch: (key?: string) => Promise<Uint8Array>;
}

export type SearchBy = { depth: number } | { movetime: number } | { nodes: number };

export interface FishSearch {
  multipv: number;
  by: SearchBy;
  level?: number; // -10 to 20
}

export interface ZeroSearch {
  multipv: number;
  net: ZeroNet;
  nodes?: number;
}

export interface Position {
  fen?: string;
  moves?: string[];
}

export interface Line {
  moves: string[];
  score: number;
}

export interface SearchResult {
  lines: Line[][]; // [depth][pv]
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

export default async function makeZerofish({ locator, nonce, dev }: ZerofishOpts): Promise<Zerofish> {
  const jsUrl = locator('zerofishEngine.js');
  const module = await import(jsUrl);

  const enginePromises = Array.from({ length: dev ? 2 : 1 }, () =>
    module.default({
      mainScriptUrlOrBlob: jsUrl,
      onError: (msg: string) => Promise.reject(new Error(msg)),
      locateFile: locator,
      noInitialRun: true,
    })
  );
  const engines = await Promise.all(enginePromises);
  engines[0].callMain(['4']); // 4 fish threads on main engine
  if (dev) engines[1].callMain(['0']); // we dont need any on the second.
  return new ZerofishEngines(engines);
}

interface Worker {
  // webassembly module augmented with /zerofish/wasm/src/initModule.js
  fish: (uci: string) => void;
  zero: (uci: string) => void;
  setZeroWeights: (weights: Uint8Array) => void;
  listenFish?: (line: string) => void;
  listenZero?: (line: string) => void;
  quit: () => void;
}

interface SearchArgs {
  multipv: number;
  by: SearchBy;
  level?: number;
  worker: Worker;
  engine: 'fish' | 'zero';
}

class ZerofishEngines implements Zerofish {
  private lru = new Map<string, number>();

  constructor(private workers: Worker[]) {
    this.all('setoption name UCI_Chess960 value true');
    this.newGame();
  }

  get fish(): (uci: string) => void {
    return this.workers[0].fish;
  }

  async goFish(pos: Position, s: FishSearch): Promise<SearchResult> {
    return this.go(pos, {
      ...s,
      worker: this.workers[0],
      engine: 'fish',
    });
  }

  async goZero(pos: Position, s: ZeroSearch): Promise<SearchResult> {
    const index = this.lru.get(s.net.key) ?? (await this.getNet(s.net));
    this.lru.set(s.net.key, index);
    return this.go(pos, {
      multipv: s.multipv,
      by: { nodes: s.nodes ?? 1 },
      worker: this.workers[index],
      engine: 'zero',
    });
  }

  quit() {
    this.workers.forEach(w => w.quit());
  }

  stop() {
    this.all('stop');
  }

  async reset() {
    this.stop();
    this.newGame();
  }

  private newGame() {
    this.all('ucinewgame');
  }

  private all(uci: string) {
    this.fish(uci);
    this.workers.forEach(w => w.zero(uci));
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
    this.workers[netIndex].setZeroWeights(await net.fetch(net.key));
    return netIndex;
  }

  private go(pos: Position, { multipv, by, level, worker, engine }: SearchArgs): Promise<SearchResult> {
    const newLine = () => Array.from({ length: multipv }, () => ({ moves: [], score: 0 }));
    const sendUci = worker[engine];
    const listen = engine === 'fish' ? 'listenFish' : 'listenZero';
    const result: Line[][] = [];
    const { fen, moves } = pos;

    return new Promise<SearchResult>(async (resolve, reject) => {
      worker[listen] = (line: string) => {
        const tokens = line.split(' ');
        const numericValueOf = (field: string) => {
          const index = tokens.indexOf(field, 2);
          return index === -1 ? undefined : Number(tokens[index + 1]);
        };
        if (tokens[0] === 'bestmove') {
          worker[listen] = undefined;
          resolve({ bestmove: tokens[1], lines: result, engine });
        } else if (tokens[0] === 'info' && tokens[1] === 'depth') {
          while (result.length < Number(tokens[2])) result.push(newLine());

          const pvIndex = numericValueOf('multipv') ?? 1;
          const mate = numericValueOf('mate');
          const score = numericValueOf('cp') ?? (mate !== undefined ? (mate > 0 ? 10000 : -10000) : NaN);
          result[result.length - 1][pvIndex - 1] = { score, moves: tokens.slice(tokens.indexOf('pv') + 1) };
        }
      };
      sendUci(
        'position ' + (fen ? `fen ${fen}` : 'startpos') + (moves?.[0] ? ` moves ${moves.join(' ')}` : '')
      );
      sendUci(`setoption name multipv value ${multipv}`);
      if (engine === 'fish') sendUci(`setoption name skill level value ${level ?? 30}`);
      if ('movetime' in by) sendUci(`go movetime ${by.movetime}`);
      else if ('nodes' in by) sendUci(`go nodes ${by.nodes}`);
      else if ('depth' in by) sendUci(`go depth ${by.depth}`);
      else reject(`invalid search ${JSON.stringify(by)}`);
    });
  }
}
