FROM emscripten/emsdk
RUN apt-get update && apt-get install -y ninja-build
RUN pip3 install meson

WORKDIR /
RUN git clone -b v0.29.0 --depth 1 https://github.com/LeelaChessZero/lc0
RUN git clone -b sf_16 --depth 1 https://github.com/official-stockfish/Stockfish
COPY src/emscripten/* .
WORKDIR /lc0
COPY build/emccCross.txt .
ADD build/lc0.patch /tmp
RUN git apply -v /tmp/lc0.patch
RUN bash -c "./build.sh -Dgtest=false --cross-file=emccCross.txt --default-library=static"
RUN mv build/release/lc0.wasm /lc0.wasm
RUN mv build/release/lc0.js /lc0.js
RUN mv build/release/lc0.worker.js /lc0.worker.js

WORKDIR /Stockfish
ADD build/stockfish.patch /tmp
RUN git apply -v /tmp/stockfish.patch
WORKDIR /Stockfish/src
COPY build/stockfish.Makefile Makefile
RUN make
RUN mv stockfish.wasm /stockfish.wasm
RUN mv stockfish.js /stockfish.js
RUN mv stockfish.worker.js /stockfish.worker.js
