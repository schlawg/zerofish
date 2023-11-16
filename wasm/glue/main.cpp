#include <emscripten.h>

#include "position.h"
#include "uci.h"
#include "thread.h"
#include "engine.h"
#include "qutex.hpp"

struct CommandIn {
  CommandIn() {}
  CommandIn(const char *uci, bool isFish) : uci(uci), isFish(isFish) {}
  CommandIn(const unsigned char *buf, size_t sz) : weightsBuffer(buf), weightsSize(sz) {}

  bool isFish = true;
  std::string uci;
  const unsigned char *weightsBuffer = nullptr;
  size_t weightsSize = 0;
};

zerofish::Qutex<CommandIn> inQ;

EM_JS(void, zero_post, (const char *str), {
  Module.listenZero?.(UTF8ToString(str));
});

EM_JS(void, fish_post, (const char *str), {
  Module.listenFish?.(UTF8ToString(str));
});

extern "C" void response_fire() {
  zerofish::fishOut.fire(fish_post);
  zerofish::zeroOut.fire(zero_post);
}

EMSCRIPTEN_KEEPALIVE int main() {
  Stockfish::UCI::init(Stockfish::Options);
  Stockfish::PSQT::init();
  Stockfish::Bitboards::init();
  Stockfish::Position::init();
  Stockfish::Bitbases::init();
  Stockfish::Endgames::init();
  Stockfish::Threads.set(4);
  Stockfish::Position pos;
  Stockfish::StateListPtr states(new std::deque<Stockfish::StateInfo>(1));
  pos.set("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", false, &states->back(), Stockfish::Threads.main());
  lczero::InitializeMagicBitboards();
  lczero::EngineLoop lc0;
  emscripten_set_main_loop(response_fire, 0, 1);
  while(true) {
    auto cmd = inQ.pop();
    if (cmd.weightsBuffer) lc0.SetWeightsBuffer(cmd.weightsBuffer, cmd.weightsSize);
    else if (!cmd.uci.empty()) {
      if (cmd.isFish) Stockfish::UCI::process_command(cmd.uci, pos, states);
      else lc0.ProcessCommand(cmd.uci);
    }
    else break;
  }
  Stockfish::Threads.set(0);
  return 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE void uci(const char *utf8, int isFish) {
  inQ.push(CommandIn(utf8, isFish != 0));
}

extern "C" EMSCRIPTEN_KEEPALIVE void set_weights(const unsigned char *buf, size_t sz) {
  inQ.push(CommandIn(buf, sz));
}

extern "C" EMSCRIPTEN_KEEPALIVE void quit() {
  emscripten_cancel_main_loop();
  inQ.push(CommandIn());
}
