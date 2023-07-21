const fishChannel = new MessageChannel();
const zeroChannel = new MessageChannel();

Module.listenFish = fishChannel.port1; // attach javascript listener here
Module.listenZero = zeroChannel.port1; // attach javascript listener here

Module._fishPort = fishChannel.port2; // used by c++
Module._zeroPort = zeroChannel.port2; // used by c++

Module.zero = cmd => Module.uci(cmd, false);
Module.fish = cmd => Module.uci(cmd, true);

Module.uci = (cmd, isFish) => {
  const utf8 = stringToNewUTF8(cmd);
  try {
    _uci(utf8, isFish);
  } catch (e) {
    console.error(e);
  }
  _free(utf8);
};

Module.setZeroWeights = (weights /*: Uint8Array*/) => {
  const heapWeights = Module._malloc(weights.byteLength);
  if (!heapWeights) throw new Error(`Could not allocate ${weights.byteLength} bytes`);
  Module.HEAPU8.set(weights, heapWeights);
  _set_weights(heapWeights, weights.byteLength);
  _free(heapWeights);
};

Module.print = cout => console.info(cout);
Module.printErr = cerr => console.warn(cerr);
Module._exception = x => {
  console.error(x);
  // do something exceptional here since the emscripted c++ can't catch these.
};
