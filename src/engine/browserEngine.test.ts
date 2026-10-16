import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineStatus, UciTransport } from '@/core/engine';
import { createFakeUciTransport, type FakeUciOptions, type FakeUciTransport } from '@/core/testing';
import { createNodeTransport } from '@/lib/uci/node';
import { createBrowserEngineService, getEngineBudget, type BrowserEngineOptions } from './browserEngine';
import { BENCHMARK_FEN } from './budget';
import { createEngineService } from './index';
import type { WorkerLike } from './workerTransport';

/**
 * Worker double: speaks UCI through any `UciTransport` (the scripted fake engine, or real Stockfish in Node) and
 * answers the stockfish.js `progressPort` handshake with two progress messages.
 */
class TransportWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(readonly backend: UciTransport) {
    backend.onLine((line) => this.onmessage?.({ data: line } as MessageEvent));
  }
  postMessage(message: unknown): void {
    if (typeof message === 'string') {
      this.backend.send(message);
    } else if (message && typeof message === 'object' && 'progressPort' in message) {
      const port = (message as { progressPort: MessagePort }).progressPort;
      port.postMessage({ percent: 0.5 });
      port.postMessage({ percent: 1 });
    }
  }
  terminate(): void {
    this.terminated = true;
    this.backend.terminate();
  }
  crash(message = 'RuntimeError: unreachable'): void {
    this.onerror?.({ message, preventDefault: () => undefined } as unknown as ErrorEvent);
  }
}

const disposables: Array<{ dispose(): void }> = [];
afterEach(() => {
  while (disposables.length) disposables.pop()!.dispose();
});

function fakeEngine(fakeOpts: FakeUciOptions = {}, opts: Partial<BrowserEngineOptions> = {}) {
  const workers: TransportWorker[] = [];
  const transports: FakeUciTransport[] = [];
  const createWorker = vi.fn((url: string) => {
    void url;
    const t = createFakeUciTransport(fakeOpts);
    transports.push(t);
    const w = new TransportWorker(t);
    workers.push(w);
    return w;
  });
  const engine = createBrowserEngineService({ role: 'analysis', createWorker, ...opts });
  disposables.push(engine);
  return { engine, createWorker, workers, transports };
}

function nodeEngine(role: 'play' | 'analysis') {
  const createWorker = vi.fn(() => new TransportWorker(createNodeTransport()));
  const engine = createBrowserEngineService({ role, createWorker, hashMb: 16 });
  disposables.push(engine);
  return { engine, createWorker };
}

