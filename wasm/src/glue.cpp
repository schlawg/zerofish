#include <emscripten.h>

#include "position.h"
#include "uci.h"
#include "thread.h"
#include "engine.h"
#include "glue.hpp"

enum Type { ZERO, FISH, QUIT};

template <typename T>
struct Item {
  Type type;
  T data;
  Item(Type type, T&& data) : type(type), data(std::move(data)) {}
};

template <typename T>
struct Qutex {

  std::mutex m;
  std::queue<Item<T>> q;
  std::condition_variable cv;

  void push(Type type, T&& data) {
    {
      std::unique_lock<std::mutex> lock(m);
      q.emplace(type, std::move(data));
    }
    cv.notify_one();
  }

  Item<T> pop() {
    std::unique_lock<std::mutex> lock(m);
    while (q.empty()) cv.wait(lock);
    Item<T> rsp = std::move(q.front());
    q.pop();
    return rsp;
  }
};

struct CommandIn {
  CommandIn() {}
  CommandIn(const char *uci) : uci(uci) {}
  CommandIn(const unsigned char *buf, size_t sz) : weightsBuffer(buf), weightsSize(sz) {}

  std::string uci;
  const unsigned char *weightsBuffer = nullptr;
  size_t weightsSize = 0;
};

Qutex<CommandIn> inQ;

void zerofish::zero_out(const char *str) {
  std::cout << "zero:" << str << std::endl;
}

void zerofish::fish_out(const char *str) {
  std::cout << "fish:" << str << std::endl;
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
  while(true) {
    auto cmd = inQ.pop();
    if (cmd.type == ZERO) {
      if (cmd.data.weightsBuffer) lc0.SetWeightsBuffer(cmd.data.weightsBuffer, cmd.data.weightsSize);
      else lc0.ProcessCommand(cmd.data.uci);
    }
    else if (cmd.type == FISH) Stockfish::UCI::process_command(cmd.data.uci, pos, states);
    else break;
  }
  Stockfish::Threads.set(0);
  return 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE void uci(const char *utf8, int isFish) {
  inQ.push(isFish ? FISH : ZERO, CommandIn(utf8));
}

extern "C" EMSCRIPTEN_KEEPALIVE void set_weights(const unsigned char *buf, size_t sz) {
  inQ.push(ZERO, CommandIn(buf, sz));
}

extern "C" EMSCRIPTEN_KEEPALIVE void quit() {
  emscripten_cancel_main_loop();
  inQ.push(QUIT, CommandIn());
}
