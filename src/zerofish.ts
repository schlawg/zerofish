export interface SearchOpts {
  depth?: number;
  pvs?: number;
  ms?: number;
}

export interface ZerofishOpts {
  zeroWeightsUrl?: string;
  fishSearch?: SearchOpts;
}

export type PV = { moves: string[]; score: number; depth: number };

export interface Zerofish {
  setZeroWeights: (weights: Uint8Array) => void;
  goZero: (fen: string) => Promise<string>;
  goFish: (fen: string, opts?: SearchOpts) => Promise<PV[]>;
  quit: () => void;
  stop: () => void;
  reset: () => void;
  zero: (cmd: string) => void;
  fish: (cmd: string) => void;
}

export default async function initModule({ zeroWeightsUrl, fishSearch }: ZerofishOpts = {}): Promise<Zerofish> {
  const fetchWeights = zeroWeightsUrl ? fetch(zeroWeightsUrl) : Promise.resolve(undefined);
  //@ts-ignore
  const module = await import(`./zerofishEngine.js`);
  const wasm = await module.default();
  const weightsRsp = await fetchWeights;
  if (weightsRsp) wasm.setZeroWeights(new Uint8Array(await weightsRsp.arrayBuffer()));

  return {
    setZeroWeights: (weights: Uint8Array) => {
      wasm.setZeroWeights(weights);
      zeroWeightsUrl = '//';
    },
    goZero: (fen: string) =>
      new Promise<string>((resolve, reject) => {
        if (!zeroWeightsUrl) return reject('unitialized');
        wasm.listenZero = (msg: string) => {
          for (const line of msg.split('\n')) {
            if (line === '') continue;
            const tokens = line.split(' ');
            if (tokens[0] === 'bestmove') resolve(tokens[1]);
          }
        };
        wasm.zero(`position fen ${fen}\ngo nodes 1`);
      }),
    quit: () => {
      wasm.quit();
    },
    stop: () => {
      if (zeroWeightsUrl) wasm.zero('stop');
      wasm.fish('stop');
    },
    reset: () => {
      stop();
      wasm.fish('ucinewgame');
      if (zeroWeightsUrl) wasm.zero('ucinewgame');
    },
    goFish: (fen: string, opts = fishSearch) =>
      new Promise<PV[]>(resolve => {
        const numPvs = opts?.pvs || 1;
        const depth = opts?.depth || 12;
        const pvs: PV[] = Array.from({ length: opts?.pvs || 1 }, () => ({ moves: [], score: 0, depth: 0 }));
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
        wasm.fish(
          `setoption name MultiPv value ${numPvs}\nposition fen ${fen}\n` + opts?.ms
            ? `go movetime ${opts?.ms}`
            : `go depth ${depth}`
        );
      }),
    zero: wasm.zero,
    fish: wasm.fish,
  };
}
