#!/usr/bin/env -S bash -e

# Use "./build.sh docker" if you don't have emscripten

cd "$(dirname "${BASH_SOURCE:-$0}")"

function main() {

  parseArgs "$@"

  CXX_FLAGS=(
    "${OPT_FLAGS[@]}"
    -IStockfish/src
    -Ilc0/src
    -Ieigen
    -Isrc
    -Wno-deprecated-copy-with-user-provided-copy
    -Wno-deprecated-declarations
    -Wno-unused-command-line-argument
    -Wno-pthreads-mem-growth
    -std=c++17
    -pthread
    -D__arm__
    -DEIGEN_NO_CPUID
    -DEIGEN_DONT_VECTORIZE
    -DEIGEN_DONT_PARALLELIZE
    -DUSE_POPCNT
    -DNO_PEXT
    -DDEFAULT_TASK_WORKERS=0
    -flto
  )
  LD_FLAGS=(
    "${CXX_FLAGS[@]}"
    --pre-js=src/initModule.js
    -sEXPORTED_FUNCTIONS=[_free,_malloc,_main,_set_weights,_uci,_quit]
    -sEXPORTED_RUNTIME_METHODS=[stringToUTF8,lengthBytesUTF8,HEAPU8,callMain]
    -sINCOMING_MODULE_JS_API=[print,printErr,instantiateWasm,locateFile,noInitialRun]
    #-sINITIAL_MEMORY=256MB
    -sSTACK_SIZE=1MB
    -sSTRICT
    -sFILESYSTEM=0
    -sPROXY_TO_PTHREAD
    -sALLOW_MEMORY_GROWTH
    -sEXIT_RUNTIME
    -sEXPORT_ES6
    -sEXPORT_NAME=zerofish
    -sENVIRONMENT=$ENVIRONMENT
    -sALLOW_BLOCKING_ON_MAIN_THREAD=${DEBUG:-0}
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

  SRCS+="src/glue.cpp"
  
  OUT_DIR="$(pwd)/dist"
  mkdir -p "$OUT_DIR"

  generateMakefile

  pushd wasm > /dev/null
  . fetchSources.sh
  if [ $LOCAL ]; then
    make -j
  else
    docker run --rm -u $(id -u):$(id -g) -v "$PWD":/zf -w /zf emscripten/emsdk:3.1.64 sh -c 'make -j'
  fi
  mv -f zerofishEngine.* "$OUT_DIR"
  popd > /dev/null
}

function parseArgs() {
  # defaults
  OPT_FLAGS=(-O3 -DNDEBUG --closure=1)
  ENVIRONMENT="web,worker"
  LOCAL=true
  unset DEBUG

  while test $# -gt 0; do
    if [ "$1" == "debug" ]; then
      DEBUG=1
      OPT_FLAGS=(-O0 -DDEBUG -sASSERTIONS=2 -g3 -sSAFE_HEAP)
    elif [ "$1" == "docker" ]; then
      unset LOCAL
    elif [ "$1" == "node" ]; then
      ENVIRONMENT="node"
    elif [ "$1" == "help" ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
      echo "Usage: $0 [docker] [debug] [node]"
      echo "  docker: build using docker emsdk:3.1.59"
      echo "  debug: assertions, safe heap, no optimizations"
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