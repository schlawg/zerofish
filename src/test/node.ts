import * as readline from "node:readline";
import * as fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));

// @ts-ignore
import createZerofish from "../zerofishEngine.js";

const zf = await createZerofish();
let history: string[] = [],
  index = 0;

console.log("Syntax: <fish|zero> <uci-command> <args>");

zf.setZeroWeights(
  fs.readFileSync(`${__dirname}/../../wasm/weights/badgyal-8.pb`)
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "",
  terminal: true,
});

rl.on("SIGINT", process.exit);
rl.on("line", (line: string) => {
  if (line === "1")
    zf.setZeroWeights(
      fs.readFileSync(`${__dirname}/../../wasm/weights/evilgyal-6.pb`)
    );
  else if (line === "2")
    zf.setZeroWeights(
      fs.readFileSync(`${__dirname}/../../wasm/weights/tinygyal-8.pb`)
    );
  else if (line === "3")
    zf.setZeroWeights(
      fs.readFileSync(`${__dirname}/../../wasm/weights/goodgyal-5.pb`)
    );
  else if (line === "4")
    zf.setZeroWeights(
      fs.readFileSync(`${__dirname}/../../wasm/weights/badgyal-8.pb`)
    );
  else if (line === "5")
    zf.setZeroWeights(
      fs.readFileSync(`${__dirname}/../../wasm/weights/t79-192x15.pb`)
    );
  else if (line.startsWith("fish ")) zf.fish(line.slice(5));
  else if (line.startsWith("zero ")) zf.zero(line.slice(5));
  if (line === "zerofish") console.log(zf);
});

process.stdin.on("keypress", (_, key) => {
  if (key.name === "up") {
    if (index < 1) return;
    rl.write(null, { ctrl: true, name: "u" });
    rl.write(history[--index]);
  } else if (key.name === "down") {
    if (index > history.length - 2) return;
    rl.write(null, { ctrl: true, name: "u" });
    rl.write(history[++index]);
  }
});

zf.listenFish.onmessage = (e: MessageEvent) => {
  console.log("fish: ", e.data);
};
zf.listenZero.onmessage = (e: MessageEvent) => {
  console.log("zero: ", e.data);
};