describe('browser engine – lazy worker (D-51)', () => {
  it('construction creates no worker; init creates exactly one', async () => {
    const { engine, createWorker } = fakeEngine();
    expect(createWorker).not.toHaveBeenCalled();
    expect(engine.status()).toEqual({ state: 'idle' });
    await engine.init();
    await engine.init();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(createWorker.mock.calls[0]![0]).toBe('/engine/stockfish-19-lite-single.js');
  });

  it('the first search starts the worker without an explicit init', async () => {
    const { engine, createWorker } = fakeEngine();
    const a = await engine.analyse(BENCHMARK_FEN, { depth: 5 });
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(a.bestMove).toBe('e2e4');
  });

  it('createEngineService builds one independent instance per role without starting workers', () => {
    const create = vi.fn();
    vi.stubGlobal('Worker', create);
    try {
      const play = createEngineService('play', { mode: 'local', cloudEvalEnabled: false, e2e: false });
      const analysis = createEngineService('analysis', { mode: 'local', cloudEvalEnabled: false, e2e: false });
      expect(play).not.toBe(analysis);
      expect(play.id).toBe('stockfish-19-lite-single');
      expect(create).not.toHaveBeenCalled();
      play.dispose();
      analysis.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('browser engine – status, progress and budget', () => {
  it('reports loading progress, measures the speed and becomes ready', async () => {
    let clock = 0;
    const { engine, transports } = fakeEngine({}, { now: () => (clock += 300) });
    const states: EngineStatus[] = [];
    engine.onStatus((s) => states.push(s));
    await engine.init();
    expect(states[0]).toEqual({ state: 'loading', progress: 0 });
    expect(states.filter((s) => s.state === 'loading').map((s) => s.progress)).toEqual(expect.arrayContaining([0, 0.95]));
    expect(states.at(-1)).toEqual({ state: 'ready' });
    // speed measurement: go depth 10 on the benchmark position, 300 ms → normal device: depth 16, cap 1.2 s
    expect(transports[0]!.commands).toContain(`position fen ${BENCHMARK_FEN}`);
    expect(transports[0]!.commands).toContain('go depth 10');
    expect(getEngineBudget(engine)).toMatchObject({ depth: 16, movetimeCapMs: 1200, tier: 'normal', benchmarkMs: 300 });
    expect(transports[0]!.commands).toContain('setoption name Hash value 16');

    const busy: string[] = [];
    engine.onStatus((s) => busy.push(s.state));
    await engine.analyse(BENCHMARK_FEN);
    expect(transports[0]!.commands.at(-1 - transports[0]!.commands.slice().reverse().findIndex((c) => c.startsWith('go')))).toBe(
      'go depth 16 movetime 1200',
    );
    expect(busy).toEqual(['busy', 'ready']);
  });

  it('download progress is reported as loading progress 0–0.9', async () => {
    const { engine } = fakeEngine({}, { measureSpeed: false });
    const progress: number[] = [];
    engine.onStatus((s) => s.state === 'loading' && s.progress !== undefined && progress.push(s.progress));
    await engine.init();
    expect(progress).toEqual(expect.arrayContaining([0, 0.95]));
    expect(Math.max(...progress.filter((p) => p < 0.95))).toBeLessThanOrEqual(0.9);
  });

  it('a depth-only call gets the movetime cap', async () => {
    const { engine, transports } = fakeEngine({}, { now: () => 0 });
    await engine.bestMove(BENCHMARK_FEN, { depth: 20, skillLevel: 3 });
    expect(transports[0]!.commands).toContain('go depth 20 movetime 1500');
    expect(transports[0]!.commands).toContain('setoption name Skill Level value 3');
  });
});

describe('browser engine – errors', () => {
  it('without Worker: construction succeeds, init rejects, status "Engine nicht verfügbar"', async () => {
    const engine = createBrowserEngineService({ role: 'play', createWorker: () => null });
    disposables.push(engine);
    await expect(engine.init()).rejects.toThrow('Engine nicht verfügbar');
    expect(engine.status()).toEqual({ state: 'error', error: 'Engine nicht verfügbar' });
    await expect(engine.analyse(BENCHMARK_FEN)).rejects.toThrow('Engine nicht verfügbar');
  });

  it('a worker error while loading fails init; the next call starts a fresh worker', async () => {
    const { engine, createWorker, workers } = fakeEngine();
    const init = engine.init();
    workers[0]!.crash('404 stockfish-19-lite-single.wasm');
    await expect(init).rejects.toThrow('Engine konnte nicht geladen werden');
    expect(engine.status()).toEqual({ state: 'error', error: 'Engine konnte nicht geladen werden' });
    expect(workers[0]!.terminated).toBe(true);
    await engine.init();
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(engine.status().state).toBe('ready');
  });

  it('a stalled load (e.g. the .wasm download failed inside the worker) ends in an error, not a hang', async () => {
    const silent: WorkerLike = { onmessage: null, onerror: null, postMessage: () => undefined, terminate: () => undefined };
    const engine = createBrowserEngineService({ role: 'analysis', createWorker: () => silent, stallTimeoutMs: 50 });
    disposables.push(engine);
    const t0 = performance.now();
    await expect(engine.init()).rejects.toThrow('Engine konnte nicht geladen werden');
    expect(performance.now() - t0).toBeLessThan(1_000);
    expect(engine.status()).toEqual({ state: 'error', error: 'Engine konnte nicht geladen werden' });
  });

  it('download progress keeps a slow load alive', async () => {
    let progressPort: MessagePort | null = null;
    let backend: FakeUciTransport | null = null;
    const slow: WorkerLike & { onmessage: ((ev: MessageEvent) => void) | null } = {
      onmessage: null,
      onerror: null,
      postMessage(message: unknown) {
        if (typeof message === 'string') backend?.send(message);
        else progressPort = (message as { progressPort: MessagePort }).progressPort;
      },
      terminate: () => backend?.terminate(),
    };
    const engine = createBrowserEngineService({ role: 'analysis', createWorker: () => slow, stallTimeoutMs: 80, measureSpeed: false });
    disposables.push(engine);
    const init = engine.init();
    for (let i = 1; i <= 4; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      progressPort!.postMessage({ percent: i / 4 });
    }
    // The download finished: the engine starts answering.
    backend = createFakeUciTransport();
    backend.onLine((line) => slow.onmessage?.({ data: line } as MessageEvent));
    backend.send('uci');
    await expect(init).resolves.toBeUndefined();
    expect(engine.status().state).toBe('ready');
  });

  it('a crash during a search rejects the call and recovers on the next call', async () => {
    const { engine, createWorker, workers } = fakeEngine({
      search: (_fen, go) => (go.includes('depth 10') ? { info: ['info depth 10 score cp 5 pv e2e4'], bestmove: 'e2e4' } : { info: [], bestmove: 'e2e4', delayMs: Infinity }),
    });
    await engine.init();
    const running = engine.analyse(BENCHMARK_FEN, { depth: 30 });
    await new Promise((r) => setTimeout(r, 20));
    workers[0]!.crash();
    await expect(running).rejects.toThrow('Engine konnte nicht geladen werden');
    expect(engine.status()).toEqual({ state: 'error', error: 'Engine konnte nicht geladen werden' });
    await engine.init();
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it('dispose rejects running calls and terminates the worker', async () => {
    const { engine, workers } = fakeEngine({
      search: (_fen, go) => (go.includes('depth 10') ? { info: [], bestmove: 'e2e4' } : { info: [], bestmove: 'e2e4', delayMs: Infinity }),
    });
    await engine.init();
    const running = engine.analyse(BENCHMARK_FEN, { depth: 30 });
    await new Promise((r) => setTimeout(r, 20));
    engine.dispose();
    await expect(running).rejects.toThrow(/disposed/);
    expect(workers[0]!.terminated).toBe(true);
    expect(engine.status()).toEqual({ state: 'idle' });
    await expect(engine.init()).rejects.toThrow(/disposed/);
  });

  it('abort while waiting for init rejects with AbortError', async () => {
    const { engine } = fakeEngine();
    const controller = new AbortController();
    const p = engine.analyse(BENCHMARK_FEN, { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('browser engine – real Stockfish behind the worker interface (Node)', () => {
  it('two roles search independently; abort ends a search within 100 ms', async () => {
    const analysis = nodeEngine('analysis');
    const play = nodeEngine('play');
    await Promise.all([analysis.engine.init(), play.engine.init()]);
    expect(getEngineBudget(analysis.engine)?.depth).toBeGreaterThanOrEqual(10);

    const controller = new AbortController();
    const long = analysis.engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', {
      depth: 40,
      movetimeMs: 60_000,
      signal: controller.signal,
    });
    long.catch(() => undefined);
    // The play engine answers while the analysis engine is busy.
    const t0 = performance.now();
    const reply = await play.engine.bestMove(BENCHMARK_FEN, { depth: 8 });
    expect(reply.move).toMatch(/^[a-h][1-8][a-h][1-8]/);
    expect(performance.now() - t0).toBeLessThan(5_000);
    expect(analysis.engine.status().state).toBe('busy');

    const t1 = performance.now();
    controller.abort();
    await expect(long).rejects.toMatchObject({ name: 'AbortError' });
    expect(performance.now() - t1).toBeLessThanOrEqual(100);
    expect(analysis.createWorker).toHaveBeenCalledTimes(1);
    expect(play.createWorker).toHaveBeenCalledTimes(1);
  });

  it('stop() ends a running search with its partial result', async () => {
    const { engine } = nodeEngine('analysis');
    await engine.init();
    const running = engine.analyse(BENCHMARK_FEN, { depth: 40, movetimeMs: 60_000 });
    await new Promise((r) => setTimeout(r, 200));
    const t0 = performance.now();
    await engine.stop();
    const result = await running;
    expect(performance.now() - t0).toBeLessThanOrEqual(100);
    expect(result.bestMove).not.toBeNull();
    expect(result.lines[0]!.depth).toBeGreaterThan(0);
  });
});
