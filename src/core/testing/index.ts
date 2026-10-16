/**
 * Test doubles and fixtures for every package (BACKLOG 2.6 "testing/"). Frozen (WP-00).
 * Until a dependency is integrated, test against these fakes (BACKLOG §0 "Interfaces").
 */
export { FakeAnalysisService, FIXTURE_GAME_ANALYSIS_SCRIPT, moveKey, type FakeAnalysisOptions } from './fakeAnalysis';
export { FakeBotEngine, seededRandom, type FakeBotOptions } from './fakeBots';
export { FakeEngineService, type FakeEngineLines, type FakeEngineOptions } from './fakeEngine';
export { FakeExplanationService } from './fakeExplain';
export { createFakeUciTransport, type FakeUciOptions, type FakeUciSearch, type FakeUciTransport } from './fakeUciTransport';
export { FIXTURE_BOTS, FIXTURE_COURSE, FIXTURE_GAME, FIXTURE_LESSON, FIXTURE_PUZZLES, type FixtureGame } from './fixtures';
export { createFakeAppServices, type FakeAppServicesOverrides } from './fakeAppServices';
export { createMemoryDataServices, type MemoryDataOptions, type MemoryDataServices } from './memoryData';
