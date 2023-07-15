#!/usr/bin/env bash

SCRIPT_DIR=$(dirname "${BASH_SOURCE:-$0}")
EMSCRIPTEN=/emsdk/upstream/emscripten

OPTIMIZE=0 # (0-3) 0 includes debug symbols and is 9MB, 3 is 850k

if [ "$1" == "clean" ]; then
  docker builder prune -f -a
  docker image prune -f -a
  rm -rf ../dist
  rm -f meson-log.txt
  exit 0
elif [ "$1" == "dev" ]; then
  DEV=true
fi

# no amount of hand integrated wasm simd intrinsics would allow us to run normal
# sized lc0 models acceptably in a browser without webgpu. so leave eigen alone
LC0_CPP=(
  -O${OPTIMIZE}
  -I/lc0/include
  -D__i386__
  -DEIGEN_NO_CPUID
  -DEIGEN_OPTIMIZATION_BARRIER\(X\)=\;
  -DEIGEN_STRONG_INLINE=inline
  -DEIGEN_DONT_VECTORIZE # stay out of clang's way
  -Dblas=true
  -Dopenblas=true
  -msse
  -msse2
  -msimd128
)

LC0_LINK=(
  --pre-js=/lc0/initModule.js
  -sEXPORT_NAME=Lc0Module
  -sEXPORTED_FUNCTIONS=['_free']
  -sFILESYSTEM
  -sINITIAL_MEMORY=256MB
  -sENVIRONMENT=web,worker,node
  -sUSE_PTHREADS
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
    LC0_JS=lc0-node.js
    LC0_WORKER_JS=lc0-node.worker.js
    docker rm -f zerofish #> /dev/null
    docker rmi -f zerofish-dev-img #> /dev/null
    docker build -t zerofish-dev-img -f Dockerfile-dev ..
    docker run --name zerofish zerofish-dev-img
  else
    LC0_JS=lc0.js
    LC0_WORKER_JS=lc0.worker.js
    docker rm -f zerofish > /dev/null
    docker build -t zerofish-img -f Dockerfile ..
    docker create --name zerofish zerofish-img
  fi

  mkdir -p ../dist
  cd ../dist
  if [ $DEV ]; then
    docker cp zerofish:/lc0/build/release/lc0.data lc0.data
  fi
  docker cp zerofish:/lc0/build/release/$LC0_JS lc0.js
  docker cp zerofish:/lc0/build/release/$LC0_WORKER_JS lc0.worker.js
  docker cp zerofish:/lc0/build/release/lc0.wasm lc0.wasm
  docker cp zerofish:/lc0/build/release/meson-logs/meson-log.txt ../build/meson-log.txt
  
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