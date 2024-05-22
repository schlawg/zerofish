export interface ZerofishOpts {
  root?: string;
  wasm?: string;
  net?: { name: string; url: string };
  search?: FishSearch;
}

export interface FishSearch {
  elo?: number;
  level?: number;
  multiPv?: number;
  depth?: number;
  movetime?: number;
  nodes?: number;
}

export interface Position {
  fen?: string;
  moves?: string[];
}

export type Score = { moves: string[]; score: number; depth: number };

export class Zerofish {
  netName?: string;
  search: FishSearch = { depth: 12 };
  zero = this.engine.zero;
  fish = this.engine.fish;

  constructor(private engine: any) {
    this.engine.fish('setoption name Hash value 1');
    this.engine.fish('ucinewgame');
    if (this.netName) this.engine.zero('ucinewgame');
  }

  goZero(pos: Position, depth?: number) {
    return new Promise<string>((resolve, reject) => {
      if (!this.netName) return reject('unitialized');
      this.engine['listenZero'] = (msg: string) => {
        if (!msg) return;
        const tokens = msg.split(' ');
        if (tokens[0] === 'bestmove') resolve(tokens[1]);
      };
      this.position(pos, this.engine.zero);
      if (depth) this.engine.zero(`go depth ${depth}`);
      else this.engine.zero(`go nodes 1`);
    });
  }

  goFish(pos: Position, o = this.search) {
    return new Promise<Score /* pv */[] /* depth */[]>(resolve => {
      const numPvs = o.multiPv ?? 1;
      const pvs: Score[][] = Array.from({ length: numPvs }, () => []);
      this.engine['listenFish'] = (line: string) => {
        const tokens = line.split(' ');
        const shiftParse = (field: string) => {
          while (tokens.length > 1) if (tokens.shift() === field) return parseInt(tokens.shift()!);
        };
        if (tokens[0] === 'bestmove') {
          const choice = pvs.findIndex(pv => pv.length > 0 && pv[0].moves[0] === tokens[1]);
          if (choice === -1) pvs[0] = [{ moves: [tokens[1]], score: 0, depth: 0 }];
          else if (choice > 0) [pvs[0], pvs[choice]] = [pvs[choice], pvs[0]];
          resolve(pvs);
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
      this.engine.fish(`setoption name UCI_LimitStrength value ${!!o.elo}`);
      if (o.elo) this.engine.fish(`setoption name UCI_Elo value ${o.elo}`);
      if (o.level !== undefined) this.engine.fish(`setoption name Skill Level value ${o.level}`);
      if (o.multiPv) this.engine.fish(`setoption name multipv value ${o.multiPv}`);
      this.position(pos, this.engine.fish);
      if (o.movetime) this.engine.fish(`go movetime ${o.movetime}`);
      else if (o.nodes) this.engine.fish(`go nodes ${o.nodes}`);
      else this.engine.fish(`go depth ${o.depth ?? 1}`);
    });
  }

  setNet(name: string, weights: Uint8Array) {
    this.engine.setZeroWeights(weights);
    this.netName = name;
  }

  setSearch(searchOpts: FishSearch) {
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

  private position({ fen, moves }: Position, engine: any) {
    engine(
      'position ' + (fen ? `fen ${fen}` : 'startpos') + (moves && moves[0] ? ` moves ${moves.join(' ')}` : '')
    );
  }
}

export default async function initModule({ root, wasm, net, search }: ZerofishOpts = {}): Promise<Zerofish> {
  const module = await import(`${root ?? '.'}/zerofishEngine.js`);
  const params = wasm ? { locateFile: () => wasm } : {};
  const [zfe, weights] = await Promise.all([
    module.default(params),
    net ? fetch(net.url) : Promise.resolve(undefined),
  ]);
  const zf = new Zerofish(zfe);
  if (weights) zf.setNet(net!.name, new Uint8Array(await weights.arrayBuffer()));
  if (search) zf.setSearch(search);
  return zf;
}
