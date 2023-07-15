const lc0Channel = new MessageChannel();

Module.listenPort = lc0Channel.port1;
Module.sendPort = lc0Channel.port2;

Module.uci = cmd => {
  const utf8 = stringToNewUTF8(cmd);
  try {
    _process_command(utf8);
  } catch (e) {
    console.error(e);
  } finally {
    _free(utf8);
  }
};

Module.print = cout => Module.sendPort.postMessage(cout);
Module.printErr = cerr => console.info(cerr);
Module.exception = x => {
  console.error(x);
  // do something exceptiony here since we can't catch these
};
