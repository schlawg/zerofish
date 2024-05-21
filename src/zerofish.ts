export interface ZerofishOpts {
  root?: string;
  wasm?: string;
  net?: { name: string; url: string };
  search?: FishOpts;
}

export interface FishOpts {
  elo?: number;
  level?: number;
  multiPv?: number;
  depth?: number;
  movetime?: number;
  nodes?: number;
}

export type Score = { moves: string[]; score: number; depth: number };

export interface Zerofish {
  setNet: (name: string, weights: Uint8Array) => void;
  netName?: string;
  setSearch: (fishSearch: FishOpts) => void;
  goZero: (fen: string) => Promise<string>;
  goFish: (fen: string, o?: FishOpts) => Promise<Score[][]>;
  quit: () => void;
  stop: () => void;
  reset: () => void;
  zero: (cmd: string) => void;
  fish: (cmd: string) => void;
}

export default async function initModule({ root, wasm, net, search }: ZerofishOpts = {}): Promise<Zerofish> {
  const module = await import(`${root ?? '.'}/zerofishEngine.js`);
  const params = wasm ? { locateFile: () => wasm } : {};
  const [zfe, weights] = await Promise.all([
    module.default(params),
    net ? fetch(net.url) : Promise.resolve(undefined),
  ]);
  const zf = new ZerofishWrapper(zfe);
  if (weights) zf.setNet(net!.name, new Uint8Array(await weights.arrayBuffer()));
  if (search) zf.setSearch(search);
  return zf;
}

class ZerofishWrapper implements Zerofish {
  netName?: string;
  search: FishOpts = { depth: 12 };
  zero = this.engine.zero;
  fish = this.engine.fish;

  constructor(private engine: any) {}

  goZero(fen: string, depth?: number) {
    return new Promise<string>((resolve, reject) => {
      if (!this.netName) return reject('unitialized');
      this.engine['listenZero'] = (msg: string) => {
        if (!msg) return;
        const tokens = msg.split(' ');
        if (tokens[0] === 'bestmove') resolve(tokens[1]);
      };
      this.engine.zero(`position fen ${fen}`);
      if (depth) this.engine.zero(`go depth ${depth}`);
      else this.engine.zero(`go nodes 1`);
    });
  }

  goFish(fen: string, o = this.search) {
    return new Promise<Score /* pv */[] /* depth */[]>(resolve => {
      const numPvs = o.multiPv ?? 1;
      const limited = !!o.elo || o.level !== undefined; // level can be 0
      const pvs: Score[][] = Array.from({ length: numPvs }, () => []);
      this.engine['listenFish'] = (line: string) => {
        const tokens = line.split(' ');
        const shiftParse = (field: string) => {
          while (tokens.length > 1) if (tokens.shift() === field) return parseInt(tokens.shift()!);
        };
        if (tokens[0] === 'bestmove') {
          if (pvs[0].length === 0) resolve([[{ moves: [tokens[1]], score: 0, depth: 0 }]]);
          else resolve(pvs.slice());
        } else if (tokens.shift() === 'info') {
          if (tokens.length < 7) return;
          const depth = shiftParse('depth')!;
          const byDepth: Score[] = pvs[shiftParse('multipv')! - 1];
          const score = shiftParse('cp')!;
          const moveIndex = tokens.indexOf('pv') + 1;

          if (depth > byDepth.length && moveIndex > 0)
            byDepth.push({
              moves: tokens.slice(moveIndex),
              score,
              depth,
            });
        } else console.warn('unknown line', line);
      };
      this.engine.fish(`setoption name UCI_LimitStrength value ${limited}`);
      this.engine.fish(`setoption name multipv value ${o.elo ? 1 : numPvs}`);
      if (o.elo) this.engine.fish(`setoption name UCI_Elo value ${o.elo}`);
      if (o.level !== undefined) this.engine.fish(`setoption name Skill Level value ${o.level}`);
      this.engine.fish(`position fen ${fen}`);
      if (o.movetime) this.engine.fish(`go movetime ${o.movetime}`);
      else if (o.depth) this.engine.fish(`go depth ${o.depth ?? 12}`);
      else if (o.nodes) this.engine.fish(`go nodes ${o.nodes}`);
      else this.engine.fish('go movetime 200');
    });
  }

  setNet(name: string, weights: Uint8Array) {
    this.engine.setZeroWeights(weights);
    this.netName = name;
  }

  setSearch(searchOpts: FishOpts) {
    this.search = searchOpts;
  }

  quit() {
    this.stop();
    this.engine.quit();
  }

  stop() {
    if (this.netName) this.engine.zero('stop');
    this.engine.fish('stop');
  }

  reset() {
    this.stop();
    this.engine.fish('ucinewgame');
    if (this.netName) this.engine.zero('ucinewgame');
  }
}
