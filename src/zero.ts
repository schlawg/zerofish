// @ts-ignore
import createLc0 from './lc0.js';

export const makeZero = async () => {
  const lc0 = await createLc0();
  lc0.uci('setoption name Threads value 1');
  return {
    weights: (weights: string) => lc0.uci(`setoption name WeightsFile value ${weights}`),
    bestmove: (fen: string) =>
      new Promise((resolve, reject) => {
        lc0.listenPort.onmessage = (e: MessageEvent) => {
          if (e.data.startsWith('bestmove')) resolve(e.data.split(' ')[1]);
          else reject(e.data);
        };
        lc0.uci(`position fen ${fen}\ngo nodes 1`);
      }),
  };
};
