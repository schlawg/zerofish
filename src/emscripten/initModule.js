const coutChannel = new MessageChannel();

Module.listenPort = coutChannel.port1;
Module.sendPort = coutChannel.port2;

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
