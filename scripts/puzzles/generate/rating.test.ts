import { describe, expect, it } from 'vitest';
import { estimateRating, isEasyKind, ratingFeatures, ratingJitter, ratingParts, RATING_LIMITS, type RatingFeatures } from './rating';

const base: RatingFeatures = { solverMoves: 1, mateIn: 1, findDepth: 1, legalMoves: 25, firstMove: 'mate', firstMoveByKnight: false, themes: ['mateIn1', 'mate', 'oneMove'] };

describe('estimateRating', () => {
  it('puts one-move mates and hanging pieces into 200–600 whatever the other features', () => {
    for (const findDepth of [1, 8, 18]) {
      for (const legalMoves of [3, 25, 60]) {
        for (const key of ['a', 'b', 'c', 'd']) {
          const mate1 = { ...base, findDepth, legalMoves };
          const hanging: RatingFeatures = { ...base, mateIn: null, firstMove: 'capture', findDepth, legalMoves, themes: ['hangingPiece', 'oneMove'] };
          for (const f of [mate1, hanging]) {
            expect(isEasyKind(f)).toBe(true);
            const r = estimateRating(f, key);
            expect(r).toBeGreaterThanOrEqual(RATING_LIMITS.easyMin);
            expect(r).toBeLessThanOrEqual(RATING_LIMITS.easyMax);
          }
        }
      }
    }
  });

  it('rates a typical mate in 1 around 250', () => {
    expect(estimateRating(base, 'x')).toBeGreaterThanOrEqual(220);
    expect(estimateRating(base, 'x')).toBeLessThanOrEqual(280);
  });

  it('grows with the mate distance and the solution length', () => {
    const mates = [1, 2, 3, 4, 5].map((n) => ratingParts({ ...base, solverMoves: n, mateIn: n, firstMove: n === 1 ? 'mate' : 'check' }).base);
    expect(mates).toEqual([...mates].sort((a, b) => a - b));
    const lines = [2, 3, 4, 5].map((u) => ratingParts({ ...base, solverMoves: u, mateIn: null, firstMove: 'capture', themes: [] }).base);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(new Set(lines).size).toBe(4);
  });

  it('rates moves Stockfish finds late, quiet first moves and sacrifices higher', () => {
    const f: RatingFeatures = { ...base, solverMoves: 3, mateIn: 3, firstMove: 'check', themes: [] };
    const early = estimateRating({ ...f, findDepth: 2 }, 'k');
    expect(estimateRating({ ...f, findDepth: 12 }, 'k')).toBeGreaterThan(early);
    expect(estimateRating({ ...f, firstMove: 'quiet' }, 'k')).toBeGreaterThan(estimateRating(f, 'k'));
    expect(estimateRating({ ...f, themes: ['sacrifice'] }, 'k')).toBeGreaterThan(estimateRating(f, 'k'));
  });

  it('stays inside the global limits and is deterministic', () => {
    const extreme: RatingFeatures = { ...base, solverMoves: 5, mateIn: 5, findDepth: 30, legalMoves: 80, firstMove: 'quiet', themes: ['sacrifice', 'quietMove', 'underPromotion'] };
    expect(estimateRating(extreme, 'z')).toBe(RATING_LIMITS.max);
    expect(estimateRating(extreme, 'z')).toBe(estimateRating(extreme, 'z'));
    expect(Math.abs(ratingJitter('gen-0123456789'))).toBeLessThanOrEqual(30);
  });
});

describe('ratingFeatures', () => {
  it('reads the features from a line', () => {
    // Back-rank mate in one after ...Bd5 (seed-0001).
    const f = ratingFeatures('6k1/p4ppp/2b5/8/8/8/P4PPP/4R1K1 b - - 0 1', ['c6d5', 'e1e8'], 1, 1, ['mateIn1']);
    expect(f).toMatchObject({ solverMoves: 1, mateIn: 1, firstMove: 'mate', firstMoveByKnight: false });
    expect(f.legalMoves).toBeGreaterThan(5);
    // A knight fork that starts with a check.
    const fork = ratingFeatures('3r2k1/pp3p1p/6p1/8/4N3/7P/PPP2PP1/6K1 b - - 0 1', ['d8d7', 'e4f6', 'g8f8', 'f6d7'], null, 4, ['fork']);
    expect(fork).toMatchObject({ solverMoves: 2, mateIn: null, firstMove: 'check', firstMoveByKnight: true, findDepth: 4 });
  });

  it('throws on an illegal line', () => {
    expect(() => ratingFeatures('6k1/p4ppp/2b5/8/8/8/P4PPP/4R1K1 b - - 0 1', ['c6d5', 'e1e9'], 1, 1, [])).toThrow();
  });
});
