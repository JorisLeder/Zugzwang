import { describe, expect, it } from 'vitest';
import type { AnalyseGameInput, AnalysisProgress, GameAnalysis } from '@/core/analysis';
import { START_FEN } from '@/core/chess';
import type { ExplanationFacts, ExplanationText } from '@/core/explain';
import type { AppServices } from '@/core/services';
import {
  createFakeAppServices,
  createMemoryDataServices,
  FakeAnalysisService,
  FakeExplanationService,
  FIXTURE_GAME,
  FIXTURE_GAME_ANALYSIS_SCRIPT,
  type MemoryDataServices,
} from '@/core/testing';
import { importedGameRecord, parsePgnWithDiagnostics } from '@/pgn';
import { currentEngineVersion } from './review';
import { ReviewController, type ReviewState } from './reviewController';

const ENGINE_ID = 'fake-analysis';

/** Fake analysis that counts calls and reports the real service's engine version. */
class CountingAnalysis extends FakeAnalysisService {
  calls = 0;
  constructor(opts: ConstructorParameters<typeof FakeAnalysisService>[0] = {}) {
    super({ engineId: ENGINE_ID, engineVersion: currentEngineVersion(ENGINE_ID), moves: FIXTURE_GAME_ANALYSIS_SCRIPT, ...opts });
  }
  override analyseGame(input: AnalyseGameInput, o?: { onProgress?: (p: AnalysisProgress) => void; signal?: AbortSignal }): Promise<GameAnalysis> {
    this.calls += 1;
    return super.analyseGame(input, o);
  }
}

/** Explanation service whose `explain` returns a (validated) LLM text. */
class LlmExplain extends FakeExplanationService {
  override async explain(facts: ExplanationFacts): Promise<ExplanationText> {
    const rule = this.explainRuleBased(facts);
    return { ...rule, plain: `KI: ${rule.plain}`, segments: [{ type: 'text', text: 'KI: ' }, ...rule.segments], source: 'llm' };
  }
}

function services(data: MemoryDataServices, analysis: FakeAnalysisService, explain = new FakeExplanationService()): AppServices {
  return createFakeAppServices({ data, analysis, explain });
}

async function importFixture(data: MemoryDataServices): Promise<string> {
  const parsed = parsePgnWithDiagnostics(FIXTURE_GAME.pgn);
  if (!parsed.ok) throw new Error('fixture PGN');
  const g = await data.progress.createGame(importedGameRecord(parsed.games[0]!, '2026-10-17T10:00:00.000Z'));
  return g.id;
}

async function until(ctrl: ReviewController, pred: (s: ReviewState) => boolean, ms = 5_000): Promise<ReviewState> {
  const start = Date.now();
  while (!pred(ctrl.getState())) {
    if (Date.now() - start > ms) throw new Error(`timeout; state: ${JSON.stringify({ ...ctrl.getState(), analysis: !!ctrl.getState().analysis })}`);
    await new Promise((r) => setTimeout(r, 5));
  }
  return ctrl.getState();
}

