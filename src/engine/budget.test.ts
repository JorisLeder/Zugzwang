import { describe, expect, it } from 'vitest';
import type { AnalyseOptions } from '@/core/engine';
import { applyBudget, DEFAULT_ENGINE_BUDGET, deriveBudget } from './budget';

describe('deriveBudget (device speed → depth and movetime cap)', () => {
  it.each([
    [40, 18, 1500, 'fast'],
    [150, 18, 1500, 'fast'],
    [151, 16, 1200, 'normal'],
    [400, 16, 1200, 'normal'],
    [900, 14, 900, 'slow'],
    [2000, 12, 700, 'very-slow'],
    [6000, 10, 500, 'minimal'],
    [Number.NaN, 10, 500, 'minimal'],
  ])('depth-10 search in %d ms → depth %d, cap %d ms (%s)', (ms, depth, cap, tier) => {
    expect(deriveBudget(ms)).toMatchObject({ depth, movetimeCapMs: cap, tier });
  });

  it('normal devices get depth 16–18', () => {
    expect(DEFAULT_ENGINE_BUDGET.depth).toBe(16);
    expect(deriveBudget(100).depth).toBe(18);
  });
});

describe('applyBudget', () => {
  const budget = deriveBudget(300);
  it('fills in depth and cap when the call has no limits', () => {
    const opts: AnalyseOptions = { multiPv: 2 };
    expect(applyBudget(opts, budget)).toEqual({ multiPv: 2, depth: 16, movetimeMs: 1200 });
  });
  it('adds the cap to a depth-only call', () => {
    expect(applyBudget({ depth: 22 }, budget)).toEqual({ depth: 22, movetimeMs: 1200 });
  });
  it('keeps an explicit movetime', () => {
    expect(applyBudget({ depth: 22, movetimeMs: 50 }, budget)).toEqual({ depth: 22, movetimeMs: 50 });
    expect(applyBudget({ movetimeMs: 5000 }, budget)).toEqual({ movetimeMs: 5000 });
  });
});
