export interface ZerofishOpts {
  locator: (file: string) => string;
  nonce?: string;
  dev?: boolean;
}

export interface ZeroNet {
  key: string;
  fetch: (key?: string) => Promise<Uint8Array>;
}

export type SearchBy = { depth: number } | { movetime: number } | { nodes: number };

export interface FishSearch {
  multipv: number;
  by: SearchBy;
  level?: number; // -10 to 20
}

export interface ZeroSearch {
  multipv: number;
  net: ZeroNet;
  nodes?: number;
}

export interface Position {
  fen?: string;
  moves?: string[];
}

export interface Line {
  moves: string[];
  scores: number[];
}

export interface SearchResult {
  lines: Line[];
  bestmove: string;
  engine: 'fish' | 'zero';
}

export interface Zerofish {
  goZero(pos: Position, search: ZeroSearch): Promise<SearchResult>;
  goFish(pos: Position, search: FishSearch): Promise<SearchResult>;
  quit(): void;
  stop(): void;
  reset(): void;
}

export default async function makeZerofish({ locator, nonce, dev }: ZerofishOpts): Promise<Zerofish> {
  const rsp = await fetch(locator('zerofishEngine.js'), { cache: 'force-cache' });
  if (!rsp.ok) throw new Error(`network error ${rsp.status} fetching ${locator('zerofishEngine.js')}`);

  const blobUrl = URL.createObjectURL(new Blob([await rsp.text()], { type: 'application/javascript' }));
  const script = document.createElement('script');
  script.src = blobUrl;
  script.nonce = nonce;
  document.body.appendChild(script);
  await new Promise(resolve => (script.onload = resolve));
  const enginePromises = Array.from({ length: dev ? 2 : 1 }, () =>
    (window as any).makeZerofishEngine({
      mainScriptUrlOrBlob: blobUrl,
      onError: (msg: string) => Promise.reject(new Error(msg)),
      locateFile: locator,
      noInitialRun: true,
    })
  );
  const engines = await Promise.all(enginePromises);
  engines[0].callMain(['4']); // 4 fish threads on main engine
  if (dev) engines[1].callMain(['0']); // we dont need any on the second.
  return new ZerofishImpl(engines);
}

type Worker = any;

interface PB {
  multipv: number;
  by: SearchBy;
  level?: number;
  worker: Worker;
  engine: 'fish' | 'zero';
}

class ZerofishImpl implements Zerofish {
  private lru = new Map<string, number>();

  constructor(private workers: Worker[]) {
    this.newGame();
  }

  get fish(): Worker {
    return this.workers[0].fish;
  }

  async goFish(pos: Position, s: FishSearch): Promise<SearchResult> {
    return this.go(pos, {
      ...s,
      worker: this.workers[0],
      engine: 'fish',
    });
  }

  async goZero(pos: Position, s: ZeroSearch): Promise<SearchResult> {
    const index = this.lru.get(s.net.key) ?? (await this.getNet(s.net));
    this.lru.set(s.net.key, index);
    return this.go(pos, {
      multipv: s.multipv,
      by: { nodes: s.nodes ?? 1 },
      worker: this.workers[index],
      engine: 'zero',
    });
  }

  quit() {
    this.stop();
    for (const w of this.workers) w.quit();
  }

  stop() {
    this.all('stop');
  }

  async reset() {
    this.stop();
    this.newGame();
  }

  private newGame() {
    this.all('ucinewgame');
    this.all('setoption name UCI_Chess960 value true');
  }

  private all(uci: string) {
    this.fish(uci);
    this.workers.forEach(w => w.zero(uci));
  }

  private async getNet(net: ZeroNet): Promise<number> {
    let netIndex: number;
    if (this.lru.size < this.workers.length) {
      netIndex = this.lru.size;
    } else {
      const [netName, index] = this.lru.entries().next().value as [string, number];
      this.lru.delete(netName);
      netIndex = index;
    }
    this.workers[netIndex].zero('ucinewgame');
    this.workers[netIndex].setZeroWeights(await net.fetch(net.key));
    return netIndex;
  }

  private go(pos: Position, { multipv, by, level, worker, engine }: PB): Promise<SearchResult> {
    const listen = engine === 'fish' ? 'listenFish' : 'listenZero';
    const lines: Line[] = Array.from({ length: multipv }, () => ({
      moves: [],
      scores: [],
    }));
    const { fen, moves } = pos;
    const uci = worker[engine];

    return new Promise<SearchResult>(async (resolve, reject) => {
      const onError = (err: string) => {
        worker[listen] = undefined;
        reject(err);
      };
      worker[listen] = (line: string) => {
        const tokens = line.split(' ');
        if (tokens[0] === 'bestmove') {
          worker[listen] = undefined;
          resolve({
            bestmove: tokens[1],
            lines: lines.find(v => v.moves[0] === tokens[1]) ? lines : [{ moves: [tokens[1]], scores: [0] }],
            engine: engine,
          });
        } else if (tokens[0] === 'info') {
          if (tokens[1] !== 'depth') return;
          const find = (field: string) => {
            const index = tokens.indexOf(field, 2);
            return index === -1 ? undefined : Number(tokens[index + 1]);
          };
          const pvIndex = find('multipv') ?? 1;
          const mate = find('mate');
          const pv: Line = lines[pvIndex - 1];
          pv.scores.push(find('cp') ?? (mate !== undefined ? (mate > 0 ? 10000 : -10000) : NaN));
          pv.moves = tokens.slice(tokens.indexOf('pv') + 1);
        }
      };
      uci('position ' + (fen ? `fen ${fen}` : 'startpos') + (moves?.[0] ? ` moves ${moves.join(' ')}` : ''));
      uci(`setoption name multipv value ${multipv}`);
      if (engine === 'fish') uci(`setoption name skill level value ${level ?? 30}`);
      if ('movetime' in by) uci(`go movetime ${by.movetime}`);
      else if ('nodes' in by) uci(`go nodes ${by.nodes}`);
      else if ('depth' in by) uci(`go depth ${by.depth}`);
      else reject(`invalid search ${JSON.stringify(by)}`);
    });
  }
}
