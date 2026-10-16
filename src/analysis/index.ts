/**
 * `@/analysis` – analysis pipeline factory (D-03). PLACEHOLDER written by WP-00: returns the fake analysis service
 * (knows the blunder of the fixture game). WP-02 replaces it WITHOUT changing the signature.
 */
import type { AnalysisService } from '@/core/analysis';
import type { EngineService } from '@/core/engine';
import type { AppConfig } from '@/core/services';
import { FakeAnalysisService, FIXTURE_GAME_ANALYSIS_SCRIPT } from '@/core/testing';

/** Creates the analysis service on top of the `analysis` engine. */
export function createAnalysisService(engine: EngineService, config: AppConfig): AnalysisService {
  void config;
  return new FakeAnalysisService({ engineId: engine.id, moves: FIXTURE_GAME_ANALYSIS_SCRIPT });
}