describe('ReviewController', () => {
  it('analyses automatically with progress, stores the analysis with explanations and reuses it on reopen', async () => {
    const data = createMemoryDataServices();
    const analysis = new CountingAnalysis({ delayPerMoveMs: 1 });
    const svc = services(data, analysis);
    const id = await importFixture(data);
    const ctrl = new ReviewController(svc, id);
    const progress: number[] = [];
    ctrl.subscribe(() => {
      const p = ctrl.getState().progress;
      if (p) progress.push(p.done);
    });
    ctrl.start();
    const done = await until(ctrl, (s) => s.run === 'done');
    expect(done.status).toBe('ready');
    expect(done.moves).toHaveLength(80);
    expect(analysis.calls).toBe(1);
    expect(progress.length).toBeGreaterThan(10);
    expect(Math.max(...progress)).toBe(80);
    const stored = await data.repos.gameAnalyses.get(id);
    expect(stored?.moves).toHaveLength(80);
    const blunder = stored!.moves[FIXTURE_GAME.blunder.ply - 1]!;
    expect(blunder.classification).toBe('blunder');
    expect(blunder.explanation?.source).toBe('rule');
    expect(blunder.explanation?.plain).toContain('Dc2');
    expect(blunder.explanation?.segments.some((s) => s.type === 'move')).toBe(true);
    // Every mistake, miss and blunder has an explanation.
    for (const m of stored!.moves) if (['mistake', 'miss', 'blunder'].includes(m.classification)) expect(m.explanation).toBeDefined();
    ctrl.dispose();

    // Deep link after "reload": a new controller on the same data reuses the stored analysis.
    const again = new ReviewController(services(data, analysis), id);
    again.start();
    const reopened = await until(again, (s) => s.status === 'ready');
    expect(reopened.run).toBe('done');
    expect(reopened.analysis?.moves).toHaveLength(80);
    expect(analysis.calls).toBe(1);
    again.dispose();
  });

  it('re-analyses when the stored engine version differs', async () => {
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    const old = new CountingAnalysis({ engineVersion: 'fake-analysis+zz-analysis-0' });
    const first = new ReviewController(services(data, old), id);
    first.start();
    await until(first, (s) => s.run === 'done');
    first.dispose();
    expect((await data.repos.gameAnalyses.get(id))?.engineVersion).toBe('fake-analysis+zz-analysis-0');
    const current = new CountingAnalysis();
    const second = new ReviewController(services(data, current), id);
    second.start();
    await until(second, (s) => s.run === 'done');
    expect(current.calls).toBe(1);
    expect((await data.repos.gameAnalyses.get(id))?.engineVersion).toBe(currentEngineVersion(ENGINE_ID));
    second.dispose();
  });

  it('can be cancelled and restarted', async () => {
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    const analysis = new CountingAnalysis({ delayPerMoveMs: 20 });
    const ctrl = new ReviewController(services(data, analysis), id);
    ctrl.start();
    await until(ctrl, (s) => s.run === 'running' && (s.progress?.done ?? 0) >= 2);
    ctrl.cancel();
    const cancelled = await until(ctrl, (s) => s.run === 'cancelled');
    expect(cancelled.analysis).toBeNull();
    expect(await data.repos.gameAnalyses.get(id)).toBeNull();
    ctrl.analyse();
    expect(ctrl.getState().run).toBe('running');
    ctrl.dispose();
  });

  it('upgrades explanations to validated LLM texts and stores them (cache key gameId:ply)', async () => {
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    const ctrl = new ReviewController(services(data, new CountingAnalysis(), new LlmExplain()), id);
    ctrl.start();
    await until(ctrl, (s) => s.analysis?.moves[FIXTURE_GAME.blunder.ply - 1]?.explanation?.source === 'llm');
    await new Promise((r) => setTimeout(r, 20));
    const stored = await data.repos.gameAnalyses.get(id);
    expect(stored?.moves[FIXTURE_GAME.blunder.ply - 1]?.explanation?.plain.startsWith('KI: ')).toBe(true);
    ctrl.dispose();
  });

  it('reports a missing game, a bot game from its event log and a game without moves', async () => {
    const data = createMemoryDataServices();
    const missing = new ReviewController(services(data, new CountingAnalysis()), 'nope');
    missing.start();
    expect((await until(missing, (s) => s.status !== 'loading')).status).toBe('missing');
    missing.dispose();

    const parsed = parsePgnWithDiagnostics('1. e4 *');
    if (!parsed.ok) throw new Error('pgn');
    const record = importedGameRecord(parsed.games[0]!, '2026-10-17T10:00:00.000Z');
    const bot = await data.progress.createGame({ ...record, source: 'bot', externalId: null, botId: 'pip', userColor: 'w', assistance: 'coach', pgn: '', status: 'finished' });
    for (const [i, uci] of ['e2e4', 'e7e5', 'g1f3'].entries()) await data.progress.appendGameEvent({ gameId: bot.id, seq: i + 1, kind: 'move', ply: i + 1, uci });
    const analysis = new CountingAnalysis();
    const ctrl = new ReviewController(services(data, analysis), bot.id);
    ctrl.start();
    const s = await until(ctrl, (st) => st.run === 'done');
    expect(s.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(s.startFen).toBe(START_FEN);
    ctrl.dispose();

    const empty = await data.progress.createGame({ ...record, source: 'bot', externalId: null, pgn: '', status: 'aborted' });
    const none = new ReviewController(services(data, analysis), empty.id);
    none.start();
    const e = await until(none, (st) => st.status === 'ready');
    expect(e.moves).toHaveLength(0);
    expect(e.run).toBe('idle');
    none.dispose();
  });
});
