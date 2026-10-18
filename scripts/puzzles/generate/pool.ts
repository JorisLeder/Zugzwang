/**
 * Runs self-play games on worker processes (or in-process) and hands the results to a consumer **in game-index
 * order**, so the generated bank does not depend on how fast each worker was. Finished games are cached in
 * `.cache/puzzles-generate/<key>/game-<index>.json`; the key covers the seed, the config, `GENERATOR_VERSION` and the
 * source of every file that influences a game result (so any change there replays the games). Rating, explanation
 * and output (`rating.ts`, `assemble.ts`, `output.ts`) run on the cached results and can be changed freely.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpeningBook } from '@/analysis';
import { playGame, type GameResult, type GeneratorConfig } from './selfplay';
import { createGameEngines, disposeGameEngines, WORKER_ENV, type FromWorker, type ToWorker } from './worker';

/** Bump when the generator's game results change for the same seed and config. */
export const GENERATOR_VERSION = 'gen-1';

/** Plays one game. */
export interface GameRunner {
  run(index: number): Promise<GameResult>;
  close(): void;
}

/** In-process runner (tests, `--workers 0`). */
export function createInProcessRunner(seed: number, config: GeneratorConfig, book: Pick<OpeningBook, 'get'>): GameRunner {
  const engines = createGameEngines();
  let queue: Promise<unknown> = Promise.resolve();
  return {
    run(index) {
      const p = queue.then(() => playGame(engines, book, seed, index, config));
      queue = p.catch(() => undefined);
      return p;
    },
    close() {
      disposeGameEngines(engines);
    },
  };
}

/** Pool of `n` worker processes. */
export function createWorkerPool(n: number, seed: number, config: GeneratorConfig): GameRunner {
  const workerPath = fileURLToPath(new URL('./worker.ts', import.meta.url));
  type Job = { index: number; resolve: (r: GameResult) => void; reject: (e: Error) => void };
  const waiting: Job[] = [];
  const idle: ChildProcess[] = [];
  const busy = new Map<ChildProcess, Job>();
  const children: ChildProcess[] = [];
  let closed = false;
  const dispatch = () => {
    while (idle.length > 0 && waiting.length > 0) {
      const child = idle.shift()!;
      const job = waiting.shift()!;
      busy.set(child, job);
      child.send({ type: 'game', index: job.index } satisfies ToWorker);
    }
  };
  for (let i = 0; i < n; i++) {
    const child = fork(workerPath, [], { execArgv: ['--import', 'tsx'], env: { ...process.env, [WORKER_ENV]: '1' } });
    children.push(child);
    child.on('message', (msg: FromWorker) => {
      if (msg.type === 'ready') {
        idle.push(child);
      } else {
        const job = busy.get(child);
        busy.delete(child);
        idle.push(child);
        if (job) {
          if (msg.type === 'result') job.resolve(msg.result);
          else job.reject(new Error(`game ${msg.index}: ${msg.message}`));
        }
      }
      dispatch();
    });
    child.on('exit', (code) => {
      const job = busy.get(child);
      if (job && !closed) job.reject(new Error(`worker exited with code ${String(code)} during game ${job.index}`));
    });
    child.send({ type: 'init', seed, config } satisfies ToWorker);
  }
  return {
    run(index) {
      return new Promise<GameResult>((resolve, reject) => {
        waiting.push({ index, resolve, reject });
        dispatch();
      });
    },
    close() {
      closed = true;
      for (const c of children) {
        if (c.connected) c.send({ type: 'exit' } satisfies ToWorker);
        setTimeout(() => c.kill(), 2000).unref();
      }
    },
  };
}

/** Files whose content decides a game result (part of the cache key). */
export const GAME_SOURCES = [
  'scripts/puzzles/generate/detect.ts',
  'scripts/puzzles/generate/engine.ts',
  'scripts/puzzles/generate/openings.ts',
  'scripts/puzzles/generate/rng.ts',
  'scripts/puzzles/generate/selfplay.ts',
  'scripts/puzzles/generate/solution.ts',
  'scripts/puzzles/generate/tagger.ts',
  'scripts/puzzles/lib/puzzleChecks.ts',
  'src/analysis/motifs.ts',
  'src/analysis/phase.ts',
] as const;

/** Cache directory of a seed/config combination (see the file header). */
export function cacheDir(rootDir: string, seed: number, config: GeneratorConfig): string {
  const hash = createHash('sha256').update(JSON.stringify({ seed, config, v: GENERATOR_VERSION }));
  for (const f of GAME_SOURCES) {
    const path = join(rootDir, f);
    hash.update(`\u0000${f}\u0000${existsSync(path) ? readFileSync(path, 'utf8') : ''}`);
  }
  return join(rootDir, '.cache', 'puzzles-generate', hash.digest('hex').slice(0, 16));
}

/** Options of `runGamesInOrder`. */
export interface RunOptions {
  runner: GameRunner;
  /** Parallel games in flight (≥ number of workers). */
  window: number;
  maxGames: number;
  /** Cache directory (`null` disables the cache). */
  cache: string | null;
  /** Called for every game in index order; return `true` to stop. */
  consume(result: GameResult): boolean;
}

/** Plays games 0, 1, 2 … until `consume` returns `true` or `maxGames` is reached; returns the number consumed. */
export async function runGamesInOrder(opts: RunOptions): Promise<number> {
  const pending = new Map<number, Promise<GameResult>>();
  if (opts.cache) mkdirSync(opts.cache, { recursive: true });
  const get = (index: number): Promise<GameResult> => {
    const file = opts.cache ? join(opts.cache, `game-${index}.json`) : null;
    if (file && existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')) as GameResult);
    return opts.runner.run(index).then((r) => {
      if (file) writeFileSync(file, JSON.stringify(r));
      return r;
    });
  };
  let launched = 0;
  for (let cursor = 0; cursor < opts.maxGames; cursor++) {
    while (launched < opts.maxGames && launched < cursor + opts.window) {
      const p = get(launched);
      p.catch(() => undefined);
      pending.set(launched, p);
      launched++;
    }
    const result = await pending.get(cursor)!;
    pending.delete(cursor);
    if (opts.consume(result)) return cursor + 1;
  }
  return opts.maxGames;
}
