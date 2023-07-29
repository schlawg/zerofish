FROM emscripten/emsdk:3.1.43
WORKDIR /zf
COPY wasm/*.patch wasm/fetchSources.sh .
RUN ./fetchSources.sh
COPY wasm/Makefile src/emscripten/* .
RUN make -j$(grep -c ^processor /proc/cpuinfo) && mkdir dist && mv zerofishEngine.* dist
