import * as readline from 'node:readline';
import * as fs from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// @ts-ignore
import createZerofish from '../zerofishEngine.js';

const zf = await createZerofish();

console.log('Syntax: <fish|zero> <uci-command> <args>');

zf.setZeroWeights(fs.readFileSync(`${__dirname}/../../wasm/weights.pb`));

readline
  .createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })
  .on('line', (line: string) => {
    if (line.startsWith('fish ')) zf.fish(line.slice(5));
    else if (line.startsWith('zero ')) zf.zero(line.slice(5));
    if (line === 'zerofish') console.log(zf);
  });
zf.listenFish.onmessage = (e: MessageEvent) => {
  console.log('fish: ', e.data);
};
zf.listenZero.onmessage = (e: MessageEvent) => {
  console.log('zero: ', e.data);
};
