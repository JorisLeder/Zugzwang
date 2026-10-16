import { describe, expect, it } from 'vitest';
import { START_FEN } from '../chess';
import { createFakeAppServices } from './fakeAppServices';
import { FakeEngineService } from './fakeEngine';
import { createMemoryDataServices } from './memoryData';

describe('createFakeAppServices', () => {
  it('builds a complete local bundle from fakes', async () => {
    const s = createFakeAppServices();
    expect(s.config).toEqual({ mode: 'local', cloudEvalEnabled: false, e2e: true });
    expect(s.engines.play.id).toBe('fake-play');
    expect(s.engines.analysis.id).toBe('fake-analysis');
    expect(s.botRoster.map((b) => b.elo)).toEqual([...s.botRoster.map((b) => b.elo)].sort((a, b) => a - b));
    expect(s.data.auth.mode).toBe('local');
    const move = await s.bots.chooseMove({ bot: s.botRoster[0]!, startFen: START_FEN, moves: [] });
    expect(move.uci).toMatch(/^[a-h][1-8][a-h][1-8]$/);
    const a = await s.engines.analysis.analyse(START_FEN, { depth: 5 });
    expect(a.bestMove).not.toBeNull();
    expect(s.explain.explainRuleBased({ kind: 'praise', mover: 'w', fenBefore: START_FEN, bestLine: [], refutation: [], motifs: [] }).source).toBe('rule');
  });

  it('accepts overrides for services and single config fields', () => {
    const data = createMemoryDataServices({ deviceId: 'device-x' });
    const play = new FakeEngineService({ id: 'scripted' });
    const s = createFakeAppServices({ data, engines: { play, analysis: play }, config: { mode: 'cloud' } });
    expect(s.data.deviceId).toBe('device-x');
    expect(s.engines.play).toBe(play);
    expect(s.config).toMatchObject({ mode: 'cloud', e2e: true });
  });
});
