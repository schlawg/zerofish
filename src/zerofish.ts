export interface ZerofishOpts {
  root?: string;
  wasm?: string;
  maxZeros?: number;
}

export interface FishSearch {
  level?: number;
  multiPv?: number;
  depth?: number;
  movetime?: number;
  nodes?: number;
}

export interface ZeroNet {
  name: string;
  fetch: (name?: string) => Promise<Uint8Array>;
}

export interface ZeroSearch {
  depth?: number;
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

type Worker = any;

export class Zerofish {
  private lru = new Map<string, number>();

  constructor(private workers: Worker[]) {
    this.fish('setoption name Hash value 1');
    this.fish('ucinewgame');
  }

  get fish(): Worker {
    return this.workers[0].fish;
  }

  goZero(pos: Position, { depth, net }: ZeroSearch): Promise<SearchResult> {
    return new Promise<SearchResult>(async (resolve, reject) => {
      const netIndex = this.lru.get(net.name) ?? (await this.getNet(net));
      this.lru.set(net.name, netIndex);
      const engine = this.workers[netIndex];
      engine['listenZero'] = (msg: string) => {
        const tokens = msg.split(' ');
        if (tokens[0] === 'bestmove') resolve({ bestmove: tokens[1], pvs: [], engine: 'zero' });
      };
      sendPosition(pos, engine.zero);
      if (depth) engine.zero(`go depth ${depth}`);
      else engine.zero(`go nodes 1`);
    });
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
    return new Promise<number>(async resolve => {
      console.log(this.workers.length, this.lru.size, netIndex, net.name);
      this.workers[netIndex].setZeroWeights(await net.fetch(net.name));
      this.workers[netIndex].zero('ucinewgame');
      this.workers[netIndex].listenZero = (msg: string) => {
        if (msg === 'readyok') resolve(netIndex);
      };
      this.workers[netIndex].zero('isready');
    });
  }

  goFish(pos: Position, { level, multiPv, depth, movetime, nodes }: FishSearch = {}): Promise<SearchResult> {
    return new Promise<SearchResult>(resolve => {
      multiPv ??= 1;
      depth ??= 12;
      const pvs: Line[] = Array.from({ length: multiPv }, () => ({
        moves: [],
        scores: [],
      }));
      this.workers[0]['listenFish'] = (line: string) => {
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
      if (level !== undefined) this.fish(`setoption name Skill Level value ${level}`);
      this.fish(`setoption name multipv value ${multiPv}`);
      sendPosition(pos, this.fish);
      if (movetime) this.fish(`go movetime ${movetime}`);
      else if (nodes) this.fish(`go nodes ${nodes}`);
      else this.fish(`go depth ${depth}`);
    });
  }

  quit() {
    this.stop();
    for (const w of this.workers) w.quit();
  }

  stop() {
    this.fish('stop');
    for (const i of this.lru.values()) this.workers[i].zero('stop');
  }

  reset() {
    this.stop();
    this.fish('ucinewgame');
    for (const i of this.lru.values()) this.workers[i].zero('ucinewgame');
  }
}

export default async function initModule({ root, wasm, maxZeros }: ZerofishOpts = {}): Promise<Zerofish> {
  const module = await import(`${root ?? '.'}/zerofishEngine.js`);
  const enginePromises = Array.from({ length: maxZeros ?? 1 }, () =>
    module.default({ locateFile: wasm ? () => wasm : undefined, noInitialRun: true })
  );
  const engines = await Promise.all(enginePromises);
  engines[0].callMain(['4']); // 4 fish threads on main engine
  engines.slice(1).forEach(engine => engine.callMain(['-1'])); // no fish on the others
  return new Zerofish(engines);
}

function sendPosition({ fen, moves }: Position, engine: any) {
  engine(
    'position ' + (fen ? `fen ${fen}` : 'startpos') + (moves && moves[0] ? ` moves ${moves.join(' ')}` : '')
  );
}
