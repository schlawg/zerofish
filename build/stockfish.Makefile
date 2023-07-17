
# Just use our own Makefile. a weakened stockfish like this makes no sense outside our
# application so this stuff will never be merged

EXE = stockfish.js

SRCS = benchmark.cpp bitbase.cpp bitboard.cpp endgame.cpp evaluate.cpp main.cpp \
	material.cpp misc.cpp movegen.cpp movepick.cpp pawns.cpp position.cpp psqt.cpp \
	search.cpp thread.cpp timeman.cpp tt.cpp uci.cpp ucioption.cpp

OBJS = $(notdir $(SRCS:.cpp=.o))

CXX = em++

CXXFLAGS = \
-O0 \
-DNDEBUG \
-Wall \
-fno-exceptions \
-std=c++17 \
-pthread \
-msse \
-msse2 \
-DUSE_SSE2 \
-mssse3 \
-msse4.1 \
-DUSE_SSE41 \
-msimd128 \
-DUSE_POPCNT

LDFLAGS = $(CXXFLAGS) \
--pre-js=/initModule.js \
-sASSERTIONS \
-sMODULARIZE \
-sEXPORT_NAME="createStockfish" \
-sEXPORT_ES6 \
-sENVIRONMENT=web,worker,node \
-sSTRICT \
-sEXPORTED_FUNCTIONS=['_free','_malloc'] \
-sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='$$stringToNewUTF8' \
-sINITIAL_MEMORY=256MB \
-sSTACK_SIZE=512KB \
-sPTHREAD_POOL_SIZE=7
# -sPROXY_TO_PTHREAD \
# -sALLOW_MEMORY_GROWTH \
# -sINITIAL_MEMORY=$$((1 << 27)) \
# -sMAXIMUM_MEMORY=$$((1 << 31)) \
# -sALLOW_UNIMPLEMENTED_SYSCALLS \

build:
	$(MAKE) $(EXE)

clean:
	@rm -f .depend *~ core
	@rm -f stockfish.js stockfish.wasm stockfish.worker.js *.o

$(EXE): $(OBJS)
	+$(CXX) -o $@ $(OBJS) $(LDFLAGS)
