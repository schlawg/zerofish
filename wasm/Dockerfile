FROM emscripten/emsdk as setup
RUN apt-get update && apt-get install -y ninja-build && pip3 install "meson==1.1.1"

FROM setup as source
WORKDIR /zf
COPY wasm/lc0.patch wasm/stockfish.patch .
RUN  git clone -b v0.29.0 --depth 1 https://github.com/LeelaChessZero/lc0 \
  && git -C lc0 apply -v /zf/lc0.patch \
  && git clone -b sf_16 --depth 1 https://github.com/official-stockfish/Stockfish \
  && git -C Stockfish apply -v /zf/stockfish.patch;

FROM source as build
COPY src/emscripten/* wasm/lc0.crossfile .
RUN bash -c "/zf/lc0/build.sh --cross-file=/zf/lc0.crossfile -Dgtest=false --default-library=static"
WORKDIR /zf/Stockfish/src
COPY wasm/stockfish.Makefile Makefile
RUN  make \
  && mkdir /dist \
  && mv stockfish.* /dist \
  && cd /zf/lc0/build/release \
  && mv lc0.js lc0.wasm lc0.worker.js /dist \
  && cat /zf/lc0/build/release/meson-logs/meson-log.txt >> /dist/lc0.log
