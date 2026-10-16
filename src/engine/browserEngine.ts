/**
 * Browser `EngineService`: Stockfish 19 lite (single-threaded WASM) in a Web Worker, one instance per role (D-27).
 *
 * - **Lazy (D-51):** construction never creates the worker; `init()` or the first `analyse`/`bestMove` does. Without
 *   `Worker` (jsdom, Node, very old browsers) construction still succeeds, `init()` rejects and `status()` is
 *   `{ state: 'error', error: 'Engine nicht verfügbar' }`.
 * - **Status:** `loading` with `progress` 0–0.9 while the `.wasm` downloads, 0.95 after the UCI handshake, then the
 *   speed measurement (`go depth 10`, see `budget.ts`) and `ready`; afterwards `busy`/`ready` per search. A worker
 *   error (missing script, crash) or a stalled load (no progress and no handshake for 15 s – a failed `.wasm`
 *   download is not reported by stockfish.js) sets `{ state: 'error' }`, rejects the running calls and lets the next
 *   call start a fresh worker.
 * - **Budget:** calls without limits use the measured default depth (16–18 on normal devices) plus a movetime cap;
 *   calls with a depth but no movetime get the cap, so weak devices search less deep instead of freezing.
 * - Serialisation, option restore, abort (`stop` + `AbortError`) and White-POV scores come from `@/lib/uci`.
 */
import type {
  AnalyseOptions,
  BestMoveOptions,
  EngineAnalysis,
  EngineLine,
  EngineService,
  EngineStatus,
  UciTransport,
} from '@/core/engine';
import type { Fen, Uci } from '@/core/chess';
import { createUciEngineService } from '@/lib/uci';
import { applyBudget, BENCHMARK_DEPTH, BENCHMARK_FEN, DEFAULT_ENGINE_BUDGET, deriveBudget, type EngineBudget } from './budget';
import { ENGINE_STRINGS_DE } from './strings.de';
import { createWorkerTransport, type WorkerLike } from './workerTransport';

/** Engine id stored as `engineId` in analyses (same for both roles – same engine build). */
export const BROWSER_ENGINE_ID = 'stockfish-19-lite-single';

/** Path of the engine script below the app's base URL (copied there by `scripts/copy-engine.mjs`). */
export const ENGINE_SCRIPT = 'engine/stockfish-19-lite-single.js';

/** Options of `createBrowserEngineService`. */
export interface BrowserEngineOptions {
  /** `play` (bots, coach, hints) or `analysis` (review, analysis board). */
  role: 'play' | 'analysis';
  /** Engine id (default `stockfish-19-lite-single`). */
  id?: string;
  /** Worker script URL (default `import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js'`). */
  workerUrl?: string;
  /** Creates the worker (default `new Worker(url)`; `null` = not available). Tests inject a double. */
  createWorker?: (url: string) => WorkerLike | null;
  /** Measure the device speed on init (default true). */
  measureSpeed?: boolean;
  /** Hard limit for download + UCI handshake in ms (default 120 000; slow networks keep reporting progress). */
  initTimeoutMs?: number;
  /**
   * Load failure detection: no download progress and no handshake for this long (ms, default 15 000) → error.
   * Needed because stockfish.js swallows a failed `.wasm` download inside the worker (no `error` event).
   */
  stallTimeoutMs?: number;
  /** Transposition table size in MB (default 16). */
  hashMb?: number;
  /** Clock for the speed measurement (tests). */
  now?: () => number;
}

class EngineInitError extends Error {
  constructor(readonly status: string) {
    super(status);
    this.name = 'EngineInitError';
  }
}

function abortError(): DOMException {
  return new DOMException('The engine search was aborted.', 'AbortError');
}

/** `import.meta.env.BASE_URL` when running under Vite, `/` elsewhere (Node scripts). */
function baseUrl(): string {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function defaultCreateWorker(url: string): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(url);
}

const budgets = new WeakMap<EngineService, () => EngineBudget>();

/**
 * The search budget of a browser engine (measured on `init`); `undefined` for other engines (Node, fakes).
 * The analysis service uses it for its default depth.
 */
export function getEngineBudget(engine: EngineService): EngineBudget | undefined {
  return budgets.get(engine)?.();
}

class BrowserEngineService implements EngineService {
  readonly id: string;
  private readonly opts: BrowserEngineOptions;
  private statusValue: EngineStatus = { state: 'idle' };
  private readonly listeners = new Set<(s: EngineStatus) => void>();
  private inner: EngineService | null = null;
  private transport: UciTransport | null = null;
  private initPromise: Promise<void> | null = null;
  private budget: EngineBudget = DEFAULT_ENGINE_BUDGET;
  private generation = 0;
  private ready = false;
  private disposed = false;
  /** Rejects when the current worker dies (or the service is disposed); every delegated call races with it. */
  private crashed: Promise<never> | null = null;
  private crash: ((e: Error) => void) | null = null;

  constructor(opts: BrowserEngineOptions) {
    this.opts = opts;
    this.id = opts.id ?? BROWSER_ENGINE_ID;
    budgets.set(this, () => this.budget);
  }

  status(): EngineStatus {
    return this.statusValue;
  }

