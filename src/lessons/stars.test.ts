import { describe, expect, it } from 'vitest';
import { bestStars, computeStars } from './stars';

describe('computeStars (D-13)', () => {
  it('gives 3 stars without mistakes and hints', () => {
    expect(computeStars(0, 0)).toBe(3);
  });

  it('gives 2 stars for a penalty of 1 or 2 (mistakes + hints)', () => {
    expect(computeStars(1, 0)).toBe(2);
    expect(computeStars(0, 1)).toBe(2);
    expect(computeStars(1, 1)).toBe(2);
    expect(computeStars(2, 0)).toBe(2);
    expect(computeStars(0, 2)).toBe(2);
  });

  it('gives 1 star from a penalty of 3 – a completed lesson never has 0 stars', () => {
    expect(computeStars(3, 0)).toBe(1);
    expect(computeStars(2, 1)).toBe(1);
    expect(computeStars(0, 3)).toBe(1);
    expect(computeStars(40, 12)).toBe(1);
  });

  it('treats negative and fractional counts safely', () => {
    expect(computeStars(-1, -5)).toBe(3);
    expect(computeStars(0.9, 0.9)).toBe(3);
  });

  it('keeps the best result', () => {
    expect(bestStars(2, 3)).toBe(3);
    expect(bestStars(3, 1)).toBe(3);
    expect(bestStars(0, 1)).toBe(1);
  });
});
