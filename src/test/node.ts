import * as readline from 'node:readline';
import * as fs from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// @ts-ignore
import createZerofish from '../zerofishEngine.js';

const zf = await createZerofish();

console.log('Syntax: <fish|zero> <uci-command> <args>');

zf.setZeroWeights(fs.readFileSync(`${__dirname}/../../wasm/go-nodes-0.pb`));

readline
  .createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })
  .on('line', (line: string) => {
    if (line === '1') zf.setZeroWeights(fs.readFileSync(`${__dirname}/../../wasm/weights/evilgyal-6.pb`));
    else if (line === '2')
      zf.setZeroWeights(fs.readFileSync(`${__dirname}/../../wasm/weights/tinygyal-8.pb`));
    else if (line === '3')
      zf.setZeroWeights(fs.readFileSync(`${__dirname}/../../wasm/weights/goodgyal-5.pb`));
    else if (line === '4') zf.setZeroWeights(fs.readFileSync(`${__dirname}/../../wasm/weights/badgyal-8.pb`));
    else if (line === '5')
      zf.setZeroWeights(fs.readFileSync(`${__dirname}/../../wasm/weights/t79-192x15.pb`));
    else if (line.startsWith('fish ')) zf.fish(line.slice(5));
    else if (line.startsWith('zero ')) zf.zero(line.slice(5));
    if (line === 'zerofish') console.log(zf);
  });
zf.listenFish.onmessage = (e: MessageEvent) => {
  console.log('fish: ', e.data);
};
zf.listenZero.onmessage = (e: MessageEvent) => {
  console.log('zero: ', e.data);
};
