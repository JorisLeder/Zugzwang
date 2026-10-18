/**
 * Mate check: rules on scripted engine lines, and the real Node Stockfish on a generated line whose equally fast
 * alternative mate MultiPV 2 missed (it failed the validator) and on a unique smothered mate.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { EngineAnalysis, EngineLine, EngineService, Score } from '@/core/engine';
import { createGeneratorEngine } from './engine';
import { checkMateLine, createMateChecker, MATE_CHECK_REJECT, needsMateCheck } from './mateCheck';
import type { GameResult, RawPuzzle } from './selfplay';

/** Queen and pawn vs king: 3…Ka5 4.h7 Ka4 5.h8=Q Ka5 6.Qa1#, but 4.Kd3 mates in 3 as well. */
const AMBIGUOUS = { fen: '1Q6/8/7P/P7/k7/8/4K3/8 b - - 0 70', moves: ['a4a5', 'h6h7', 'a5a4', 'h7h8q', 'a4a5', 'h8a1'] };
/** Smothered mate after a waiting rook move: Qg8+ Rxg8 Nf7# is the only mate in 2. */
const SMOTHERED = { fen: '5r1k/6pp/7N/8/2Q5/8/8/6K1 b - - 0 1', moves: ['f8e8', 'c4g8', 'e8g8', 'h6f7'] };

const mate = (value: number): Score => ({ type: 'mate', value });
const line = (multipv: number, move: string, score: Score): EngineLine => ({ multipv, depth: 18, score, pv: [move] });

/** Engine stub answering the n-th search with `answers[n]`. */
function scripted(answers: EngineLine[][]): EngineService & { calls: number } {
  const stub = {
    calls: 0,
    analyse: () => Promise.resolve({ lines: answers[stub.calls++] ?? [] } as unknown as EngineAnalysis),
  };
  return stub as unknown as EngineService & { calls: number };
}

describe('checkMateLine (rules)', () => {
  // AMBIGUOUS: White (the solver) to move at plies 1 and 3, ply 5 is checkmate and needs no search.
  it('passes the only fastest mate and skips the mating ply', async () => {
    const engine = scripted([
      [line(1, 'h6h7', mate(3)), line(2, 'b8b2', mate(4))],
      [line(1, 'h7h8q', mate(2)), line(2, 'b8b3', mate(3))],
    ]);
    expect(await checkMateLine(engine, AMBIGUOUS.fen, AMBIGUOUS.moves)).toBeNull();
    expect(engine.calls).toBe(2);
  });

  it('rejects an equally fast alternative, a faster mate and a solution outside the top lines', async () => {
    const alt = scripted([[line(1, 'h6h7', mate(3)), line(2, 'e2d3', mate(3))]]);
    expect(await checkMateLine(alt, AMBIGUOUS.fen, AMBIGUOUS.moves)).toBe('ply 1: e2d3 also mates in 3');
    const faster = scripted([[line(1, 'e2d3', mate(2)), line(2, 'h6h7', mate(3))]]);
    expect(await checkMateLine(faster, AMBIGUOUS.fen, AMBIGUOUS.moves)).toBe('ply 1: e2d3 mates faster (in 2)');
    const missing = scripted([[line(1, 'e2d3', mate(3)), line(2, 'b8b2', mate(4))]]);
    expect(await checkMateLine(missing, AMBIGUOUS.fen, AMBIGUOUS.moves)).toBe('ply 1: e2d3 mates faster (in 3)');
    const none = scripted([[line(1, 'h6h7', { type: 'cp', value: 900 })]]);
    expect(await checkMateLine(none, AMBIGUOUS.fen, AMBIGUOUS.moves)).toBe('ply 1: no forced mate');
  });

  it('reads Black mates from the solver view (negative White-POV scores)', async () => {
    // AMBIGUOUS mirrored, colours swapped: Black is the solver.
    const fen = '8/4k3/8/K7/p7/7p/8/1q6 w - - 0 70';
    const moves = ['a5a4', 'h3h2', 'a4a5', 'h2h1q', 'a5a4', 'h1a8'];
    const black = scripted([[line(1, 'h3h2', mate(-3)), line(2, 'b1b7', mate(-4))], [line(1, 'h2h1q', mate(-2))]]);
    expect(await checkMateLine(black, fen, moves)).toBeNull();
    const white = scripted([[line(1, 'h3h2', mate(3))]]);
    expect(await checkMateLine(white, fen, moves)).toBe('ply 1: no forced mate');
  });

  it('needs the check only for mates in 2 or more', () => {
    expect(needsMateCheck({ mateIn: null })).toBe(false);
    expect(needsMateCheck({ mateIn: 1 })).toBe(false);
    expect(needsMateCheck({ mateIn: 2 })).toBe(true);
  });
});

describe('mate check (Stockfish)', () => {
  const engine = createGeneratorEngine('perSearch');
  const checker = createMateChecker(null);
  afterAll(() => {
    engine.dispose();
    checker.dispose();
  });

  it('finds the alternative mate that MultiPV 2 missed', async () => {
    expect(await checkMateLine(engine.service, AMBIGUOUS.fen, AMBIGUOUS.moves)).toBe('ply 1: e2d3 also mates in 3');
  }, 30_000);

  it('passes a unique mate in 2', async () => {
    expect(await checkMateLine(engine.service, SMOTHERED.fen, SMOTHERED.moves)).toBeNull();
  }, 30_000);

  it('drops failing mate lines from a game result and counts them', async () => {
    const raw = (l: { fen: string; moves: string[] }, mateIn: number | null): RawPuzzle =>
      ({ ...l, mateIn, findDepth: 1, finalCp: null, firstScore: mate(mateIn ?? 1), phase: 'endgame', themes: [], openingTags: [], game: 0, ply: 1, profiles: { opponent: 'novice', solver: 'strong' } }) as RawPuzzle;
    const result: GameResult = {
      index: 0,
      puzzles: [raw(AMBIGUOUS, 3), raw(SMOTHERED, 2)],
      stats: { plies: 10, mistakes: 2, screenedOut: {}, candidates: 2, confirmed: 2, rejected: {} },
    };
    const refined = await checker.refine(result);
    expect(refined.puzzles.map((p) => p.fen)).toEqual([SMOTHERED.fen]);
    expect(refined.stats.rejected).toEqual({ [MATE_CHECK_REJECT]: 1 });
    expect(result.puzzles).toHaveLength(2); // the input stays untouched
  }, 60_000);
});
