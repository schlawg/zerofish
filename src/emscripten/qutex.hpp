#include <mutex>
#include <queue>

namespace zerofish {

template <typename T>
struct Qutex {

  std::mutex m;
  std::queue<T> q;
  std::condition_variable cv;

  void push(T el) {
    std::unique_lock<std::mutex> lock(m);
    q.push(el);
    lock.unlock();
    cv.notify_one();
  }

  T pop() {
    std::unique_lock<std::mutex> lock(m);
    while (q.empty()) cv.wait(lock);
    T el = std::move(q.front());
    q.pop();
    return el;
  }

  std::string unwrap() {
    std::unique_lock<std::mutex> lock(m);
    std::string all;
    while (!q.empty()) {
      all += q.front();
      q.pop();
      if (*all.rbegin() != '\n') all += '\n';
    }
    return all;
  }

  void fire(void (*post)(const char *)) {
    std::string all = std::move(unwrap());
    if (all.empty()) return;
    post(all.c_str());
  };
};

inline Qutex<std::string> fishOut;
inline Qutex<std::string> zeroOut;

}