/**
 * Node engine helper for scripts (validators, puzzle generator, bot calibration, bench): one shared Stockfish 19 lite
 * instance per process via `@/lib/uci/node`. Owned by WP-00.
 */
import type { EngineAnalysis, EngineService } from '@/core/engine';
import { createNodeEngineService, NODE_ENGINE_ID } from '@/lib/uci/node';

export { NODE_ENGINE_ID };

let shared: EngineService | null = null;

/** The shared engine of this process (created lazily, initialised on first use). */
export function sharedEngine(): EngineService {
  if (!shared) shared = createNodeEngineService();
  return shared;
}

/** Disposes the shared engine (call at the end of a script so the process can exit). */
export function disposeSharedEngine(): void {
  shared?.dispose();
  shared = null;
}

/** Runs `fn` with a fresh engine and disposes it afterwards. */
export async function withEngine<T>(fn: (engine: EngineService) => Promise<T>): Promise<T> {
  const engine = createNodeEngineService();
  try {
    await engine.init();
    return await fn(engine);
  } finally {
    engine.dispose();
  }
}

/** Analyses one position with the shared engine (`go depth N`, MultiPV optional). */
export function analysePosition(fen: string, depth = 18, multiPv = 1): Promise<EngineAnalysis> {
  return sharedEngine().analyse(fen, { depth, multiPv });
}
