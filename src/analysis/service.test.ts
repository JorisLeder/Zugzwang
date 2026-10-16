import { describe, expect, it, vi } from 'vitest';
import type { AnalysisProgress } from '@/core/analysis';
import type { Fen, Uci } from '@/core/chess';
import { START_FEN } from '@/core/chess';
import type { EngineLine } from '@/core/engine';
import { FakeEngineService, FIXTURE_GAME } from '@/core/testing';
import { createLichessCloudEval } from '@/engine';
import { ChessGame, positionKey, uciLineToSan } from '@/lib/chess';
import { createOpeningBook } from './openings';
import { createAnalysisServiceWithOptions, keyMoments } from './service';

const NO_BOOK = async () => createOpeningBook({ commit: 'none', entries: [] });

/** Positions of a game: index 0 = start, i = after ply i. */
function positionsOf(startFen: Fen, moves: Uci[]): Fen[] {
  const game = ChessGame.fromFen(startFen);
  const out = [game.fen()];
  for (const m of moves) out.push(game.move(m)!.fenAfter);
  return out;
}

/**
 * Fake engine with one scripted evaluation (White POV cp) per position; the PV's first move is the game move
 * (so the played move is the engine's best) unless `best[j]` overrides it.
 */
function scripted(startFen: Fen, moves: Uci[], cps: number[], best: Record<number, Uci> = {}, second: Record<number, EngineLine> = {}) {
  const engine = new FakeEngineService({ id: 'scripted-engine' });
  positionsOf(startFen, moves).forEach((fen, j) => {
    const legal = ChessGame.fromFen(fen).legalMoves();
    const pv0 = best[j] ?? moves[j] ?? legal[0]?.uci;
    if (!pv0) return;
    const lines: EngineLine[] = [{ multipv: 1, depth: 14, score: { type: 'cp', value: cps[j] ?? 0 }, pv: [pv0] }];
    if (second[j]) lines.push(second[j]);
    engine.setLines(positionKey(fen), lines);
  });
  return engine;
}

describe('keyMoments', () => {
  const m = (ply: number, loss: number) => ({ ply, expectedPointsLoss: loss });
  it('takes the ≤ 5 largest losses ≥ 0.10 in game order', () => {
    expect(keyMoments([m(1, 0.3), m(2, 0.11), m(3, 0.5), m(4, 0.2), m(5, 0.12), m(6, 0.4), m(7, 0.09)])).toEqual([1, 3, 4, 5, 6]);
  });
  it('3–5 moments when the game has them; fewer only if it has fewer', () => {
    expect(keyMoments([m(1, 0.1), m(2, 0.2), m(3, 0.3)])).toEqual([1, 2, 3]);
    expect(keyMoments([m(1, 0.1), m(2, 0.2), m(3, 0.3), m(4, 0.15)])).toEqual([1, 2, 3, 4]);
    expect(keyMoments([m(1, 0.25), m(2, 0.05)])).toEqual([1]);
    expect(keyMoments([m(1, 0.0999)])).toEqual([]);
  });
});

