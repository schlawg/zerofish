export interface ZerofishOpts {
  net?: { name: string; url: string };
  search?: FishOpts;
}

export interface FishOpts {
  depth?: number;
  pvs?: number;
  ms?: number;
}

export type PV = { moves: string[]; score: number; depth: number };

export interface Zerofish {
  setNet: (name: string, weights: Uint8Array) => void;
  netName?: string;
  setSearch: (fishSearch: FishOpts) => void;
  goZero: (fen: string) => Promise<string>;
  goFish: (fen: string, opts?: FishOpts) => Promise<PV[]>;
  quit: () => void;
  stop: () => void;
  reset: () => void;
  zero: (cmd: string) => void;
  fish: (cmd: string) => void;
}

export default async function initModule({ net, search }: ZerofishOpts = {}): Promise<Zerofish> {
  const fetchWeights = net ? fetch(net.url) : Promise.resolve(undefined);
  const dontBundleMe = '.';
  const module = await import(`${dontBundleMe}/zerofishEngine.js`);
  const wasm = await module.default();
  const weightsRsp = await fetchWeights;
  if (weightsRsp) wasm.setZeroWeights(new Uint8Array(await weightsRsp.arrayBuffer()));

  return new (class implements Zerofish {
    netName?: string = net?.name;
    search?: FishOpts = search;
    zero = wasm.zero;
    fish = wasm.fish;

    setNet(name: string, weights: Uint8Array) {
      wasm.setZeroWeights(weights);
      this.netName = name;
    }
    setSearch(searchOpts: FishOpts) {
      this.search = searchOpts;
    }
    goZero(fen: string) {
      return new Promise<string>((resolve, reject) => {
        if (!this.netName) return reject('unitialized');
        wasm.listenZero = (msg: string) => {
          for (const line of msg.split('\n')) {
            if (line === '') continue;
            const tokens = line.split(' ');
            if (tokens[0] === 'bestmove') resolve(tokens[1]);
          }
        };
        wasm.zero(`position fen ${fen}`);
        wasm.zero(`go nodes 1`);
      });
    }
    quit() {
      wasm.quit();
    }
    stop() {
      if (this.netName) wasm.zero('stop');
      wasm.fish('stop');
    }
    reset() {
      stop();
      wasm.fish('ucinewgame');
      if (this.netName) wasm.zero('ucinewgame');
    }
    goFish(fen: string, opts = this.search) {
      return new Promise<PV[]>(resolve => {
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
        wasm.fish(`setoption name MultiPv value ${numPvs}`);
        wasm.fish(`position fen ${fen}`);
        if (opts?.ms) wasm.fish(`go movetime ${opts?.ms}`);
        else wasm.fish(`go depth ${depth}`);
      });
    }
  })();
}
