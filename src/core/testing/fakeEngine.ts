/**
 * `FakeEngineService` – scriptable `EngineService` double (BACKLOG 2.6): map FEN → lines; default = first legal
 * move with cp 0. Implements the contract's queueing, abort and status behaviour without a real engine.
 */
import { ChessGame, positionKey } from '@/lib/chess';
import type { Fen, Uci } from '../chess';
import type { AnalyseOptions, BestMoveOptions, EngineAnalysis, EngineLine, EngineService, EngineStatus } from '../engine';

/** Lines for a position, or a function computing them. */
export type FakeEngineLines = EngineLine[] | ((fen: Fen) => EngineLine[]);

/** Options of `FakeEngineService`. */
export interface FakeEngineOptions {
  id?: string;
  /** Scripted lines by full FEN or by position key (first four FEN fields). */
  lines?: Record<string, FakeEngineLines>;
  /** Artificial latency per call in ms (abortable). Default 0. */
  delayMs?: number;
  /** Make `init` fail with this message (to test "Engine konnte nicht starten"). */
  failInit?: string;
}

function abortError(): DOMException {
  return new DOMException('The engine search was aborted.', 'AbortError');
}

/** Default line: first legal move, cp 0. `null` when there is no legal move. */
function defaultLines(fen: Fen, depth: number): EngineLine[] {
  try {
    const first = ChessGame.fromFen(fen).legalMoves()[0];
    return first ? [{ multipv: 1, depth, score: { type: 'cp', value: 0 }, pv: [first.uci] }] : [];
  } catch {
    return [];
  }
}

/** Scriptable fake engine. All calls are recorded in `calls`. */
export class FakeEngineService implements EngineService {
  readonly id: string;
  /** Every analyse/bestMove call. */
  readonly calls: Array<{ method: 'analyse' | 'bestMove'; fen: Fen; opts: AnalyseOptions | BestMoveOptions }> = [];
  private readonly scripted = new Map<string, FakeEngineLines>();
  private currentStatus: EngineStatus = { state: 'idle' };
  private readonly listeners = new Set<(s: EngineStatus) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private readonly delayMs: number;
  private readonly failInit?: string;
  private initialized: Promise<void> | null = null;
  private stopCurrent: (() => void) | null = null;

  constructor(opts: FakeEngineOptions = {}) {
    this.id = opts.id ?? 'fake-engine';
    this.delayMs = opts.delayMs ?? 0;
    this.failInit = opts.failInit;
    for (const [k, v] of Object.entries(opts.lines ?? {})) this.setLines(k, v);
  }

  /** Scripts the lines for a position (full FEN or position key). */
  setLines(fenOrKey: string, lines: FakeEngineLines): void {
    this.scripted.set(fenOrKey, lines);
  }

  private linesFor(fen: Fen, depth: number): EngineLine[] {
    const s = this.scripted.get(fen) ?? this.scripted.get(positionKey(fen));
    if (!s) return defaultLines(fen, depth);
    return typeof s === 'function' ? s(fen) : s;
  }

  private setStatus(s: EngineStatus): void {
    this.currentStatus = s;
    for (const l of [...this.listeners]) l(s);
  }

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error(`${this.id} is disposed`));
    if (!this.initialized) {
      this.setStatus({ state: 'loading', progress: 0 });
      this.initialized = Promise.resolve().then(() => {
        if (this.failInit) {
          this.setStatus({ state: 'error', error: this.failInit });
          this.initialized = null;
          throw new Error(this.failInit);
        }
        this.setStatus({ state: 'ready' });
      });
    }
    return this.initialized;
  }

  status(): EngineStatus {
    return this.currentStatus;
  }

  onStatus(cb: (s: EngineStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private run<T>(signal: AbortSignal | undefined, compute: () => T): Promise<T> {
    const job = async (): Promise<T> => {
      if (this.disposed) throw new Error(`${this.id} is disposed`);
      if (signal?.aborted) throw abortError();
      await this.init();
      this.setStatus({ state: 'busy' });
      try {
        if (this.delayMs > 0) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, this.delayMs);
            this.stopCurrent = () => {
              clearTimeout(timer);
              resolve();
            };
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(abortError());
            });
          });
        }
        if (signal?.aborted) throw abortError();
        return compute();
      } finally {
        this.stopCurrent = null;
        if (!this.disposed) this.setStatus({ state: 'ready' });
      }
    };
    const result = this.queue.then(job, job);
    this.queue = result.catch(() => undefined);
    return result;
  }

  analyse(fen: Fen, opts: AnalyseOptions = {}): Promise<EngineAnalysis> {
    this.calls.push({ method: 'analyse', fen, opts });
    return this.run(opts.signal, () => {
      const depth = opts.depth ?? 10;
      const lines = this.linesFor(fen, depth).filter((l) => l.multipv <= (opts.multiPv ?? 1));
      opts.onUpdate?.(lines);
      return {
        fen,
        lines,
        depth: lines[0]?.depth ?? 0,
        bestMove: (lines[0]?.pv[0] as Uci | undefined) ?? null,
        source: 'local' as const,
        engineId: this.id,
      };
    });
  }

  bestMove(fen: Fen, opts: BestMoveOptions = {}): Promise<{ move: Uci | null; lines: EngineLine[] }> {
    this.calls.push({ method: 'bestMove', fen, opts });
    return this.run(opts.signal, () => {
      const lines = this.linesFor(fen, opts.depth ?? 10).filter((l) => l.multipv <= (opts.multiPv ?? 1));
      return { move: lines[0]?.pv[0] ?? null, lines };
    });
  }

  async stop(): Promise<void> {
    this.stopCurrent?.();
    await this.queue;
  }

  dispose(): void {
    this.disposed = true;
    this.setStatus({ state: 'idle' });
  }
}
