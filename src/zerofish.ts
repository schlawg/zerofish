export interface ZerofishOpts {
  root?: string;
  wasm?: string;
  dev?: boolean;
}

export interface Search {
  depth?: number;
  movetime?: number;
  nodes?: number;
}

export interface FishSearch {
  level?: number;
  multipv?: number;
  search: Search;
}

export interface ZeroNet {
  name: string;
  fetch: (name?: string) => Promise<Uint8Array>;
}

export interface ZeroSearch {
  net: ZeroNet;
  search?: Search;
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

type Worker = any;

export default async function initModule({ root, wasm, dev }: ZerofishOpts = {}): Promise<Zerofish> {
  const module = await import(`${root ?? '.'}/zerofishEngine.js`);
  const enginePromises = Array.from({ length: dev ? 2 : 1 }, () =>
    module.default({
      locateFile: wasm ? () => wasm : undefined,
      noInitialRun: true,
    })
  );
  const engines = await Promise.all(enginePromises);
  engines[0].callMain(['4']); // 4 fish threads on main engine
  if (dev) engines[1].callMain(['1']);
  return new Zerofish(engines);
}

export class Zerofish {
  private lru = new Map<string, number>();

  constructor(private workers: Worker[]) {
    this.fish('setoption name Hash value 8');
    this.fish('ucinewgame');
  }

  get fish(): Worker {
    return (cmd: string, index: number = 0) => {
      if (index >= this.workers.length) index = 0;
      this.workers[index].fish(cmd);
    };
  }

  goZero(pos: Position, { search, net }: ZeroSearch): Promise<SearchResult> {
    return new Promise<SearchResult>(async (resolve, reject) => {
      const netIndex = this.lru.get(net.name) ?? (await this.getNet(net));
      this.lru.set(net.name, netIndex);
      const engine = this.workers[netIndex];
      engine['listenZero'] = (msg: string) => {
        const tokens = msg.split(' ');
        if (tokens[0] === 'bestmove') resolve({ bestmove: tokens[1], pvs: [], engine: 'zero' });
      };
      sendPosition(pos, engine.zero);
      sendGo(search ?? { nodes: 1 }, engine.zero, reject);
    });
  }

  goFish(pos: Position, { level, multipv, search }: FishSearch, index = 0): Promise<SearchResult> {
    const { depth, movetime, nodes } = search;
    if (index >= this.workers.length) index = 0;
    multipv ??= level !== undefined ? 4 : 1;
    const pvs: Line[] = Array.from({ length: multipv }, () => ({
      moves: [],
      scores: [],
    }));
    return new Promise<SearchResult>((resolve, reject) => {
      this.workers[index]['listenFish'] = (line: string) => {
        const tokens = line.split(' ');
        const shiftParse = (field: string) => {
          while (tokens.length > 1) if (tokens.shift() === field) return parseInt(tokens.shift()!);
        };
        if (tokens[0] === 'bestmove') {
          resolve({
            bestmove: tokens[1],
            pvs: pvs.find(pv => pv.moves[0] === tokens[1]) ? pvs : [{ moves: [tokens[1]], scores: [0] }],
            engine: 'fish',
          });
        } else if (tokens.shift() === 'info') {
          if (tokens.length < 7) return;
          const scoreDepth = shiftParse('depth')!;
          const pv: Line = pvs[shiftParse('multipv')! - 1];
          const score = shiftParse('cp')!;
          const moveIndex = tokens.indexOf('pv') + 1;

          if (scoreDepth > pv.moves.length && moveIndex > 0) {
            pv.moves = tokens.slice(moveIndex);
            pv.scores.push(score);
          }
        } else console.warn('unknown line', line);
      };
      if (level !== undefined) this.fish(`setoption name skill level value ${level}`, index);
      this.fish(`setoption name multipv value ${multipv}`, index);
      sendPosition(pos, (cmd: string) => this.fish(cmd, index));
      sendGo(search, (cmd: string) => this.fish(cmd, index), reject);
    });
  }

  quit() {
    this.stop();
    for (const w of this.workers) w.quit();
  }

  stop() {
    for (const w of this.workers) {
      w.fish('stop');
      w.zero('stop');
    }
  }

  reset() {
    this.stop();
    for (const w of this.workers) {
      w.fish('ucinewgame');
      w.zero('ucinewgame');
    }
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
}

function sendGo(search: Search, engine: any, reject: (reason: any) => void) {
  if (search.movetime) engine(`go movetime ${search.movetime}`);
  else if (search.nodes) engine(`go nodes ${search.nodes}`);
  else if (search.depth) engine(`go depth ${search.depth}`);
  else reject(`invalid search ${JSON.stringify(search)}`);
}

function sendPosition({ fen, moves }: Position, engine: any) {
  engine(
    'position ' + (fen ? `fen ${fen}` : 'startpos') + (moves && moves[0] ? ` moves ${moves.join(' ')}` : '')
  );
}
