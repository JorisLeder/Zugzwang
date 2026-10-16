/**
 * Analysis service against the real Node engine (Stockfish 19 lite, `@/lib/uci/node`). Searches are time-bounded,
 * so the timings hold on a loaded machine too.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisProgress } from '@/core/analysis';
import type { EngineService } from '@/core/engine';
import { FIXTURE_GAME } from '@/core/testing';
import { uciLineToSan } from '@/lib/chess';
import { createNodeEngineService } from '@/lib/uci/node';
import { createAnalysisServiceWithOptions } from './service';

let engine: EngineService;

beforeAll(async () => {
  engine = createNodeEngineService();
  await engine.init();
});

afterAll(() => engine.dispose());

/** Waits until the engine has finished its current search (prepare runs in the background). */
async function idle(e: EngineService): Promise<void> {
  const deadline = Date.now() + 5_000;
  await new Promise((r) => setTimeout(r, 20));
  while (e.status().state === 'busy' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
}

describe('assessMove (coach, D-41)', () => {
  it('cold: ≤ 1 s and flags the hanging queen 2…Qh4?? (loss ≥ 0.20, hanging_piece)', async () => {
    const service = createAnalysisServiceWithOptions(engine);
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    const t0 = performance.now();
    const a = await service.assessMove(fen, 'd8h4');
    const ms = performance.now() - t0;
    expect(ms).toBeLessThanOrEqual(1_000);
    expect(a.expectedPointsLoss).toBeGreaterThanOrEqual(0.2);
    expect(a.classification).toBe('blunder');
    expect(a.playedLine[0]).toBe('d8h4');
    expect(a.playedLine[1]).toBe('f3h4');
    expect(a.facts.kind).toBe('coach_warning');
    expect(a.facts.motifs.find((m) => m.id === 'hanging_piece')).toMatchObject({ squares: expect.arrayContaining(['h4']), gain: 9 });
  });

  it('after prepare(fenBefore) has finished: ≤ 500 ms, 2.Qg4?? loses the queen', async () => {
    const service = createAnalysisServiceWithOptions(engine);
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    service.prepare(fen);
    await idle(engine);
    const t0 = performance.now();
    const a = await service.assessMove(fen, 'd1g4');
    const ms = performance.now() - t0;
    expect(ms).toBeLessThanOrEqual(500);
    expect(a.expectedPointsLoss).toBeGreaterThanOrEqual(0.2);
    expect(a.facts.motifs.map((m) => m.id)).toContain('hanging_piece');
  });

  it('a good move is not flagged', async () => {
    const service = createAnalysisServiceWithOptions(engine);
    const a = await service.assessMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4');
    expect(a.expectedPointsLoss).toBeLessThan(0.05);
  });
});

describe('findThreats (real engine)', () => {
  it('reports the back-rank mate threat and ignores quiet positions', async () => {
    const service = createAnalysisServiceWithOptions(engine);
    const threat = await service.findThreats('6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1');
    expect(threat).toMatchObject({ move: 'a1a8', san: 'Ra8#', mateIn: 1 });
    expect(await service.findThreats('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBeNull();
  });
});

describe('analyseGame on the 40-move fixture (real engine, reduced time budget)', () => {
  it('progress per position, best move per position, key moments, phases and engine-confirmed facts', { timeout: 60_000 }, async () => {
    const service = createAnalysisServiceWithOptions(engine, { gameTimeBudgetMs: 8_000 });
    const progress: AnalysisProgress[] = [];
    const t0 = performance.now();
    const a = await service.analyseGame(
      { gameId: 'fixture', startFen: FIXTURE_GAME.startFen, moves: FIXTURE_GAME.moves },
      { onProgress: (p) => progress.push(p) },
    );
    expect(performance.now() - t0).toBeLessThan(30_000);
    expect(a.moves).toHaveLength(80);
    expect(progress.filter((p) => p.phase === 'engine').map((p) => p.done)).toEqual(Array.from({ length: 81 }, (_, i) => i + 1));
    expect(a.moves.every((m) => m.bestMove !== null && m.bestMoveSan !== null && m.bestLine.length > 0)).toBe(true);
    expect(a.evalGraph).toHaveLength(81);

    // The known blunder 14.Qc2?? (ply 27).
    const blunder = a.moves[FIXTURE_GAME.blunder.ply - 1]!;
    expect(blunder.san).toBe('Qc2');
    expect(['mistake', 'blunder']).toContain(blunder.classification);
    expect(blunder.bestMove).toBe(FIXTURE_GAME.blunder.bestMove);
    expect(a.keyMoments).toContain(FIXTURE_GAME.blunder.ply);
    expect(a.keyMoments.length).toBeLessThanOrEqual(5);
    for (const ply of a.keyMoments) expect(a.moves[ply - 1]!.expectedPointsLoss).toBeGreaterThanOrEqual(0.1);

    // Book at the start, phases per ply.
    expect(a.moves[0]!.classification).toBe('book');
    expect(a.moves.map((m) => m.phase)).toContain('middlegame');

    // Facts for every mistake, miss and blunder – moves only from the engine lines.
    const explained = a.moves.filter((m) => ['mistake', 'miss', 'blunder'].includes(m.classification));
    expect(explained.length).toBeGreaterThan(0);
    for (const m of a.moves) {
      if (!['mistake', 'miss', 'blunder'].includes(m.classification)) continue;
      const f = m.facts!;
      expect(f.playedMove).toEqual({ uci: m.uci, san: m.san });
      expect(f.bestMove?.uci).toBe(m.bestMove);
      expect(uciLineToSan(m.fenBefore, m.bestLine).slice(0, f.bestLine.length)).toEqual(f.bestLine);
      expect(uciLineToSan(m.fenAfter, m.playedLine.slice(1)).slice(0, f.refutation.length)).toEqual(f.refutation);
    }
  });
});
