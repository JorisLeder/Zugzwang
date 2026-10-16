/**
 * Application configuration and the service bundle provided by `src/app/services.tsx` (BACKLOG 2.6, D-03).
 */
import type { AnalysisService } from './analysis';
import type { BotEngine, BotProfile } from './bots';
import type { EngineService } from './engine';
import type { ExplanationService } from './explain';
import type { DataServices } from './storage';

/** Runtime configuration read from `import.meta.env` (only public `VITE_` variables). */
export interface AppConfig {
  /** `cloud` when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, otherwise `local` (D-15). */
  mode: 'local' | 'cloud';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** URL of the `explain` edge function (cloud mode only). */
  explainUrl?: string;
  /** Use the Lichess cloud-eval as an optional accelerator (`VITE_CLOUD_EVAL`). */
  cloudEvalEnabled: boolean;
  /** Running under Playwright (`VITE_E2E=1`): no artificial bot think time, no animations. */
  e2e: boolean;
}

/** All services, created once at startup and provided via React context (`useServices()`). */
export interface AppServices {
  config: AppConfig;
  data: DataServices;
  /** Two engine instances (D-27): `play` (bots, coach, hints) and `analysis` (review, analysis board). */
  engines: { play: EngineService; analysis: EngineService };
  analysis: AnalysisService;
  bots: BotEngine;
  botRoster: BotProfile[];
  explain: ExplanationService;
}
