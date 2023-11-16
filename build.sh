#!/usr/bin/env -S bash -e

# Use "./build.sh docker" if you don't have emscripten

cd "$(dirname "${BASH_SOURCE:-$0}")"

function main() {

  parseArgs "$@"

  CXX_FLAGS=(
    "${OPT_FLAGS[@]}"
    -Ilc0/src
    -IStockfish/src
    -Ieigen
    -Iglue
    -Wno-deprecated-copy-with-user-provided-copy
    -Wno-deprecated-declarations
    -Wno-unused-command-line-argument
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
    -DEIGEN_DONT_PARALLELIZE
    -DUSE_SSE2
    -DUSE_SSSE3
    -DUSE_SSE41
    -DUSE_POPCNT
    -DNO_PEXT
    -flto
  )
  LD_FLAGS=(
    "${CXX_FLAGS[@]}"
    --pre-js=glue/initModule.js
    -sEXPORTED_FUNCTIONS=['_free','_malloc','_main','_set_weights','_uci']
    -sINITIAL_MEMORY=128MB
    -sSTACK_SIZE=1MB
    -sEXPORT_ES6
    -sSTRICT
    -sPROXY_TO_PTHREAD
    -sALLOW_MEMORY_GROWTH=1
    -sALLOW_BLOCKING_ON_MAIN_THREAD=0
    -sDISABLE_EXCEPTION_CATCHING=0
    -sEXPORT_NAME=zerofish
    -sENVIRONMENT=$ENVIRONMENT
    -Wno-pthreads-mem-growth
  )
  SF_SOURCES=(
    bitbase.cpp bitboard.cpp endgame.cpp evaluate.cpp material.cpp misc.cpp movegen.cpp
    movepick.cpp pawns.cpp position.cpp psqt.cpp search.cpp thread.cpp timeman.cpp tt.cpp
    uci.cpp ucioption.cpp
  )
  LC0_SOURCES=(
    chess/bitboard.cc chess/board.cc chess/position.cc chess/uciloop.cc engine.cc mcts/node.cc
    mcts/params.cc mcts/search.cc mcts/stoppers/alphazero.cc mcts/stoppers/common.cc
    mcts/stoppers/factory.cc mcts/stoppers/legacy.cc mcts/stoppers/simple.cc
    mcts/stoppers/smooth.cc mcts/stoppers/stoppers.cc mcts/stoppers/timemgr.cc neural/cache.cc
    neural/decoder.cc neural/encoder.cc neural/factory.cc neural/loader.cc neural/network_legacy.cc
    neural/blas/convolution1.cc neural/blas/fully_connected_layer.cc neural/blas/se_unit.cc
    neural/blas/network_blas.cc neural/blas/winograd_convolution3.cc
    neural/shared/activation.cc neural/shared/winograd_filter.cc utils/histogram.cc
    utils/logging.cc utils/numa.cc utils/optionsdict.cc utils/optionsparser.cc
    utils/protomessage.cc utils/random.cc  utils/string.cc utils/weights_adapter.cc
    version.cc
  )

  for i in "${!SF_SOURCES[@]}"; do
    SRCS+="Stockfish/src/${SF_SOURCES[$i]} "
  done
  for i in "${!LC0_SOURCES[@]}"; do
    SRCS+="lc0/src/${LC0_SOURCES[$i]} "
  done

  SRCS+="glue/main.cpp"
  
  OUT_DIR="$(pwd)/dist"
  mkdir -p "$OUT_DIR"

  generateMakefile

  pushd wasm > /dev/null
  . fetchSources.sh
  if [ $LOCAL ]; then
    make -j$(grep -c ^processor /proc/cpuinfo)
  else
    docker run --rm -u $(id -u):$(id -g) -v "$PWD":/zf -w /zf emscripten/emsdk:3.1.43 sh -c 'make -j$(nproc)'
  fi
  mv -f zerofishEngine.* "$OUT_DIR"
  popd > /dev/null
  maybeCreateRequire "$OUT_DIR/zerofishEngine.worker.js"
}

function maybeCreateRequire() { # coax the es6 emscripten output into working with nodejs
  if [ "$ENVIRONMENT" != "node" ]; then return; fi
  cat wasm/glue/createRequire.js "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

function parseArgs() {
  # defaults
  OPT_FLAGS=(-O3 -DNDEBUG --closure=1)
  ENVIRONMENT="web,worker"
  LOCAL=true
  unset DEBUG

  # override defaults with command line arguments
  while test $# -gt 0; do
    if [ "$1" == "debug" ]; then
      DEBUG=true
      OPT_FLAGS=(-O0 -DDEBUG -sASSERTIONS=2 -g3 -sSAFE_HEAP)
    elif [ "$1" == "docker" ]; then
      unset LOCAL
    elif [ "$1" == "node" ]; then
      ENVIRONMENT="node"
    elif [ "$1" == "help" ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
      echo "Usage: $0 [docker] [debug] [node]"
      echo "  docker: build using docker"
      echo "  debug: build with debug symbols"
      echo "  node: build for nodejs"
      exit 0
    else
      echo "Unknown argument: $1"
      exit 1
    fi
    shift
  done
}

function generateMakefile() {
  cat > wasm/Makefile<<EOL
  # generated with wasm/build.sh

  EXE = zerofishEngine.js
  CXX = em++
  SRCS = $SRCS
  OBJS := \$(foreach src,\$(SRCS),\$(if \$(findstring .cpp,\$(src)),\$(src:.cpp=.o),\$(src:.cc=.o)))

  CXXFLAGS = ${CXX_FLAGS[@]}
  LDFLAGS = ${LD_FLAGS[@]}

  build:
	  \$(MAKE) \$(EXE)

  \$(EXE): \$(OBJS)
	  \$(CXX) -o \$@ \$(OBJS) \$(LDFLAGS)

  %.o: %%.cpp
	  \$(CXX) -c \$(CXXFLAGS) \$< -o \$@

  %.o: %%.cc
	  \$(CXX) -c \$(CXXFLAGS) \$< -o \$@
EOL
}

main "$@"