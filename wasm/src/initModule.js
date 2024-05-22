Module['listenFish'] = rsp => console.log('fish:', rsp); // attach listener here
Module['listenZero'] = rsp => console.log('zero:', rsp); // attach listener here
Module['zero'] = cmd => uci(cmd, false);
Module['fish'] = cmd => uci(cmd, true);

Module['setZeroWeights'] = (weights /*: Uint8Array*/) => {
  const heapWeights = _malloc(weights.byteLength); // deallocated in lc0/src/engine.cc
  if (!heapWeights) throw new Error(`Could not allocate ${weights.byteLength} bytes`);
  Module['HEAPU8'].set(weights, heapWeights);
  _set_weights(heapWeights, weights.byteLength);
};

Module['print'] = cout => {
  if (cout.startsWith('zero:')) Module['listenZero'](cout.slice(5));
  else if (cout.startsWith('fish:')) Module['listenFish'](cout.slice(5));
  else console.info(cout);
};

Module['printErr'] = cerr => console.error(cerr);

function uci(cmd, isFish) {
  const sz = lengthBytesUTF8(cmd) + 1;
  const utf8 = _malloc(sz);
  if (!utf8) throw new Error(`Could not allocate ${sz} bytes`);
  stringToUTF8(cmd, utf8, sz);
  _uci(utf8, isFish);
  _free(utf8);
}