describe('analyseGame (scripted engine)', () => {
  // 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6?? 4. Qxf7#
  const MOVES = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];

  it('classifies, scores and explains every move; progress after every position', async () => {
    // White POV evaluations of the 8 positions; position 7 is checkmate (no search).
    const cps = [20, 30, 25, -40, 20, 20, 10_000];
    const engine = scripted(START_FEN, MOVES, cps, { 5: 'g7g6' }, {
      5: { multipv: 2, depth: 14, score: { type: 'cp', value: 300 }, pv: ['d8e7'] },
    });
    // After …Nf6?? the engine sees mate in 1 for White.
    const afterNf6 = positionsOf(START_FEN, MOVES)[6]!;
    engine.setLines(positionKey(afterNf6), [{ multipv: 1, depth: 14, score: { type: 'mate', value: 1 }, pv: ['h5f7'] }]);
    const service = createAnalysisServiceWithOptions(engine, { loadBook: NO_BOOK });
    const progress: AnalysisProgress[] = [];
    const a = await service.analyseGame({ gameId: 'g1', startFen: START_FEN, moves: MOVES }, { onProgress: (p) => progress.push(p) });

    expect(a).toMatchObject({ gameId: 'g1', engineId: 'scripted-engine', depth: 16, engineVersion: 'scripted-engine+zz-analysis-1' });
    expect(a.moves).toHaveLength(7);
    expect(a.moves.every((m) => m.bestMove !== null && m.bestMoveSan !== null)).toBe(true);
    const nf6 = a.moves[5]!;
    expect(nf6).toMatchObject({ san: 'Nf6', color: 'b', bestMove: 'g7g6', bestMoveSan: 'g6', classification: 'blunder' });
    expect(nf6.expectedPointsLoss).toBeGreaterThanOrEqual(0.2);
    expect(nf6.evalAfter).toEqual({ type: 'mate', value: 1 });
    expect(nf6.facts).toMatchObject({ kind: 'mistake', mover: 'b', playedMove: { san: 'Nf6' }, bestLine: ['g6'], refutation: ['Qxf7#'], mateIn: -1 });
    expect(nf6.facts!.motifs.map((m) => m.id)).toContain('mate');
    const mate = a.moves[6]!;
    expect(mate).toMatchObject({ san: 'Qxf7#', classification: 'best', evalAfter: { type: 'mate', value: 0 } });
    expect(mate.winPctAfter).toBeCloseTo(97.5447, 3);
    // Engine progress after each of the 8 positions, no search for the final mate.
    const enginePhase = progress.filter((p) => p.phase === 'engine');
    expect(enginePhase.map((p) => p.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(enginePhase.every((p) => p.total === 8)).toBe(true);
    expect(progress[0]).toEqual({ done: 0, total: 8, phase: 'book' });
    expect(progress.at(-1)).toEqual({ done: 1, total: 1, phase: 'facts' });
    expect(engine.calls.filter((c) => c.method === 'analyse')).toHaveLength(7);
    expect(engine.calls.every((c) => c.opts.multiPv === 2)).toBe(true);
    // Summary.
    expect(a.evalGraph).toHaveLength(8);
    expect(a.evalGraph[0]!.ply).toBe(0);
    expect(a.counts.b.blunder).toBe(1);
    expect(a.keyMoments).toEqual([6]);
    expect(a.accuracy.b).toBeLessThan(a.accuracy.w);
    expect(a.moves.map((m) => m.phase).every((p) => p === 'opening')).toBe(true);
  });

  it('marks book moves from the opening data and names the opening', async () => {
    const moves = FIXTURE_GAME.moves.slice(0, 12);
    const engine = scripted(START_FEN, moves, Array<number>(13).fill(20));
    const a = await createAnalysisServiceWithOptions(engine).analyseGame({ gameId: 'b', startFen: START_FEN, moves });
    expect(a.moves[0]).toMatchObject({ classification: 'book', opening: { eco: 'B00', name: "King's Pawn Game" } });
    expect(a.moves[4]).toMatchObject({ classification: 'book', opening: { eco: 'C50', name: 'Italian Game' } });
    expect(a.counts.w.book + a.counts.b.book).toBeGreaterThanOrEqual(10);
    // Positions before book moves only get a short search.
    expect(engine.calls[0]!.opts).toMatchObject({ depth: 10, movetimeMs: 60 });
  });

  it('book ends for good once a move leaves it, even when a book position is reached again (D-07)', async () => {
    // 1. Nf3 Nf6 (book) 2. Ng1 Ng8 (out of book) 3. e4 – the position of 1. e4 again, but the game has left book.
    const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'e2e4'];
    const engine = scripted(START_FEN, moves, Array<number>(6).fill(0));
    const a = await createAnalysisServiceWithOptions(engine).analyseGame({ gameId: 'c', startFen: START_FEN, moves });
    expect(a.moves.map((m) => m.classification === 'book')).toEqual([true, true, false, false, false]);
    expect(a.moves[4]!.opening).toEqual({ eco: 'B00', name: "King's Pawn Game" });
  });

  it('finds up to 5 key moments among many blunders', async () => {
    const moves = FIXTURE_GAME.moves.slice(0, 30);
    // Evaluation swings: every 3rd ply from 6 on loses a lot for the mover (position j = after ply j; an odd j
    // follows a White move, so White's blunder turns the evaluation to −600, a Black blunder to +600).
    const cps: number[] = [];
    let cp = 0;
    for (let j = 0; j <= 30; j += 1) {
      if (j >= 6 && j % 3 === 0) cp = j % 2 === 1 ? -600 : 600;
      cps.push(cp);
    }
    const engine = scripted(START_FEN, moves, cps, Object.fromEntries(moves.map((_, j) => [j, ChessGame.fromFen(positionsOf(START_FEN, moves)[j]!).legalMoves().find((m) => m.uci !== moves[j])!.uci])));
    const a = await createAnalysisServiceWithOptions(engine, { loadBook: NO_BOOK }).analyseGame({ gameId: 'k', startFen: START_FEN, moves });
    const big = a.moves.filter((m) => m.expectedPointsLoss >= 0.1);
    expect(big.length).toBeGreaterThan(5);
    expect(a.keyMoments).toHaveLength(5);
    expect([...a.keyMoments].sort((x, y) => x - y)).toEqual(a.keyMoments);
    for (const ply of a.keyMoments) expect(a.moves[ply - 1]!.expectedPointsLoss).toBeGreaterThanOrEqual(0.1);
    // Facts for every mistake, miss and blunder, built from the engine lines only.
    for (const m of a.moves) {
      const needsFacts = m.classification === 'mistake' || m.classification === 'miss' || m.classification === 'blunder';
      expect(Boolean(m.facts)).toBe(needsFacts);
      if (m.facts) {
        expect(m.facts.bestLine).toEqual(uciLineToSan(m.fenBefore, m.bestLine).slice(0, 8));
        expect(m.facts.refutation).toEqual(uciLineToSan(m.fenAfter, m.playedLine.slice(1)).slice(0, 8));
      }
    }
  });

  it('a game from a FEN position (Black to move) works', async () => {
    const start = '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 30';
    const moves = ['h7h6', 'a1a8'];
    const engine = scripted(start, moves, [500, 500, 500]);
    const a = await createAnalysisServiceWithOptions(engine, { loadBook: NO_BOOK }).analyseGame({ gameId: 'f', startFen: start, moves });
    expect(a.moves.map((m) => [m.ply, m.color, m.san])).toEqual([
      [1, 'b', 'h6'],
      [2, 'w', 'Ra8+'],
    ]);
    expect(a.evalGraph).toHaveLength(3);
  });

  it('rejects illegal input and supports abort', async () => {
    const engine = new FakeEngineService({ delayMs: 20 });
    const service = createAnalysisServiceWithOptions(engine, { loadBook: NO_BOOK });
    await expect(service.analyseGame({ gameId: 'x', startFen: START_FEN, moves: ['e2e5'] })).rejects.toThrow(/Illegal move 1/);
    const controller = new AbortController();
    const progress: AnalysisProgress[] = [];
    const run = service.analyseGame(
      { gameId: 'y', startFen: START_FEN, moves: FIXTURE_GAME.moves },
      {
        signal: controller.signal,
        onProgress: (p) => {
          progress.push(p);
          if (p.phase === 'engine' && p.done === 3) controller.abort();
        },
      },
    );
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress.filter((p) => p.phase === 'engine').length).toBeLessThan(10);
  });
});

