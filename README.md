# zerofish

Just a toolkit to construct chess bots in the browser. You get stockfish classical and lc0.
LC0 uses CPU (OpenBLAS/eigen) so only low block/filter sizes like https://github.com/dkappe/leela-chess-weights/wiki/Bad-Gyal can be used.

## Installation

```bash
npm install @lichess-org/zerofish
```

## Usage

See lila source code for example usage.

## Development Setup

### Prerequisites

1. Install emscripten ([instructions](https://emscripten.org/docs/getting_started/downloads.html#))

```bash
# verify
emcc --version
```

### Build

```bash
npm install
npm run build
```

### Format

```bash
npm run format
```

### Test

Download the weights:

```bash
mkdir -p wasm/weights
wget -O wasm/weights/evilgyal-6.pb.gz https://github.com/dkappe/leela-chess-weights/files/3468575/evilgyal-6.pb.gz
wget -O wasm/weights/tinygyal-8.pb.gz https://github.com/dkappe/leela-chess-weights/files/4432261/tinygyal-8.pb.gz
wget -O wasm/weights/goodgyal-5.pb.gz https://github.com/dkappe/leela-chess-weights/files/3422292/goodgyal-5.pb.gz
wget -O wasm/weights/badgyal-8.pb.gz https://github.com/dkappe/leela-chess-weights/files/3799966/badgyal-8.pb.gz
gunzip wasm/weights/*.gz
```

```bash
npm run test

# in the console, you can run commands like:

> fish isready
> zero isready

> fish go depth 1
> zero go depth 1

# and any other uci commands
```
