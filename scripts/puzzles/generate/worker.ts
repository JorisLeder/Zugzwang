/**
 * Game worker of the puzzle generator (child process, started by `pool.ts` with `node --import tsx` and
 * `ZZ_PUZZLE_WORKER=1` – without that variable importing this file has no side effects). Protocol: the parent sends
 * `{ type: 'init', seed, config }` once, then `{ type: 'game', index }` messages; the worker answers each with
 * `{ type: 'result', index, result }` (or `{ type: 'error', index, message }`) and exits on `{ type: 'exit' }` or
 * when the parent disconnects.
 */
import { loadOpeningBook, type OpeningBook } from '@/analysis';
import { createGeneratorEngine } from './engine';
import { playGame, type GameEngines, type GameResult, type GeneratorConfig } from './selfplay';

/** Messages to a worker. */
export type ToWorker = { type: 'init'; seed: number; config: GeneratorConfig } | { type: 'game'; index: number } | { type: 'exit' };
/** Messages from a worker. */
export type FromWorker = { type: 'ready' } | { type: 'result'; index: number; result: GameResult } | { type: 'error'; index: number; message: string };

/** Creates the three engines of a game worker. */
export function createGameEngines(): GameEngines {
  return { screen: createGeneratorEngine('perPuzzle', 16), confirm: createGeneratorEngine('perSearch'), check: createGeneratorEngine('perPuzzle') };
}

/** Disposes the engines of a game worker. */
export function disposeGameEngines(e: GameEngines): void {
  e.screen.dispose();
  e.confirm.dispose();
  e.check.dispose();
}

function send(msg: FromWorker): void {
  process.send?.(msg);
}

/** Environment variable that turns this module into a worker process. */
export const WORKER_ENV = 'ZZ_PUZZLE_WORKER';

if (process.env[WORKER_ENV] === '1' && process.send) {
  let engines: GameEngines | null = null;
  let book: OpeningBook | null = null;
  let seed = 0;
  let config: GeneratorConfig | null = null;
  let queue = Promise.resolve();
  const shutdown = () => {
    if (engines) disposeGameEngines(engines);
    process.exit(0);
  };
  process.on('disconnect', shutdown);
  process.on('message', (msg: ToWorker) => {
    queue = queue.then(async () => {
      if (msg.type === 'exit') return shutdown();
      if (msg.type === 'init') {
        seed = msg.seed;
        config = msg.config;
        engines = createGameEngines();
        book = await loadOpeningBook();
        send({ type: 'ready' });
        return;
      }
      if (!engines || !book || !config) return send({ type: 'error', index: msg.index, message: 'worker not initialised' });
      try {
        send({ type: 'result', index: msg.index, result: await playGame(engines, book, seed, msg.index, config) });
      } catch (e) {
        send({ type: 'error', index: msg.index, message: e instanceof Error ? (e.stack ?? e.message) : String(e) });
      }
    });
  });
}
