export interface SearchOpts {
  depth?: number;
  //nodes?: number;
  pvs?: number;
  ms?: number;
}

export interface ZerofishOpts {
  weightsUrl?: string;
}

export type PV = { moves: string[]; score: number; depth: number };

export interface Zerofish {
  setZeroWeights: (weights: Uint8Array) => void;
  goZero: (fen: string) => Promise<string>;
  goFish: (fen: string, opts: SearchOpts) => Promise<PV[]>;
  quit: () => void;
  stop: () => void;
  reset: () => void;
  zero: (cmd: string) => void;
  fish: (cmd: string) => void;
}

export default async function initModule({ weightsUrl }: ZerofishOpts = {}): Promise<Zerofish> {
  const fetchWeights = weightsUrl ? fetch(weightsUrl) : Promise.resolve(undefined);
  //@ts-ignore
  const asset = await import(`./zerofishEngine.js`);
  const wasm = await asset.default();
  const weights = await fetchWeights;
  if (weights) wasm.setZeroWeights(new Uint8Array(await weights.arrayBuffer()));

  return {
    setZeroWeights: (weights: Uint8Array) => {
      wasm.setZeroWeights(weights);
    },
    goZero: (fen: string) =>
      new Promise<string>((resolve, reject) => {
        if (!weights) return reject('unitialized');
        wasm.listenZero = (msg: string) => {
          for (const line of msg.split('\n')) {
            if (line === '') continue;
            const tokens = line.split(' ');
            if (tokens[0] === 'bestmove') resolve(tokens[1]);
          }
        };
        wasm.zero(`position fen ${fen}`);
        wasm.zero(`go nodes 1`);
      }),
    quit: () => {
      wasm.quit();
    },
    stop: () => {
      if (weights) wasm.zero('stop');
      wasm.fish('stop');
    },
    reset: () => {
      stop();
      wasm.fish('ucinewgame');
      if (weights) wasm.zero('ucinewgame');
    },
    goFish: (fen: string, opts: SearchOpts = {}) =>
      new Promise<PV[]>(resolve => {
        const numPvs = opts.pvs || 1;
        const depth = opts.depth || 12;
        const pvs: PV[] = Array.from({ length: opts.pvs || 1 }, () => ({ moves: [], score: 0, depth: 0 }));
        wasm.listenFish = (msg: string) => {
          for (const line of msg.split('\n')) {
            if (line === '') continue;
            const tokens = line.split(' ');
            if (tokens[0] === 'bestmove') resolve(pvs.slice());
            else if (tokens[0] === 'info') {
              pvs[parseInt(tokens[6]) - 1] = {
                moves: tokens.slice(21),
                score: parseInt(tokens[9]),
                depth: parseInt(tokens[2]),
              };
            } else console.warn('unknown line', line);
          }
        };
        wasm.fish(`setoption name MultiPv value ${numPvs}`);
        wasm.fish(`position fen ${fen}`);
        if (opts.ms) wasm.fish(`go movetime ${opts.ms}`);
        else wasm.fish(`go depth ${depth}`);
      }),
    zero: wasm.zero,
    fish: wasm.fish,
  };
}
