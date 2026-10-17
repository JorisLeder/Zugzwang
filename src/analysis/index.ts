/**
 * `@/analysis` – analysis pipeline (D-03, PRD P0-10/P0-11/P0-08). Owned by WP-02.
 *
 * - `createAnalysisService(engine, config)` – the app's `AnalysisService` on the `analysis` engine.
 * - Pure functions: `winPercent`, `moveAccuracy`, `gameAccuracy`, `expectedPointsLoss`, `classifyMove`,
 *   `detectMotifs` (+ the single detectors), `buildFacts`, `lookupOpening`, `gamePhase`.
 * Runs in Node as well (bench, puzzle generator, validators) with `createNodeEngineService()` from `@/lib/uci/node`.
 */
import type { AnalysisService } from '@/core/analysis';
import type { EngineService } from '@/core/engine';
import type { AppConfig } from '@/core/services';
import { createLichessCloudEval } from '@/engine';
import { createAnalysisServiceWithOptions } from './service';

export { gameAccuracy, moveAccuracy } from './accuracy';
export {
  classifyMove,
  CLASSIFICATION_THRESHOLDS,
  isBrilliant,
  isGreat,
  isMiss,
  isRecapture,
  sacrificeSee,
  type ClassifyInput,
} from './classify';
export { buildFacts, MAX_LINE_PLIES, type BuildFactsInput } from './facts';
export {
  detectBackRankWeakness,
  detectDiscoveredAttacks,
  detectDoubleCheck,
  detectFork,
  detectHangingPieces,
  detectMateThreat,
  detectMaterialLoss,
  detectMotifs,
  detectPins,
  detectSkewers,
  detectTrappedPieces,
  materialSwing,
} from './motifs';
export { createOpeningBook, loadOpeningBook, lookupOpening, openingKey, type OpeningBook, type OpeningInfo } from './openings';
export { divideGame, gamePhase, gamePhases, type Division } from './phase';
export { captureGain, seeMove } from './see';
export {
  ANALYSIS_VERSION,
  analysisEngineVersion,
  createAnalysisServiceWithOptions,
  DEFAULT_ANALYSIS_OPTIONS,
  DEFAULT_GAME_DEPTH,
  keyMoments,
  type AnalysisServiceOptions,
  type SearchLimits,
} from './service';
export {
  CP_CEILING,
  expectedPoints,
  expectedPointsLoss,
  scoreWinPercent,
  WIN_PERCENT_MULTIPLIER,
  winningChances,
  winPercent,
} from './winPercent';

/** Creates the analysis service on top of the `analysis` engine (Lichess cloud-eval first when enabled). */
export function createAnalysisService(engine: EngineService, config: AppConfig): AnalysisService {
  return createAnalysisServiceWithOptions(engine, {
    cloudEval: config.cloudEvalEnabled ? createLichessCloudEval() : null,
  });
}
