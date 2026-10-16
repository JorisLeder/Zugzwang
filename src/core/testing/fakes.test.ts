import { describe, expect, it } from 'vitest';
import { ChessGame, positionKey } from '@/lib/chess';
import { START_FEN } from '../chess';
import { FakeAnalysisService, FIXTURE_GAME_ANALYSIS_SCRIPT, moveKey } from './fakeAnalysis';
import { FakeBotEngine } from './fakeBots';
import { FakeEngineService } from './fakeEngine';
import { FakeExplanationService } from './fakeExplain';
import { FIXTURE_GAME } from './fixtures';

describe('FakeEngineService', () => {
  it('defaults to the first legal move with cp 0', async () => {
    const e = new FakeEngineService();
    const a = await e.analyse(START_FEN);
    const first = ChessGame.fromFen(START_FEN).legalMoves()[0]!.uci;
    expect(a).toMatchObject({ fen: START_FEN, bestMove: first, source: 'local', engineId: 'fake-engine' });
    expect(a.lines[0]!.score).toEqual({ type: 'cp', value: 0 });
    const mated = await e.analyse('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(mated.bestMove).toBeNull();
    expect(mated.lines).toEqual([]);
  });

  it('returns scripted lines by FEN or position key and honours multiPv', async () => {
    const lines = [
      { multipv: 1, depth: 18, score: { type: 'mate' as const, value: 1 }, pv: ['d1d8'] },
      { multipv: 2, depth: 18, score: { type: 'cp' as const, value: 50 }, pv: ['g2g3'] },
    ];
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const e = new FakeEngineService({ lines: { [positionKey(fen)]: lines } });
    const updates: number[] = [];
    const one = await e.analyse(fen, { onUpdate: (l) => updates.push(l.length) });
    expect(one.lines).toHaveLength(1);
    expect(one.bestMove).toBe('d1d8');
    const two = await e.analyse(fen, { multiPv: 2 });
    expect(two.lines.map((l) => l.pv[0])).toEqual(['d1d8', 'g2g3']);
    expect((await e.bestMove(fen)).move).toBe('d1d8');
    expect(updates).toEqual([1]);
    expect(e.calls.map((c) => c.method)).toEqual(['analyse', 'analyse', 'bestMove']);
  });

  it('emits status, supports abort with latency and failing init', async () => {
    const e = new FakeEngineService({ delayMs: 50 });
    const states: string[] = [];
    e.onStatus((s) => states.push(s.state));
    const ctrl = new AbortController();
    const p = e.analyse(START_FEN, { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(states).toEqual(['loading', 'ready', 'busy', 'ready']);
    const broken = new FakeEngineService({ failInit: 'kaputt' });
    await expect(broken.analyse(START_FEN)).rejects.toThrow('kaputt');
    expect(broken.status()).toEqual({ state: 'error', error: 'kaputt' });
  });
});

describe('FakeAnalysisService', () => {
  it('analyses the fixture game and reports the scripted blunder', async () => {
    const svc = new FakeAnalysisService({ moves: FIXTURE_GAME_ANALYSIS_SCRIPT });
    const progress: number[] = [];
    const a = await svc.analyseGame(
      { gameId: 'g1', startFen: START_FEN, moves: FIXTURE_GAME.moves },
      { onProgress: (p) => progress.push(p.done) },
    );
    expect(a.moves).toHaveLength(80);
    expect(progress.at(-1)).toBe(80);
    expect(a.evalGraph).toHaveLength(81);
    const blunder = a.moves[FIXTURE_GAME.blunder.ply - 1]!;
    expect(blunder).toMatchObject({ classification: 'blunder', bestMove: 'f1f2', bestMoveSan: 'Rxf2', san: 'Qc2' });
    expect(blunder.facts).toMatchObject({ kind: 'mistake', mover: 'w', bestMove: { san: 'Rxf2' }, playedMove: { san: 'Qc2' } });
    expect(a.counts.w.blunder).toBe(1);
    expect(a.counts.w.best + a.counts.b.best).toBe(79);
    expect(a.keyMoments).toEqual([27]);
  });

  it('assesses moves, finds scripted threats and aborts', async () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const svc = new FakeAnalysisService({
      assessments: { [moveKey(fen, 'd1d2')]: { expectedPointsLoss: 0.6, classification: 'blunder', bestMove: 'd1d8' } },
      threats: { [positionKey(fen)]: null },
    });
    const bad = await svc.assessMove(fen, 'd1d2');
    expect(bad).toMatchObject({ expectedPointsLoss: 0.6, classification: 'blunder', bestMove: 'd1d8' });
    expect(bad.facts).toMatchObject({ kind: 'coach_warning', playedMove: { san: 'Rd2' }, bestMove: { san: 'Rd8#' } });
    expect((await svc.assessMove(fen, 'd1d8')).classification).toBe('best');
    expect(await svc.findThreats(fen)).toBeNull();
    svc.prepare(fen);
    expect(svc.prepared).toEqual([fen]);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(svc.analyseGame({ gameId: 'x', startFen: START_FEN, moves: ['e2e4'] }, { signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('FakeBotEngine', () => {
  it('plays legal, reproducible moves', async () => {
    const bot = { ...(await import('./fixtures')).FIXTURE_BOTS[0]! };
    const a = new FakeBotEngine({ seed: 7 });
    const b = new FakeBotEngine({ seed: 7 });
    const req = { bot, startFen: START_FEN, moves: ['e2e4'] };
    const m1 = await a.chooseMove(req);
    expect(m1.uci).toBe((await b.chooseMove(req)).uci);
    expect(ChessGame.fromMoves(START_FEN, ['e2e4', m1.uci]).ply()).toBe(2);
    expect(await a.shouldClaimDraw(START_FEN, bot)).toBe(false);
    expect(await new FakeBotEngine({ claimDraws: true }).shouldClaimDraw(START_FEN, bot)).toBe(true);
  });
});

describe('FakeExplanationService', () => {
  it('renders facts as text with German notation in `plain`', async () => {
    const svc = new FakeExplanationService();
    const text = await svc.explain({
      kind: 'mistake',
      mover: 'w',
      fenBefore: FIXTURE_GAME.blunder.fenBefore,
      playedMove: { uci: 'd1c2', san: 'Qc2' },
      bestMove: { uci: 'f1f2', san: 'Rxf2' },
      bestLine: ['Rxf2'],
      refutation: [],
      motifs: [],
    });
    expect(text.plain).toBe('Gespielt: Dc2. Besser: Txf2.');
    expect(text.segments).toContainEqual({ type: 'move', san: 'Rxf2' });
    expect(text.source).toBe('rule');
    expect(svc.requests).toHaveLength(1);
  });
});