describe('analyseGame with Lichess cloud-eval (failure paths, AC 9)', () => {
  const moves = FIXTURE_GAME.moves.slice(0, 6);
  const run = async (fetchImpl: typeof fetch, timeoutMs?: number) => {
    const engine = scripted(START_FEN, moves, Array<number>(7).fill(20));
    const cloudEval = createLichessCloudEval({ fetch: fetchImpl, ...(timeoutMs ? { timeoutMs } : {}) });
    const a = await createAnalysisServiceWithOptions(engine, { cloudEval, loadBook: NO_BOOK }).analyseGame({ gameId: 'cl', startFen: START_FEN, moves });
    return { a, engine };
  };

  it.each([
    ['404', async () => new Response('{}', { status: 404 })],
    ['429', async () => new Response('{}', { status: 429 })],
    [
      'network error',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('%s → every position analysed locally', async (_, impl) => {
    const fetchMock = vi.fn(impl) as unknown as typeof fetch;
    const { a, engine } = await run(fetchMock);
    expect(a.moves).toHaveLength(6);
    expect(a.moves.every((m) => m.bestMove)).toBe(true);
    expect(engine.calls).toHaveLength(7);
    // After the first miss the cloud is not asked again during this analysis.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('timeout → local analysis', async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))),
    ) as unknown as typeof fetch;
    const { a, engine } = await run(hanging, 30);
    expect(a.moves).toHaveLength(6);
    expect(engine.calls).toHaveLength(7);
  });

  it('cloud hits replace local searches until the first miss', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      calls += 1;
      if (calls > 2) return new Response('{}', { status: 404 });
      const fen = decodeURIComponent(new URL(url).searchParams.get('fen')!);
      const legal = ChessGame.fromFen(fen).legalMoves().map((m) => m.uci);
      const body = { depth: 40, knodes: 10, pvs: [{ moves: legal[0], cp: 20 }, { moves: legal[1], cp: 10 }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const { a, engine } = await run(fetchMock);
    expect(a.moves).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(engine.calls).toHaveLength(5);
  });
});

describe('prepare / assessMove / findThreats (scripted engine)', () => {
  const QH4 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  const afterQh4 = ChessGame.fromFen(QH4).move('d8h4')!.fenAfter;

  function coachEngine(delayMs = 0) {
    const engine = new FakeEngineService({ delayMs });
    engine.setLines(positionKey(QH4), [
      { multipv: 1, depth: 16, score: { type: 'cp', value: 30 }, pv: ['b8c6', 'f1b5'] },
      { multipv: 2, depth: 16, score: { type: 'cp', value: 40 }, pv: ['d7d6', 'd2d4'] },
    ]);
    engine.setLines(positionKey(afterQh4), [{ multipv: 1, depth: 12, score: { type: 'cp', value: 850 }, pv: ['f3h4', 'g8f6'] }]);
    return engine;
  }

  it('assessMove after prepare searches only the position after the move', async () => {
    const engine = coachEngine();
    const service = createAnalysisServiceWithOptions(engine);
    service.prepare(QH4);
    await vi.waitFor(() => expect(engine.calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    const a = await service.assessMove(QH4, 'd8h4');
    expect(engine.calls.map((c) => c.fen)).toEqual([QH4, afterQh4]);
    expect(engine.calls[0]!.opts).toMatchObject({ multiPv: 2, depth: 16, movetimeMs: 800 });
    expect(engine.calls[1]!.opts).toMatchObject({ depth: 12, movetimeMs: 300 });
    expect(a.classification).toBe('blunder');
    expect(a.expectedPointsLoss).toBeGreaterThanOrEqual(0.2);
    expect(a.bestMove).toBe('b8c6');
    expect(a.bestLine).toEqual(['b8c6', 'f1b5']);
    expect(a.playedLine).toEqual(['d8h4', 'f3h4', 'g8f6']);
    expect(a.facts).toMatchObject({ kind: 'coach_warning', playedMove: { san: 'Qh4' }, refutation: ['Nxh4', 'Nf6'] });
    expect(a.facts.motifs.map((m) => m.id)).toContain('hanging_piece');
  });

  it('assessMove without prepare searches both positions (cold)', async () => {
    const engine = coachEngine();
    const a = await createAnalysisServiceWithOptions(engine).assessMove(QH4, 'b8c6');
    expect(engine.calls.map((c) => [c.fen, c.opts.depth])).toEqual([
      [QH4, 14],
      [ChessGame.fromFen(QH4).move('b8c6')!.fenAfter, 12],
    ]);
    expect(a.classification).toBe('best');
    expect(a.facts.kind).toBe('praise');
    await expect(createAnalysisServiceWithOptions(engine).assessMove(QH4, 'e1e2')).rejects.toThrow(/Illegal move/);
  });

  it('a new prepare supersedes (aborts) the running one', async () => {
    const engine = new FakeEngineService({ delayMs: 50 });
    const service = createAnalysisServiceWithOptions(engine);
    service.prepare(START_FEN);
    service.prepare(QH4);
    await vi.waitFor(() => expect(engine.calls).toHaveLength(2));
    const first = engine.calls[0]!.opts.signal!;
    expect(first.aborted).toBe(true);
    expect(engine.calls[1]!.opts.signal!.aborted).toBe(false);
    // The same position again is not searched twice.
    service.prepare(QH4);
    await new Promise((r) => setTimeout(r, 80));
    expect(engine.calls).toHaveLength(2);
  });

  it('assessMove supersedes a running findThreats (it resolves null)', async () => {
    const engine = coachEngine(40);
    const service = createAnalysisServiceWithOptions(engine);
    const threats = service.findThreats(QH4);
    await new Promise((r) => setTimeout(r, 5));
    const assessment = service.assessMove(QH4, 'd8h4');
    await expect(threats).resolves.toBeNull();
    await expect(assessment).resolves.toMatchObject({ classification: 'blunder' });
  });

  it('findThreats: null in check, mate threat via the null move, material threat ≥ 2 pawns, nothing below', async () => {
    const engine = new FakeEngineService();
    const service = createAnalysisServiceWithOptions(engine);
    // In check → no pass move → no threat report.
    expect(await service.findThreats('rnbqkbnr/ppppp2p/5p2/6pQ/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 3')).toBeNull();
    // Back-rank mate threat.
    const backRank = '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1';
    engine.setLines('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - -', [{ multipv: 1, depth: 12, score: { type: 'mate', value: 1 }, pv: ['a1a8'] }]);
    expect(await service.findThreats(backRank)).toMatchObject({ move: 'a1a8', san: 'Ra8#', mateIn: 1, facts: { kind: 'threat', mover: 'b', mateIn: -1 } });
    // Hanging knight: the opponent would take it.
    const hanging = '4k3/8/8/3n4/4P3/8/8/4K3 b - - 0 1';
    engine.setLines('4k3/8/8/3n4/4P3/8/8/4K3 w - -', [{ multipv: 1, depth: 12, score: { type: 'cp', value: 300 }, pv: ['e4d5', 'e8d7'] }]);
    expect(await service.findThreats(hanging)).toMatchObject({ move: 'e4d5', san: 'exd5', materialGain: 3, line: ['e4d5', 'e8d7'] });
    // Only a pawn → below the 2-pawn threshold.
    const pawn = '4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1';
    engine.setLines('4k3/8/8/3p4/4P3/8/8/4K3 w - -', [{ multipv: 1, depth: 12, score: { type: 'cp', value: 100 }, pv: ['e4d5'] }]);
    expect(await service.findThreats(pawn)).toBeNull();
  });
});
