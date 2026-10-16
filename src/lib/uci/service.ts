/**
 * `createUciEngineService` – an `EngineService` on top of any `UciTransport` (Web Worker in the browser, the npm
 * `stockfish` module in Node, scripted doubles in tests).
 *
 * - Calls are serialised: one search at a time, in call order.
 * - Before every search the engine is synchronised with `isready`; options set for a call (MultiPV, Skill Level,
 *   UCI_LimitStrength/UCI_Elo) are restored afterwards.
 * - Abort (`signal`) sends `stop`, waits for `bestmove` (so the engine is idle again) and rejects with `AbortError`.
 * - All scores are converted to White's point of view (D-08).
 */
import type { Color, Fen, Uci } from '@/core/chess';
import type {
  AnalyseOptions,
  BestMoveOptions,
  EngineAnalysis,
  EngineLine,
  EngineService,
  EngineStatus,
  UciTransport,
} from '@/core/engine';
import { infoToEngineLine, parseUciLine, type UciMessage } from './parser';

/** Options of `createUciEngineService`. */
export interface UciEngineOptions {
  /** Depth used when a call gives neither `depth` nor `movetimeMs` (default 12). */
  defaultDepth?: number;
  /** Options sent once after `uciok`, e.g. `{ Hash: 16 }`. */
  initOptions?: Record<string, string | number | boolean>;
  /** Timeout for the UCI handshake in ms (default 30 000). */
  initTimeoutMs?: number;
  /** `source` reported in analyses (default `local`). */
  source?: EngineAnalysis['source'];
}

interface OptionInfo {
  min?: number;
  max?: number;
  default?: string;
}

/** Engine defaults restored after each call. */
const RESTORE_DEFAULTS: Record<string, string> = {
  MultiPV: '1',
  'Skill Level': '20',
  UCI_LimitStrength: 'false',
};

function abortError(): DOMException {
  return new DOMException('The engine search was aborted.', 'AbortError');
}