  onStatus(cb: (s: EngineStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(s: EngineStatus): void {
    this.statusValue = s;
    for (const l of [...this.listeners]) l(s);
  }

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error(`${this.id} is disposed`));
    if (!this.initPromise) {
      const promise = this.start().catch((e: unknown) => {
        const status = e instanceof EngineInitError ? e.status : ENGINE_STRINGS_DE.timeout;
        this.teardown();
        if (this.initPromise === promise) this.initPromise = null;
        if (!this.disposed) this.setStatus({ state: 'error', error: status });
        throw e instanceof EngineInitError ? e : new EngineInitError(status);
      });
      this.initPromise = promise;
    }
    return this.initPromise;
  }

  private async start(): Promise<void> {
    const generation = ++this.generation;
    this.ready = false;
    this.setStatus({ state: 'loading', progress: 0 });
    let worker: WorkerLike | null = null;
    try {
      worker = (this.opts.createWorker ?? defaultCreateWorker)(this.opts.workerUrl ?? `${baseUrl()}${ENGINE_SCRIPT}`);
    } catch {
      worker = null;
    }
    if (!worker) throw new EngineInitError(ENGINE_STRINGS_DE.unavailable);

    const crashed = new Promise<never>((_, reject) => {
      this.crash = reject;
    });
    crashed.catch(() => undefined);
    this.crashed = crashed;
    let handshakeDone = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (generation === this.generation && !handshakeDone) this.crash?.(new EngineInitError(ENGINE_STRINGS_DE.loadFailed));
      }, this.opts.stallTimeoutMs ?? 15_000);
    };
    armStallTimer();
    const transport = createWorkerTransport(worker, {
      onProgress: (f) => {
        if (generation !== this.generation || handshakeDone) return;
        armStallTimer();
        this.setStatus({ state: 'loading', progress: 0.9 * f });
      },
      onError: () => {
        if (generation === this.generation) this.handleCrash();
      },
    });
    this.transport = transport;
    const inner = createUciEngineService(transport, this.id, {
      defaultDepth: DEFAULT_ENGINE_BUDGET.depth,
      initOptions: { Hash: this.opts.hashMb ?? 16 },
      initTimeoutMs: this.opts.initTimeoutMs ?? 120_000,
    });
    this.inner = inner;

    try {
      await Promise.race([inner.init(), crashed]);
    } finally {
      clearTimeout(stallTimer);
    }
    handshakeDone = true;
    this.setStatus({ state: 'loading', progress: 0.95 });
    if (this.opts.measureSpeed !== false) {
      const now = this.opts.now ?? (() => performance.now());
      const t0 = now();
      await Promise.race([inner.analyse(BENCHMARK_FEN, { depth: BENCHMARK_DEPTH }), crashed]);
      this.budget = deriveBudget(now() - t0);
    }
    inner.onStatus((s) => {
      if (generation !== this.generation || !this.ready || this.disposed) return;
      if (s.state === 'busy' || s.state === 'ready') this.setStatus({ state: s.state });
    });
    this.ready = true;
    this.setStatus({ state: 'ready' });
  }

  /** The worker died: fail running calls, show the error, start a new worker on the next call. */
  private handleCrash(): void {
    const wasReady = this.ready;
    this.crash?.(new EngineInitError(ENGINE_STRINGS_DE.loadFailed));
    if (wasReady) {
      this.teardown();
      this.initPromise = null;
      this.setStatus({ state: 'error', error: ENGINE_STRINGS_DE.loadFailed });
    }
  }

  private teardown(): void {
    this.ready = false;
    this.generation += 1;
    const inner = this.inner;
    this.inner = null;
    this.crash = null;
    if (inner) inner.dispose();
    else this.transport?.terminate();
    this.transport = null;
  }

  /** Waits for `init`, rejecting early with `AbortError` when `signal` aborts meanwhile. */
  private async whenReady(signal: AbortSignal | undefined): Promise<{ inner: EngineService; crashed: Promise<never> }> {
    if (signal?.aborted) throw abortError();
    const init = this.init();
    if (signal) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal.addEventListener('abort', onAbort, { once: true });
        init.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
      });
    } else {
      await init;
    }
    if (!this.inner || !this.crashed) throw new EngineInitError(ENGINE_STRINGS_DE.loadFailed);
    return { inner: this.inner, crashed: this.crashed };
  }

  async analyse(fen: Fen, opts: AnalyseOptions = {}): Promise<EngineAnalysis> {
    const { inner, crashed } = await this.whenReady(opts.signal);
    return Promise.race([inner.analyse(fen, applyBudget(opts, this.budget)), crashed]);
  }

  async bestMove(fen: Fen, opts: BestMoveOptions = {}): Promise<{ move: Uci | null; lines: EngineLine[] }> {
    const { inner, crashed } = await this.whenReady(opts.signal);
    return Promise.race([inner.bestMove(fen, applyBudget(opts, this.budget)), crashed]);
  }

  async stop(): Promise<void> {
    await this.inner?.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.crash?.(new Error(`${this.id} is disposed`));
    this.teardown();
    this.initPromise = null;
    this.setStatus({ state: 'idle' });
  }
}

/** Creates a lazy browser engine (see file header). */
export function createBrowserEngineService(opts: BrowserEngineOptions): EngineService {
  return new BrowserEngineService(opts);
}
