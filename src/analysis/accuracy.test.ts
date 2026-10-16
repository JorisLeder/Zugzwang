import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy } from './accuracy';
import { winPercent } from './winPercent';

/** lila's test helper: White moves first, initial eval +15 cp, `cps` = evaluation after every ply (White POV). */
function compute(cps: number[], startColor: 'w' | 'b' = 'w') {
  return gameAccuracy([15, ...cps].map(winPercent), startColor);
}

/** `isCloseTo(value, expected, delta)` as in lila's AccuracyPercentTest. */
function expectNear(value: number | undefined, expected: number, delta: number) {
  expect(value).toBeDefined();
  expect(Math.abs(value! - expected)).toBeLessThanOrEqual(delta);
}

describe('moveAccuracy (lila AccuracyPercent.fromWinPercents)', () => {
  it.each([
    [50, 50, 100],
    [50, 60, 100],
    [60, 50, 64.57982845372067],
    [50, 40, 64.57982845372067],
    [55, 54, 96.60397651008962],
    [70, 30, 15.909002002130041],
    [97.5, 2.5, 0],
  ])('before %f, after %f → %f', (before, after, expected) => {
    expect(moveAccuracy(before, after)).toBeCloseTo(expected, 10);
  });

  it('includes the +1 uncertainty bonus and clamps to 100', () => {
    // 103.1668 · e^0 − 3.1669 + 1 = 101 → 100
    expect(moveAccuracy(50, 49.9999999)).toBe(100);
  });
});

describe('gameAccuracy (lila AccuracyPercentTest cases)', () => {
  it('empty game and single move → null', () => {
    expect(compute([])).toBeNull();
    expect(compute([15])).toBeNull();
  });

  it('two good moves', () => {
    const a = compute([15, 15])!;
    expectNear(a.w, 100, 1);
    expectNear(a.b, 100, 1);
  });

  it('white blunders on first move', () => {
    const a = compute([-900, -900])!;
    expectNear(a.w, 10, 5);
    expectNear(a.b, 100, 1);
    expect(a.w).toBeCloseTo(10.664056896199494, 9);
  });

  it('black blunders on first move', () => {
    const a = compute([15, 900])!;
    expectNear(a.w, 100, 1);
    expectNear(a.b, 10, 5);
  });

  it('both blunder on first move', () => {
    const a = compute([-900, 0])!;
    expectNear(a.w, 10, 5);
    expectNear(a.b, 10, 5);
  });

  it('20 perfect moves', () => {
    const a = compute(Array<number>(20).fill(15))!;
    expectNear(a.w, 100, 1);
    expectNear(a.b, 100, 1);
  });

  it('20 perfect moves and a white blunder', () => {
    const a = compute([...Array<number>(20).fill(15), -900])!;
    expectNear(a.w, 50, 5);
    expectNear(a.b, 100, 1);
    expect(a.w).toBeCloseTo(46.85340283303507, 9);
  });

  it('21 perfect moves and a black blunder', () => {
    const a = compute([...Array<number>(21).fill(15), 900])!;
    expectNear(a.w, 100, 1);
    expectNear(a.b, 50, 5);
  });

  it('5 and 50 average moves (65 cpl) on each side', () => {
    for (const n of [5, 50]) {
      const a = compute(Array.from({ length: n }, () => [-50, 15]).flat())!;
      expectNear(a.w, 76, 8);
      expectNear(a.b, 76, 8);
      expect(a.w).toBeCloseTo(77.38304879688927, 9);
    }
  });

  it('50 mediocre moves (150 cpl) on each side', () => {
    const a = compute(Array.from({ length: 50 }, () => [-135, 15]).flat())!;
    expectNear(a.w, 54, 8);
    expectNear(a.b, 54, 8);
  });

  it('50 terrible moves (500 cpl) on each side', () => {
    const a = compute(Array.from({ length: 50 }, () => [-435, 15]).flat())!;
    expectNear(a.w, 20, 8);
    expectNear(a.b, 20, 8);
  });

  describe('black moves first', () => {
    it('empty game and single move → null', () => {
      expect(compute([], 'b')).toBeNull();
      expect(compute([15], 'b')).toBeNull();
    });
    it('two good moves', () => {
      const a = compute([15, 15], 'b')!;
      expectNear(a.b, 100, 1);
      expectNear(a.w, 100, 1);
    });
    it('black blunders on first move', () => {
      const a = compute([900, 900], 'b')!;
      expectNear(a.b, 10, 5);
      expectNear(a.w, 100, 1);
    });
    it('white blunders on first move', () => {
      const a = compute([15, -900], 'b')!;
      expectNear(a.b, 100, 1);
      expectNear(a.w, 10, 5);
    });
    it('both blunder on first move', () => {
      const a = compute([900, 0], 'b')!;
      expectNear(a.b, 10, 5);
      expectNear(a.w, 10, 5);
    });
  });
});