function turnOf(fen: Fen): Color {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** Creates an `EngineService` for a UCI transport. `id` is reported as `EngineService.id` / `engineId`. */
export function createUciEngineService(transport: UciTransport, id: string, options: UciEngineOptions = {}): EngineService {
  const defaultDepth = options.defaultDepth ?? 12;
  const handlers = new Set<(msg: UciMessage, raw: string) => void>();
  const statusListeners = new Set<(s: EngineStatus) => void>();
  const engineOptions = new Map<string, OptionInfo>();
  let status: EngineStatus = { state: 'idle' };
  let initPromise: Promise<void> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let currentStop: (() => void) | null = null;
  let currentRun: Promise<void> | null = null;
  let disposed = false;

  const unsubscribe = transport.onLine((raw) => {
    const msg = parseUciLine(raw);
    if (msg.type === 'option') engineOptions.set(msg.name, { min: msg.min, max: msg.max, default: msg.default });
    for (const h of [...handlers]) h(msg, raw);
  });

  function setStatus(s: EngineStatus): void {
    status = s;
    for (const l of [...statusListeners]) l(s);
  }

  function waitFor(pred: (msg: UciMessage) => boolean, timeoutMs?: number): Promise<UciMessage> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const handler = (msg: UciMessage) => {
        if (!pred(msg)) return;
        handlers.delete(handler);
        if (timer) clearTimeout(timer);
        resolve(msg);
      };
      handlers.add(handler);
      if (timeoutMs) {
        timer = setTimeout(() => {
          handlers.delete(handler);
          reject(new Error(`UCI engine ${id}: no answer within ${timeoutMs} ms`));
        }, timeoutMs);
      }
    });
  }

  async function sync(): Promise<void> {
    const ready = waitFor((m) => m.type === 'readyok', 30_000);
    transport.send('isready');
    await ready;
  }

  function setOption(name: string, value: string | number | boolean): void {
    transport.send(`setoption name ${name} value ${value}`);
  }

  function clampOption(name: string, value: number): number {
    const info = engineOptions.get(name);
    let v = value;
    if (info?.min !== undefined) v = Math.max(info.min, v);
    if (info?.max !== undefined) v = Math.min(info.max, v);
    return Math.round(v);
  }

  function init(): Promise<void> {
    if (disposed) return Promise.reject(new Error(`UCI engine ${id} is disposed`));
    if (!initPromise) {
      initPromise = (async () => {
        setStatus({ state: 'loading', progress: 0 });
        try {
          const ok = waitFor((m) => m.type === 'uciok', options.initTimeoutMs ?? 30_000);
          transport.send('uci');
          await ok;
          for (const [name, value] of Object.entries(options.initOptions ?? {})) setOption(name, value);
          await sync();
          setStatus({ state: 'ready' });
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          setStatus({ state: 'error', error });
          initPromise = null;
          throw e;
        }
      })();
    }
    return initPromise;
  }

  function enqueue<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let started = false;
    let skipped = false;
    const run = async (): Promise<T> => {
      if (disposed) throw new Error(`UCI engine ${id} is disposed`);
      if (skipped || signal?.aborted) throw abortError();
      started = true;
      await init();
      setStatus({ state: 'busy' });
      let finish: () => void = () => {};
      currentRun = new Promise<void>((resolve) => (finish = resolve));
      try {
        return await job();
      } finally {
        finish();
        currentRun = null;
        if (!disposed) setStatus({ state: 'ready' });
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    if (!signal) return result;
    // A call that is still waiting in the queue rejects immediately on abort (a running search stops via `stop`).
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        if (!started) {
          skipped = true;
          reject(abortError());
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
      result.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  }

  /** Runs one `go` and collects lines until `bestmove`. */
  async function search(
    fen: Fen,
    go: string,
    signal: AbortSignal | undefined,
    onUpdate?: (lines: EngineLine[]) => void,
  ): Promise<{ bestMove: Uci | null; lines: EngineLine[] }> {
    const turn = turnOf(fen);
    const lines = new Map<number, EngineLine>();
    let aborted = false;
    const sorted = () => [...lines.values()].sort((a, b) => a.multipv - b.multipv);
    const collector = (msg: UciMessage) => {
      if (msg.type !== 'info') return;
      const line = infoToEngineLine(msg, turn);
      if (!line) return;
      lines.set(line.multipv, line);
      onUpdate?.(sorted());
    };
    const stop = () => {
      if (!aborted) {
        aborted = true;
        transport.send('stop');
      }
    };
    const onAbort = () => stop();
    handlers.add(collector);
    signal?.addEventListener('abort', onAbort);
    currentStop = () => transport.send('stop');
    try {
      const done = waitFor((m) => m.type === 'bestmove');
      transport.send(`position fen ${fen}`);
      transport.send(go);
      if (signal?.aborted) stop();
      const best = (await done) as Extract<UciMessage, { type: 'bestmove' }>;
      if (aborted) throw abortError();
      return { bestMove: best.move, lines: sorted() };
    } finally {
      handlers.delete(collector);
      signal?.removeEventListener('abort', onAbort);
      currentStop = null;
    }
  }

  function goCommand(depth: number | undefined, movetimeMs: number | undefined): string {
    const parts = ['go'];
    if (depth === undefined && movetimeMs === undefined) parts.push('depth', String(defaultDepth));
    if (depth !== undefined) parts.push('depth', String(Math.max(1, Math.round(depth))));
    if (movetimeMs !== undefined) parts.push('movetime', String(Math.max(1, Math.round(movetimeMs))));
    return parts.join(' ');
  }

  /** Applies per-call options; returns the names that must be restored. */
  function applyOptions(o: { multiPv?: number; skillLevel?: number; limitStrengthElo?: number }): string[] {
    const changed: string[] = [];
    if (o.multiPv !== undefined && o.multiPv !== 1) {
      setOption('MultiPV', clampOption('MultiPV', o.multiPv));
      changed.push('MultiPV');
    }
    if (o.skillLevel !== undefined) {
      setOption('Skill Level', clampOption('Skill Level', o.skillLevel));
      changed.push('Skill Level');
    }
    if (o.limitStrengthElo !== undefined) {
      setOption('UCI_LimitStrength', true);
      setOption('UCI_Elo', clampOption('UCI_Elo', o.limitStrengthElo));
      changed.push('UCI_LimitStrength');
    }
    return changed;
  }

  async function restore(changed: string[]): Promise<void> {
    if (changed.length === 0 || disposed) return;
    for (const name of changed) setOption(name, RESTORE_DEFAULTS[name] ?? engineOptions.get(name)?.default ?? '');
    await sync();
  }

  const service: EngineService = {
    id,
    init,
    status: () => status,
    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    analyse(fen: Fen, opts: AnalyseOptions = {}): Promise<EngineAnalysis> {
      return enqueue(async () => {
        const changed = applyOptions({ multiPv: opts.multiPv });
        try {
          await sync();
          const { bestMove, lines } = await search(fen, goCommand(opts.depth, opts.movetimeMs), opts.signal, opts.onUpdate);
          return {
            fen,
            lines,
            depth: lines[0]?.depth ?? 0,
            bestMove,
            source: options.source ?? 'local',
            engineId: id,
          };
        } finally {
          await restore(changed);
        }
      }, opts.signal);
    },
    bestMove(fen: Fen, opts: BestMoveOptions = {}) {
      return enqueue(async () => {
        const changed = applyOptions(opts);
        try {
          await sync();
          const { bestMove, lines } = await search(fen, goCommand(opts.depth, opts.movetimeMs), opts.signal);
          return { move: bestMove, lines };
        } finally {
          await restore(changed);
        }
      }, opts.signal);
    },
    async stop() {
      const running = currentRun;
      currentStop?.();
      if (running) await running;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      handlers.clear();
      transport.terminate();
      setStatus({ state: 'idle' });
    },
  };
  return service;
}
