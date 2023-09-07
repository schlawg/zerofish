# WTF is this

Just a toolkit to construct humanlike chess bots in the browser. You get stockfish classical and lc0. The lc0 can only handle maia (go nodes 1) weights.

# Usage

add zerofish to your project pnpm i zerofish

then do something fun, like this:
```
import makeZerofish from 'zerofish';

const zf = await makeZerofish({
  pbUrl: 'https://github.com/lichess-org/lifat/blob/master/bots/weights/maia-1500.pb',
});

// the simplest possible brilliant move detector that almost certainly will not work but why not try
async function isSmatMove(fen, move, isWhite) {
  const maiaMove = await zf.goZero(fen);
  const fishLines = await zf.goFish(fen, { pvs: 10, ms: 5000 });
  const playerLine = fishLines.find(line => line.moves[0] === move);
  const maiaLine = fishLines.find(line => line.moves[0] === maiaMove);
  return (
    playerLine &&
    maiaLine &&
    (isWhite ? playerLine.score > maiaLine.score : playerLine.score < maiaLine.score)
  );
}
```