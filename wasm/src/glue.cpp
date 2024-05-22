#include <emscripten.h>
#include <iostream>
#include <thread>
#include "glue.hpp"

#include "position.h"
#include "uci.h"
#include "thread.h"
#include "engine.h"

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
std::mutex outM;

void writeTo(const char *dest, const std::string& str) {
  std::unique_lock<std::mutex> lock(outM);
  for (size_t pos = 0, next = 0; pos < str.size() && next != std::string::npos; pos = next + 1) {
    next = str.find('\n', pos);
    std::cout << dest << ':' << str.substr(pos, next - pos) << std::endl;
  }
}

void zerofish::zero_out(const std::string& str) {
  writeTo("zero", str);
}

void zerofish::fish_out(const std::string& str) {
  writeTo("fish", str);
}

namespace PSQT {
  void init();
}

EMSCRIPTEN_KEEPALIVE int main() {
  UCI::init(Options);
  PSQT::init();
  Bitboards::init();
  Position::init();
  Bitbases::init();
  Endgames::init();
  Threads.set(4);
  Search::clear();
  Position pos;
  StateListPtr states(new std::deque<StateInfo>(1));
  pos.set(lczero::ChessBoard::kStartposFen, false, &states->back(), Threads.main());
  lczero::InitializeMagicBitboards();
  lczero::EngineLoop lc0;

  while(true) {
    auto cmd = inQ.pop();
    if (cmd.type == ZERO) {
      if (cmd.data.weightsBuffer) lc0.SetWeightsBuffer(cmd.data.weightsBuffer, cmd.data.weightsSize);
      else lc0.ProcessCommand(cmd.data.uci);
    }
    else if (cmd.type == FISH) UCI::process_command(cmd.data.uci, pos, states);
    else break;
  }
  Threads.set(0);
  return 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE void uci(const char *utf8, int isFish) {
  inQ.push(isFish ? FISH : ZERO, CommandIn(utf8));
}

extern "C" EMSCRIPTEN_KEEPALIVE void set_weights(const unsigned char *buf, size_t sz) {
  inQ.push(ZERO, CommandIn(buf, sz));
}

extern "C" EMSCRIPTEN_KEEPALIVE void quit() {
  inQ.push(QUIT, CommandIn());
}
