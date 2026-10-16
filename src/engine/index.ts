/**
 * `@/engine` – browser engine factory (D-03, D-27, D-51) and the optional Lichess cloud-eval provider. Owned by WP-02.
 *
 * `createEngineService(role)` returns a lazy Stockfish Web Worker service per role (see `browserEngine.ts`); nothing
 * here touches `Worker` or `import.meta.env` at module load, so the module also loads in Node (scripts, tests).
 */
import type { EngineService } from '@/core/engine';
import type { AppConfig } from '@/core/services';
import { createBrowserEngineService } from './browserEngine';

export {
  BROWSER_ENGINE_ID,
  createBrowserEngineService,
  ENGINE_SCRIPT,
  getEngineBudget,
  type BrowserEngineOptions,
} from './browserEngine';
export {
  applyBudget,
  BENCHMARK_DEPTH,
  BENCHMARK_FEN,
  DEFAULT_ENGINE_BUDGET,
  deriveBudget,
  type EngineBudget,
} from './budget';
export {
  CLOUD_ENGINE_ID,
  CLOUD_EVAL_URL,
  createLichessCloudEval,
  type CloudEvalOptions,
  type CloudEvalProvider,
} from './cloudEval';
export { ENGINE_STRINGS_DE } from './strings.de';
export { createWorkerTransport, type WorkerLike, type WorkerTransportOptions } from './workerTransport';

/**
 * Creates one engine instance per role: `play` (bots, coach, hints) and `analysis` (review, analysis board).
 * The worker starts on `init()` or the first search (D-51).
 */
export function createEngineService(role: 'play' | 'analysis', config: AppConfig): EngineService {
  void config;
  return createBrowserEngineService({ role });
}
