/**
 * `createFakeAppServices()` – a complete `AppServices` bundle built only from fakes (added by the manager after WP-00,
 * D-45). Use it in component and page tests instead of `createAppServices(readAppConfig({}))`: once the wave-1
 * owners replace the factories, `createAppServices` builds the real Stockfish workers and the Dexie database, which
 * do not exist in jsdom and would make every test depend on every other package.
 *
 * ```tsx
 * const services = createFakeAppServices({ data: createMemoryDataServices({ puzzles: FIXTURE_PUZZLES }) });
 * render(<ServicesProvider services={services}><MemoryRouter><MyPage /></MemoryRouter></ServicesProvider>);
 * ```
 */
import type { AppConfig, AppServices } from '../services';
import { FakeAnalysisService, FIXTURE_GAME_ANALYSIS_SCRIPT } from './fakeAnalysis';
import { FakeBotEngine } from './fakeBots';
import { FakeEngineService } from './fakeEngine';
import { FakeExplanationService } from './fakeExplain';
import { FIXTURE_BOTS } from './fixtures';
import { createMemoryDataServices } from './memoryData';

/** Overrides for `createFakeAppServices`: any service, and single config fields. */
export type FakeAppServicesOverrides = Partial<Omit<AppServices, 'config'>> & { config?: Partial<AppConfig> };

/**
 * Builds the bundle: local mode, `e2e: true` (no bot think time, no animations), memory data services
 * (`Europe/Berlin`), two `FakeEngineService`s, `FakeAnalysisService` with the fixture-game script, seeded
 * `FakeBotEngine`, `FIXTURE_BOTS` sorted by Elo, `FakeExplanationService`. Every part can be overridden.
 */
export function createFakeAppServices(overrides: FakeAppServicesOverrides = {}): AppServices {
  const config: AppConfig = { mode: 'local', cloudEvalEnabled: false, e2e: true, ...overrides.config };
  const data = overrides.data ?? createMemoryDataServices({ timeZone: 'Europe/Berlin' });
  const engines = overrides.engines ?? {
    play: new FakeEngineService({ id: 'fake-play' }),
    analysis: new FakeEngineService({ id: 'fake-analysis' }),
  };
  return {
    config,
    data,
    engines,
    analysis:
      overrides.analysis ?? new FakeAnalysisService({ engineId: engines.analysis.id, moves: FIXTURE_GAME_ANALYSIS_SCRIPT }),
    bots: overrides.bots ?? new FakeBotEngine({ seed: 1 }),
    botRoster: overrides.botRoster ?? [...FIXTURE_BOTS].sort((a, b) => a.elo - b.elo),
    explain: overrides.explain ?? new FakeExplanationService(),
  };
}
