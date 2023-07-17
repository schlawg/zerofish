#!/usr/bin/env bash

# the majority of this junk is for lc0 which uses meson and ninja

SCRIPT_DIR=$(dirname "${BASH_SOURCE:-$0}")
# EMSCRIPTEN=/emsdk/upstream/emscripten

OPTIMIZE=3 # (0-3)

if [ "$1" == "clean" ]; then
  docker builder prune -f -a
  docker image prune -f -a
  rm -rf ../dist
  rm -f meson-log.txt
  exit 0
elif [ "$1" == "dev" ]; then
  OPTIMIZE=0
  DEV=true
fi

# no amount of hand integrated wasm simd intrinsics would allow us to run normal
# sized lc0 models acceptably in a browser without webgpu. so leave eigen alone
LC0_CPP=(
  -O${OPTIMIZE}
  -D__i386__ # no need to double the size of every pointer here
  -DEIGEN_NO_CPUID
  -DEIGEN_OPTIMIZATION_BARRIER\(X\)=\;
  -DEIGEN_STRONG_INLINE=inline
  -DEIGEN_DONT_VECTORIZE # stay out of clang's way
  -pthread
  -msse
  -msse2
  -mssse3
  -msse4.1
  -msimd128 # maybe good things will happen
)

LC0_LINK=(
  --pre-js=/initModule.js
  -sEXPORT_NAME=Lc0Module
  -sEXPORTED_FUNCTIONS=['_free']
  -sFILESYSTEM
  -sINITIAL_MEMORY=256MB
  -sENVIRONMENT=web,worker,node
  -sPTHREAD_POOL_SIZE=1
  -sEXPORT_ES6
  -sMODULARIZE
)

if [ "$OPTIMIZE" == "0" ]; then
LC0_LINK+=(
# --pre-js $EMSCRIPTEN/src/emscripten-source-map.min.js
  -sNO_DISABLE_EXCEPTION_CATCHING
  -g3
  -SAFE_HEAP
)
fi

if [ $DEV ]; then
LC0_LINK+=(--preload-file=weights.pb)
fi

main() {
  cd $SCRIPT_DIR
  makeCrossfile

  if [ $DEV ]; then
    echo "Building from local source"
    docker rm -f zerofish > /dev/null
    docker rmi -f zerofish-dev-img > /dev/null
    docker build -t zerofish-dev-img -f Dockerfile-dev ..
    docker run --name zerofish zerofish-dev-img
  else
    docker rm -f zerofish > /dev/null
    docker build -t zerofish-img -f Dockerfile ..
    docker create --name zerofish zerofish-img
  fi

  mkdir -p ../dist
  cd ../dist
  if [ $DEV ]; then
    docker cp zerofish:/lc0/build/release/lc0.data lc0.data
  fi
  docker cp zerofish:/lc0.js lc0.js
  docker cp zerofish:/lc0.worker.js lc0.worker.js
  docker cp zerofish:/lc0.wasm lc0.wasm
  docker cp zerofish:/lc0/build/release/meson-logs/meson-log.txt ../build/meson-log.txt
  docker cp zerofish:/stockfish.js stockfish.js
  docker cp zerofish:/stockfish.worker.js stockfish.worker.js
  docker cp zerofish:/stockfish.wasm stockfish.wasm
  #docker rm zerofish

}

function array { # emit argument arrays as meson crossfile expects them
  local f=$1
  shift
  printf "['"
  for x; do
    printf "%s" "${f}','"
    f="${x}"
  done
  printf "%s']" "${f}"
}

makeCrossfile() {
  cat > emccCross.txt <<EOL
  [binaries]
  c = 'emcc'
  cpp = 'emcc'
  ar = 'emar'
  [host_machine]
  system = 'emscripten'
  cpu_family = 'wasm32'
  cpu = 'wasm32'
  endian = 'little'
  [built-in options]
  cpp_args = $(array "${LC0_CPP[@]}")
  cpp_link_args = $(array "${LC0_CPP[@]}','${LC0_LINK[@]}")
EOL
}

main "$@"