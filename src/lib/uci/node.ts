/**
 * Node.js Stockfish (npm `stockfish` 19, lite single-threaded WASM) for tests and scripts (validators, puzzle
 * generator, bot calibration, analysis bench). **Node only** – never import this file from browser code
 * (the browser engine is a Web Worker, `src/engine`).
 *
 * Each transport loads a fresh copy of the engine module (the npm module keeps its state in module scope), so
 * several engines can run in one process. Call `dispose()` when done so the process can exit.
 */
import { createRequire } from 'node:module';
import type { EngineService, UciTransport } from '@/core/engine';
import { createUciEngineService, type UciEngineOptions } from './service';

const require = createRequire(import.meta.url);

/** Engine flavours shipped by the npm package. The app uses `lite-single` everywhere. */
export type StockfishFlavor = 'lite-single' | 'lite' | 'single' | 'full' | 'asm';

interface StockfishModule {
  (flavor: string, onMessage: (line: string) => void): { processCommand(cmd: string): void; terminate(): void };
  findEngine(flavor: string): string;
}

/** Engine id of the lite single-threaded build (stored as `engineId`). */
export const NODE_ENGINE_ID = 'stockfish-19-lite-single';

/** UCI transport over `require('stockfish')(flavor, onLine)` with `processCommand` / `terminate`. */
export function createNodeTransport(flavor: StockfishFlavor = 'lite-single'): UciTransport {
  const stockfish = require('stockfish') as StockfishModule;
  // Fresh module instance per transport (the engine file keeps one engine per module evaluation).
  delete require.cache[require.resolve(stockfish.findEngine(flavor))];
  const listeners = new Set<(line: string) => void>();
  const engine = stockfish(flavor, (text: string) => {
    for (const line of String(text).split('\n')) {
      if (line.trim()) for (const cb of [...listeners]) cb(line);
    }
  });
  let terminated = false;
  return {
    send(cmd) {
      if (!terminated) engine.processCommand(cmd);
    },
    onLine(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    terminate() {
      if (terminated) return;
      terminated = true;
      listeners.clear();
      engine.terminate();
    },
  };
}

/** Options of `createNodeEngineService`. */
export interface NodeEngineOptions extends UciEngineOptions {
  flavor?: StockfishFlavor;
  id?: string;
}

/**
 * Node `EngineService` (verified: depth 12 on the start position ≈ 0.2 s on this machine).
 * Hash defaults to 32 MB.
 */
export function createNodeEngineService(opts: NodeEngineOptions = {}): EngineService {
  const { flavor = 'lite-single', id = NODE_ENGINE_ID, ...rest } = opts;
  return createUciEngineService(createNodeTransport(flavor), id, {
    ...rest,
    initOptions: { Hash: 32, ...(rest.initOptions ?? {}) },
  });
}
