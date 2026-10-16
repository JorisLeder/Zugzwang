import { describe, expect, it } from 'vitest';
import { RATING_DEFAULTS } from '@/core/rating';
import { expectedScore, updateGlicko2 } from './glicko2';

describe('Glicko-2 (Glickman’s worked example, RULES §4.1)', () => {
  const player = { rating: 1500, rd: 200, volatility: 0.06 };
  const results = [
    { opponentRating: 1400, opponentRd: 30, score: 1 as const },
    { opponentRating: 1550, opponentRd: 100, score: 0 as const },
    { opponentRating: 1700, opponentRd: 300, score: 0 as const },
  ];

  it('reproduces 1464.06 / 151.52 / 0.05999', () => {
    const r = updateGlicko2(player, results, { tau: 0.5 });
    expect(Math.abs(r.rating - 1464.06)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(r.rd - 151.52)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.volatility - 0.05999)).toBeLessThanOrEqual(0.00001);
  });

  it('matches the unrounded reference values', () => {
    const r = updateGlicko2(player, results);
    expect(r.rating).toBeCloseTo(1464.0507, 3);
    expect(r.rd).toBeCloseTo(151.5165, 3);
    expect(r.volatility).toBeCloseTo(0.059996, 6);
  });

  it('only increases RD when the player did not compete', () => {
    const r = updateGlicko2(player, []);
    expect(r.rating).toBe(1500);
    expect(r.rd).toBeCloseTo(200.2714, 3);
    expect(r.volatility).toBe(0.06);
  });

  it('clamps RD to [45, 350] (D-09)', () => {
    let r = { rating: 1500, rd: 50, volatility: 0.06 };
    for (let i = 0; i < 200; i++) r = updateGlicko2(r, [{ opponentRating: 1500, opponentRd: 50, score: i % 2 ? 1 : 0 }]);
    expect(r.rd).toBeGreaterThanOrEqual(RATING_DEFAULTS.minRd);
    const fresh = updateGlicko2({ rating: 1500, rd: 350, volatility: 0.06 }, []);
    expect(fresh.rd).toBe(RATING_DEFAULTS.maxRd);
  });

  it('a solved puzzle raises, a failed one lowers the rating', () => {
    const start = { rating: 600, rd: 350, volatility: 0.06 };
    const win = updateGlicko2(start, [{ opponentRating: 600, opponentRd: 80, score: 1 }]);
    const loss = updateGlicko2(start, [{ opponentRating: 600, opponentRd: 80, score: 0 }]);
    expect(win.rating).toBeGreaterThan(600);
    expect(loss.rating).toBeLessThan(600);
    expect(win.rd).toBeLessThan(350);
  });

  it('expectedScore is 0.5 for equal ratings', () => {
    expect(expectedScore({ rating: 1500 }, { rating: 1500, rd: 80 })).toBeCloseTo(0.5, 10);
  });
});
