#include <emscripten.h>

#include "position.h"
#include "uci.h"
#include "thread.h"
#include "engine.h"
#include "qutex.hpp"

const char *DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
lczero::EngineLoop *lc0 = nullptr;
Stockfish::Position *pos = nullptr;
Stockfish::StateListPtr states(new std::deque<Stockfish::StateInfo>(1));

EM_JS(void, zero_post, (const char *str), {
  Module._zeroPort.postMessage(UTF8ToString(str));
});

EM_JS(void, fish_post, (const char *str), {
  Module._fishPort.postMessage(UTF8ToString(str));
});

extern "C" void wasmLoop() {
  using namespace zerofish;
  auto fire = [](QuTex &qutex, void (*post)(const char *)) {
    std::string all;
    {
      std::lock_guard<std::mutex> lock(qutex.mutex);
      while (!qutex.empty) {
        all += qutex.pop();
        if (*all.rbegin() != '\n') all += '\n';
      }
    }
    post(all.c_str());
  };
  if (!fishOut.empty) fire(fishOut, fish_post);
  if (!zeroOut.empty) fire(zeroOut, zero_post);
}

EMSCRIPTEN_KEEPALIVE int main() {
  Stockfish::UCI::init(Stockfish::Options);
  Stockfish::PSQT::init();
  Stockfish::Bitboards::init();
  Stockfish::Position::init();
  Stockfish::Bitbases::init();
  Stockfish::Endgames::init();
  Stockfish::Threads.set(6);
  Stockfish::Search::clear(); // After threads are up
  pos = new Stockfish::Position();
  pos->set(DEFAULT_FEN, false, &states->back(), Stockfish::Threads.main());
  lczero::InitializeMagicBitboards();
  lc0 = new lczero::EngineLoop();
  emscripten_set_main_loop(wasmLoop, 0, 1);
  return 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE void uci(const char *utf8, int isFish) {
  if (isFish) Stockfish::UCI::process_command(utf8, *pos, states);
  else lc0->ProcessCommand(utf8);
}

extern "C" EMSCRIPTEN_KEEPALIVE void set_weights(const unsigned char *buf, size_t sz) {
  lc0->SetWeightsBuffer(buf, sz);
}

extern "C" EMSCRIPTEN_KEEPALIVE void quit() {
  emscripten_cancel_main_loop();
}
