/**
 * Engines of the puzzle generator (Node Stockfish 19 lite via `@/lib/uci/node`).
 *
 * Stockfish results at a fixed depth depend on the transposition table, i.e. on what the engine searched before. To
 * make a run reproducible for a given seed (independent of which worker process plays which game), the generator
 * clears the hash (`ucinewgame`) before a search:
 * - `perSearch` engines clear it before every search (self-play, puzzle detection, solution extension);
 * - `perPuzzle` engines clear it only when `reset()` was called – the final second-opinion check runs every puzzle
 *   like the validator does (hash kept between the solver plies of one puzzle) but from a defined start.
 */
import type { Fen, Uci } from '@/core/chess';
import type { EngineAnalysis, EngineService, UciTransport } from '@/core/engine';
import { createUciEngineService } from '@/lib/uci';
import { createNodeTransport, NODE_ENGINE_ID } from '@/lib/uci/node';

/** A generator engine. */
export interface GeneratorEngine {
  service: EngineService;
  /** Clears the hash before the next search (`perPuzzle` mode; a no-op for `perSearch`). */
  reset(): void;
  dispose(): void;
}

/** Creates a Stockfish instance whose hash is cleared before every search or on `reset()`. */
export function createGeneratorEngine(mode: 'perSearch' | 'perPuzzle', hashMb = mode === 'perSearch' ? 16 : 32): GeneratorEngine {
  const inner = createNodeTransport('lite-single');
  let clearNext = true;
  const transport: UciTransport = {
    send(cmd) {
      if (cmd.startsWith('position ') && (mode === 'perSearch' || clearNext)) {
        inner.send('ucinewgame');
        clearNext = false;
      }
      inner.send(cmd);
    },
    onLine: (cb) => inner.onLine(cb),
    terminate: () => inner.terminate(),
  };
  const service = createUciEngineService(transport, NODE_ENGINE_ID, { initOptions: { Hash: hashMb } });
  return {
    service,
    reset() {
      clearNext = true;
    },
    dispose() {
      service.dispose();
    },
  };
}

/** An analysis plus the best move (MultiPV 1) the engine reported at every completed depth. */
export interface TrackedAnalysis extends EngineAnalysis {
  bestByDepth: Array<[depth: number, move: Uci]>;
}

/** `analyse` that records the best move per depth (for the "depth at which Stockfish finds the move" feature). */
export async function analyseTracked(engine: EngineService, fen: Fen, depth: number, multiPv: number): Promise<TrackedAnalysis> {
  const byDepth = new Map<number, Uci>();
  const analysis = await engine.analyse(fen, {
    depth,
    multiPv,
    onUpdate: (lines) => {
      const best = lines.find((l) => l.multipv === 1);
      if (best && best.pv[0] && best.bound === undefined) byDepth.set(best.depth, best.pv[0]);
    },
  });
  const first = analysis.lines[0];
  if (first?.pv[0]) byDepth.set(first.depth, first.pv[0]);
  return { ...analysis, bestByDepth: [...byDepth.entries()].sort((a, b) => a[0] - b[0]) };
}

/**
 * Smallest depth from which the engine's best move never changed again (1 when it was best from the start, the final
 * depth when it was found only at the end).
 */
export function findDepth(bestByDepth: ReadonlyArray<readonly [number, Uci]>, finalMove: Uci): number {
  if (bestByDepth.length === 0) return 1;
  let depth = bestByDepth[bestByDepth.length - 1]![0];
  for (let i = bestByDepth.length - 1; i >= 0; i--) {
    if (bestByDepth[i]![1] !== finalMove) break;
    depth = bestByDepth[i]![0];
  }
  return depth;
}
