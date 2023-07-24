export interface SearchOpts {
  depth?: number;
  //nodes?: number;
  pvs?: number;
  ms?: number;
}

export type PV = { moves: string[]; score: number; depth: number };

export interface Zerofish {
  setZeroWeights: (weights: Uint8Array) => void;
  goZero: (fen: string) => Promise<string>;
  goFish: (fen: string, opts: SearchOpts) => Promise<PV[]>;
  stop: () => void;
  reset: () => void;
}

export default async function initModule({ urlBase } = { urlBase: '.' }): Promise<Zerofish> {
  //@ts-ignore
  const asset = await import(`${urlBase}/zerofishEngine.js`);
  const wasm = await asset.default();
  let gotWeights = false;

  return {
    setZeroWeights: (weights: Uint8Array) => {
      wasm.setZeroWeights(weights);
      gotWeights = true;
    },
    goZero: (fen: string) =>
      new Promise<string>((resolve, reject) => {
        if (!gotWeights) return reject('unitialized');
        wasm.listenZero.onmessage = (e: MessageEvent) => {
          if (!e.data.startsWith('bestmove')) return;
          wasm.listenZero.onmessage = null;
          resolve(e.data.split(' ')[1]);
        };
        wasm.zero(`position fen ${fen}`);
        wasm.zero(`go nodes 1`);
      }),
    stop: () => {
      if (gotWeights) wasm.zero('stop');
      wasm.fish('stop');
    },
    reset: (fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') => {
      wasm.fish(`position fen ${fen}`);
      wasm.fish('ucinewgame');
      if (!gotWeights) return;
      wasm.zero(`position fen ${fen}`);
      wasm.zero('ucinewgame');
    },
    goFish: (fen: string, opts: SearchOpts = {}) =>
      new Promise<PV[]>((resolve /*, reject*/) => {
        const numPvs = opts.pvs || 1;
        const depth = opts.depth || 12;
        const pvs: PV[] = Array.from({ length: opts.pvs || 1 }, () => ({ moves: [], score: 0, depth: 0 }));
        wasm.listenFish.onmessage = (e: MessageEvent) => {
          if (e.data.startsWith('bestmove')) resolve(pvs.slice());
          else if (e.data.startsWith('info')) {
            const info = e.data.split(' ');
            if (info[1] === 'depth')
              pvs[parseInt(info[6]) - 1] = {
                moves: info.slice(21),
                score: parseInt(info[9]),
                depth: parseInt(info[2]),
              };
          } else {
            console.warn(e.data);
            // reject(e.data); ?
          }
        };
        wasm.fish(`setoption name MultiPv value ${numPvs}`);
        wasm.fish(`position fen ${fen}`);
        if (opts.ms) wasm.fish(`go movetime ${opts.ms}`);
        else wasm.fish(`go depth ${depth}`);
      }),
  };
}
