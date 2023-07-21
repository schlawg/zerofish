import * as readline from 'node:readline';
import * as fs from 'node:fs';

// @ts-ignore
import createZerofish from '../zerofishWasm.js';

const zf = await createZerofish();

console.log('Syntax: <fish|zero> <uci-command> <args>');
readline
  .createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })
  .on('line', (line: string) => {
    if (line.startsWith('fish ')) zf.fish(line.slice(5));
    else if (line.startsWith('zero')) zf.zero(line.slice(5));
  });
zf.listenFish.onmessage = (e: MessageEvent) => {
  console.log('fish: ', e.data);
};
zf.listenZero.onmessage = (e: MessageEvent) => {
  console.log('zero: ', e.data);
};
