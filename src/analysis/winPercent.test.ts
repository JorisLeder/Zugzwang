import { describe, expect, it } from 'vitest';
import { expectedPoints, expectedPointsLoss, scoreWinPercent, winningChances, winPercent } from './winPercent';

// Reference values computed independently from the Lichess formula (SOURCES.md):
// W(cp) = 50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1), cp clamped to ±1000.
describe('winPercent (Lichess)', () => {
  it.each([
    [0, 50],
    [15, 51.380429102931544],
    [100, 59.10258971916128],
    [-100, 40.89741028083871],
    [300, 75.11255009383484],
    [-300, 24.88744990616516],
    [1000, 97.54474363414323],
    [-1000, 2.4552563658567763],
  ])('W(%d cp) = %f', (cp, expected) => {
    expect(winPercent(cp)).toBeCloseTo(expected, 10);
  });

  it('clamps centipawns to ±1000 (scalachess Cp.CEILING)', () => {
    expect(winPercent(5000)).toBe(winPercent(1000));
    expect(winPercent(-5000)).toBe(winPercent(-1000));
  });

  it('is symmetric: W(cp) + W(−cp) = 100 (scalachess ScoreTest)', () => {
    for (const cp of [0, 7, 50, 123, 480, 999, 1500]) expect(winPercent(cp) + winPercent(-cp)).toBeCloseTo(100, 10);
  });

  it('winning chances stay within [-1, 1]', () => {
    expect(winningChances(10_000)).toBeLessThanOrEqual(1);
    expect(winningChances(-10_000)).toBeGreaterThanOrEqual(-1);
  });
});

describe('scoreWinPercent (White-POV scores, D-08)', () => {
  it('converts centipawns to the requested side', () => {
    expect(scoreWinPercent({ type: 'cp', value: 100 }, 'w', 'w')).toBeCloseTo(59.1026, 4);
    expect(scoreWinPercent({ type: 'cp', value: 100 }, 'b', 'w')).toBeCloseTo(40.8974, 4);
  });

  it('maps a forced mate to the ±1000 cp ceiling for the mating / mated side', () => {
    expect(scoreWinPercent({ type: 'mate', value: 3 }, 'w', 'w')).toBeCloseTo(97.5447, 4);
    expect(scoreWinPercent({ type: 'mate', value: 3 }, 'b', 'w')).toBeCloseTo(2.4553, 4);
    expect(scoreWinPercent({ type: 'mate', value: -2 }, 'b', 'w')).toBeCloseTo(97.5447, 4);
    expect(scoreWinPercent({ type: 'mate', value: -2 }, 'w', 'b')).toBeCloseTo(2.4553, 4);
  });

  it('mate 0 = the side to move is checkmated', () => {
    expect(scoreWinPercent({ type: 'mate', value: 0 }, 'b', 'b')).toBeCloseTo(2.4553, 4);
    expect(scoreWinPercent({ type: 'mate', value: 0 }, 'w', 'b')).toBeCloseTo(97.5447, 4);
  });
});

describe('expected points', () => {
  it('EP = win% / 100', () => {
    expect(expectedPoints(75)).toBe(0.75);
  });

  it('loss = max(0, EP(best) − EP(played)), rounded to 4 decimals', () => {
    expect(expectedPointsLoss(60, 40)).toBe(0.2);
    expect(expectedPointsLoss(40, 60)).toBe(0);
    expect(expectedPointsLoss(59.10258971916128, 40.89741028083871)).toBe(0.1821);
  });
});
