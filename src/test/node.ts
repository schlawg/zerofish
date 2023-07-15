import * as readline from 'node:readline';
// @ts-ignore
import createLc0 from '../lc0.js';

const lc0 = await createLc0();

readline
  .createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })
  .on('line', (line: string) => lc0.uci(line));
lc0.listenPort.onmessage = (e: MessageEvent) => {
  console.log('got', e.data);
};

console.log('ready... ');

lc0.uci('uci');
lc0.uci('isready');
lc0.uci('setoption name Threads value 1');
lc0.uci('setoption name WeightsFile value weights.pb');
lc0.uci('position fen r1bqkb1r/pppppppp/4nQ2/4n3/6B1/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1');
