import { describe, expect, it } from 'vitest';
import type { EngineLine, Score } from '@/core/engine';
import { continueVerdict, DETECTION, FIRST_PLY, isOpponentMistake, judgePosition, SCREEN_PLY } from './detect';

/** Engine line with a White-POV score. */
function line(multipv: number, move: string, score: Score): EngineLine {
  return { multipv, depth: 18, score, pv: [move] };
}
const cp = (value: number): Score => ({ type: 'cp', value });
const mate = (value: number): Score => ({ type: 'mate', value });

describe('judgePosition – first solver ply', () => {
  it('accepts a forced mate in 1 even when a second move mates too', () => {
    expect(judgePosition([line(1, 'd1d8', mate(1)), line(2, 'd1d7', mate(1))], 'w', FIRST_PLY)).toEqual({ kind: 'mate', mateIn: 1 });
  });

  it('accepts a unique mate in 2 and rejects a second mate in 2', () => {
    expect(judgePosition([line(1, 'c4g8', mate(2)), line(2, 'c4c8', mate(4))], 'w', FIRST_PLY)).toEqual({ kind: 'mate', mateIn: 2 });
    expect(judgePosition([line(1, 'c4g8', mate(2)), line(2, 'c4c8', mate(2))], 'w', FIRST_PLY)).toEqual({ kind: 'none', reason: 'mate_not_unique' });
  });

  it('reads mates from the solver view (Black mates = negative White-POV score)', () => {
    expect(judgePosition([line(1, 'd8h4', mate(-1)), line(2, 'a7a6', cp(-30))], 'b', FIRST_PLY)).toEqual({ kind: 'mate', mateIn: 1 });
    // A mate for the opponent is no puzzle for the solver.
    expect(judgePosition([line(1, 'a2a3', mate(-3)), line(2, 'h2h3', mate(-2))], 'w', FIRST_PLY).kind).toBe('none');
  });

  it(`rejects mates longer than ${DETECTION.maxMateIn}`, () => {
    expect(judgePosition([line(1, 'a1a8', mate(6)), line(2, 'a1a7', cp(200))], 'w', FIRST_PLY)).toEqual({ kind: 'none', reason: 'mate_too_long' });
  });

  it('accepts a unique winning move: EP(best) ≥ 0.70 and margin ≥ 0.25', () => {
    // +500 cp ≈ 0.86 EP, 0 cp = 0.50 EP.
    const v = judgePosition([line(1, 'c1c5', cp(500)), line(2, 'g1f1', cp(0))], 'w', FIRST_PLY);
    expect(v.kind).toBe('advantage');
    if (v.kind === 'advantage') {
      expect(v.bestEp).toBeGreaterThanOrEqual(0.7);
      expect(v.margin).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('rejects a position that is not winning enough or where a second move wins as well', () => {
    expect(judgePosition([line(1, 'c1c5', cp(150)), line(2, 'g1f1', cp(-300))], 'w', FIRST_PLY)).toEqual({ kind: 'none', reason: 'not_winning' });
    expect(judgePosition([line(1, 'c1c5', cp(600)), line(2, 'c1c4', cp(450))], 'w', FIRST_PLY)).toEqual({ kind: 'none', reason: 'not_unique' });
  });

  it('rejects positions with a single legal move and empty lines', () => {
    expect(judgePosition([line(1, 'g1h1', cp(900))], 'w', FIRST_PLY)).toEqual({ kind: 'none', reason: 'only_move' });
    expect(judgePosition([], 'w', FIRST_PLY)).toEqual({ kind: 'none', reason: 'no_move' });
  });

  it('screens with looser thresholds than the confirmation', () => {
    // +300 cp ≈ 0.75 EP vs +60 cp ≈ 0.55 EP: margin ≈ 0.20 – a screening candidate, but not a puzzle at full depth.
    const lines = [line(1, 'c1c5', cp(300)), line(2, 'g1f1', cp(60))];
    expect(judgePosition(lines, 'w', SCREEN_PLY).kind).toBe('advantage');
    expect(judgePosition(lines, 'w', FIRST_PLY)).toEqual({ kind: 'none', reason: 'not_unique' });
  });
});

describe('isOpponentMistake', () => {
  it('needs a gain of at least 0.15 expected points for the solver', () => {
    // Before: White to move, equal; after Black's move White is +400.
    expect(isOpponentMistake([line(1, 'e7e5', cp(0))], [line(1, 'c1c5', cp(400))], 'w')).toBe(true);
    expect(isOpponentMistake([line(1, 'e7e5', cp(0))], [line(1, 'c1c5', cp(60))], 'w')).toBe(false);
  });

  it('counts a new forced mate as a mistake, an existing one not', () => {
    expect(isOpponentMistake([line(1, 'g8h8', cp(900))], [line(1, 'd1d8', mate(1))], 'w')).toBe(true);
    expect(isOpponentMistake([line(1, 'g8h8', mate(3))], [line(1, 'd1d8', mate(2))], 'w')).toBe(false);
  });

  it('works for Black as the solver', () => {
    expect(isOpponentMistake([line(1, 'g2g4', cp(-20))], [line(1, 'd8h4', mate(-1))], 'b')).toBe(true);
  });
});

describe('continueVerdict – later solver plies', () => {
  it('continues a mate line only with the expected, unique mate distance', () => {
    expect(continueVerdict([line(1, 'e1e8', mate(1)), line(2, 'e1e7', cp(300))], 'w', 1)).toEqual({ kind: 'continue' });
    expect(continueVerdict([line(1, 'e1e8', mate(2)), line(2, 'e1e7', cp(300))], 'w', 1).kind).toBe('reject');
    expect(continueVerdict([line(1, 'e1e8', mate(2)), line(2, 'e1e7', mate(2))], 'w', 2)).toEqual({ kind: 'reject', reason: 'mate_not_unique' });
  });

  it(`continues an advantage line while the move is unique by ${DETECTION.nextMargin} EP`, () => {
    expect(continueVerdict([line(1, 'c5c8', cp(700)), line(2, 'c5c7', cp(100))], 'w', null)).toEqual({ kind: 'continue' });
    expect(continueVerdict([line(1, 'c5c8', cp(700)), line(2, 'c5c7', cp(600))], 'w', null)).toEqual({ kind: 'stop', reason: 'not_unique' });
  });

  it('stops an advantage line when it turns into a forced mate (advantage settled)', () => {
    expect(continueVerdict([line(1, 'c5c8', mate(4)), line(2, 'c5c7', cp(900))], 'w', null)).toEqual({ kind: 'stop', reason: 'settled_mate' });
  });
});
