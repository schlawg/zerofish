#include <mutex>
#include <queue>

namespace zerofish {

struct QuTex {
  std::mutex mutex;
  std::queue<std::string> q;
  bool empty = true;
  void push(std::string s) {
    std::lock_guard<std::mutex> lock(mutex);
    q.push(s);
    empty = false;
  }
  
  std::string pop() {
    //std::lock_guard<std::mutex> lock(mutex);
    std::string s = q.front();
    q.pop();
    if (q.empty()) empty = true;
    return s;
  }
};

inline QuTex fishOut;
inline QuTex zeroOut;

}