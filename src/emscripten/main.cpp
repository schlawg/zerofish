/*
  Stockfish, a UCI chess playing engine derived from Glaurung 2.1
  Copyright (C) 2004-2023 The Stockfish developers (see AUTHORS file)

  Stockfish is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Stockfish is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
/*
  This file is part of Leela Chess Zero.
  Copyright (C) 2018-2021 The LCZero Authors

  Leela Chess is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Leela Chess is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with Leela Chess.  If not, see <http://www.gnu.org/licenses/>.

  Additional permission under GNU GPL version 3 section 7

  If you modify this Program, or any covered work, by linking or
  combining it with NVIDIA Corporation's libraries from the NVIDIA CUDA
  Toolkit and the NVIDIA CUDA Deep Neural Network library (or a
  modified version of those libraries), containing parts covered by the
  terms of the respective license agreement, the licensors of this
  Program grant you additional permission to convey the resulting work.
*/
#include <iostream>
#include <sstream>
#include <emscripten.h>
#include <string>

#include "bitboard.h"
#include "endgame.h"
#include "position.h"
#include "psqt.h"
#include "search.h"
#include "thread.h"
#include "tt.h"
#include "uci.h"
#include "chess/board.h"
#include "engine.h"
#include "lc0ctl/describenet.h"
#include "utils/esc_codes.h"
#include "utils/logging.h"
#include "version.h"

lczero::EngineLoop *loop = nullptr;
Stockfish::Position *pos = nullptr;
Stockfish::StateListPtr states(new std::deque<Stockfish::StateInfo>(1));

// messaging code from engine to JS frontend can be found in Stockfish/src/misc.cpp
// and lc0/src/chess/uciloop.cc respectively. look for EM_JS macros.

extern "C" EMSCRIPTEN_KEEPALIVE void uci(const char *utf8, int isFish) {
  if (isFish) Stockfish::UCI::process_command(utf8, *pos, states);
  else loop->ProcessCommand(utf8);
}

extern "C" EMSCRIPTEN_KEEPALIVE void set_weights(const unsigned char *buf, size_t sz) {
  loop->SetWeightsBuffer(buf, sz);
}

EMSCRIPTEN_KEEPALIVE int main() {
  Stockfish::UCI::init(Stockfish::Options);
  Stockfish::PSQT::init();
  Stockfish::Bitboards::init();
  Stockfish::Position::init();
  Stockfish::Bitbases::init();
  Stockfish::Endgames::init();
  Stockfish::Threads.set(4);
  Stockfish::Search::clear(); // After threads are up
  pos = new Stockfish::Position();
  pos->set("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", false, &states->back(), Stockfish::Threads.main());
  lczero::InitializeMagicBitboards();
  loop = new lczero::EngineLoop();
  return 0;
}
