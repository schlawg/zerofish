#!/usr/bin/env bash

function main() {
  cd $(dirname "${BASH_SOURCE:-$0}")
  processArgs "$@"

  CXX_FLAGS=(
    "${OPT_FLAGS[@]}"
    -Wall
    -std=c++17
    -pthread
    -msse
    -msse2
    -mssse3
    -msse4.1
    -msimd128
    -D__i386__
    -DEIGEN_NO_CPUID
    -DEIGEN_DONT_VECTORIZE
    -DUSE_SSE2
    -DUSE_SSE41
    -DUSE_POPCNT
  )
  LD_FLAGS=(
    "${CXX_FLAGS[@]}"
    --pre-js=/zf/initModule.js
    -sEXPORTED_FUNCTIONS=['_free']
    -sINITIAL_MEMORY=256MB
    -sSTACK_SIZE=512KB
    -sEXPORT_ES6
    -sMODULARIZE
    -sENVIRONMENT=web,node
  )
  LC0_LD_FLAGS=(${LD_FLAGS[@]} -sPTHREAD_POOL_SIZE=1)
  STOCKFISH_LD_FLAGS=(${LD_FLAGS[@]} -sPTHREAD_POOL_SIZE=8)

  makeLc0Crossfile
  makeStockfishMakefile

  docker rm -f zerofish > /dev/null
  docker rmi -f zerofish${LOCAL:+-local}-img > /dev/null
  docker build -t zerofish${LOCAL:+-local}-img -f Dockerfile${LOCAL:+.local} \
         ${LOCAL:+--progress=plain} ${FORCE:+--no-cache} ..
  docker run --name zerofish zerofish${LOCAL:+-local}-img

  cd ..
  docker cp zerofish:/dist/. dist # retrieve the goodies
  
  maybeCreateRequire dist/lc0.js true
  maybeCreateRequire dist/lc0.worker.js
  maybeCreateRequire dist/stockfish.js
  maybeCreateRequire dist/stockfish.worker.js
}

function makeLc0Crossfile() {
  cat > lc0.crossfile<<EOL
  [binaries]
  cpp = 'emcc'
  [host_machine]
  system = 'emscripten'
  cpu_family = 'wasm'
  cpu = 'wasm'
  endian = 'little'
  [built-in options]
  cpp_args = $(mesonArray "${CXX_FLAGS[@]}")
  cpp_link_args = $(mesonArray "${LC0_LD_FLAGS[@]}")
EOL
}

function makeStockfishMakefile() { # holy hell do i hate makefiles
  cat > stockfish.Makefile<<EOL
  EXE = stockfish.js

  SRCS = benchmark.cpp bitbase.cpp bitboard.cpp endgame.cpp evaluate.cpp main.cpp material.cpp \
	  misc.cpp movegen.cpp movepick.cpp pawns.cpp position.cpp psqt.cpp search.cpp thread.cpp \
	  timeman.cpp tt.cpp uci.cpp ucioption.cpp

  OBJS = \$(notdir \$(SRCS:.cpp=.o))

  CXX = em++

  CXXFLAGS = ${CXX_FLAGS[@]}

  LDFLAGS = ${STOCKFISH_LD_FLAGS[@]}

  build:
	  \$(MAKE) \$(EXE)

  \$(EXE): \$(OBJS)
	  \$(CXX) -o \$@ \$(OBJS) \$(LDFLAGS)
EOL
}

function mesonArray { # emit argument arrays as the meson crossfile expects them
  local f=$1
  shift
  printf "['"
  for x; do
    printf "%s" "${f}','"
    f="${x}"
  done
  printf "%s']" "${f}"
}

function maybeCreateRequire() { # coax the es6 emscripten output into working with nodejs
  if [ ! $DEBUG ]; then return; fi
  if [ $2 ]; then sed -i '0,/require/{s/require/globalThis.require/}' "$1"; fi # ugh
  cat src/emscripten/createRequire.js "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

function processArgs() {
  OPT_FLAGS=(-O3 -DNDEBUG)
  while test $# -gt 0; do
    if [ "$1" == "debug" ]; then
      DEBUG=true
      OPT_FLAGS=(-O0 -DDEBUG -sASSERTIONS -g3 -sNO_DISABLE_EXCEPTION_CATCHING)
    elif [ "$1" == "local" ]; then
      LOCAL=true
    elif [ "$1" == "force" ]; then
      FORCE=true
    elif [ "$1" == "clean" ]; then
      if [ -d lc0 ]; then git -C lc0 clean -fdx; fi
      if [ -d Stockfish ]; then git -C Stockfish clean -fdx; fi
      rm -rf ../dist
      exit 0
    else
      echo "Unknown argument: $1"
      exit 1
    fi
    shift
  done
}

main "$@"