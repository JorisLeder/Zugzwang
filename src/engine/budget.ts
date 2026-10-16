/**
 * Device-dependent search budget (PRD Randfall 3, NFR performance): on `init` the browser engine measures how long a
 * `go depth 10` takes on a fixed middlegame position and derives the default depth (16–18 on normal devices) and a
 * per-position movetime cap, so weak devices search less deep instead of freezing.
 */

/** Search budget of an engine instance. */
export interface EngineBudget {
  /** Default depth for calls that give neither depth nor movetime. */
  depth: number;
  /** Upper bound in ms for every search that does not give its own movetime. */
  movetimeCapMs: number;
  /** Speed class (for diagnostics). */
  tier: 'fast' | 'normal' | 'slow' | 'very-slow' | 'minimal';
  /** Measured `go depth 10` time in ms (`undefined` = not measured, defaults). */
  benchmarkMs?: number;
}

/** Middlegame position used for the speed measurement (fixture game, before 14.Qc2??). */
export const BENCHMARK_FEN = 'r4rk1/1ppq1pp1/pbnpb2p/4p3/PP2P3/N1PP1N1P/B4nP1/R1BQ1RK1 w - - 0 14';

/** Depth of the speed measurement. */
export const BENCHMARK_DEPTH = 10;

/** Budget used before/without a measurement (Node, tests): depth 16, 1.5 s cap. */
export const DEFAULT_ENGINE_BUDGET: EngineBudget = { depth: 16, movetimeCapMs: 1500, tier: 'normal' };

/**
 * Budget from the measured `go depth 10` time (ms). Thresholds: ≤ 150 ms → depth 18 / 1.5 s (desktop: ~40 ms),
 * ≤ 400 → 16 / 1.2 s, ≤ 1000 → 14 / 0.9 s, ≤ 2500 → 12 / 0.7 s, slower → 10 / 0.5 s.
 */
export function deriveBudget(benchmarkMs: number): EngineBudget {
  const ms = Number.isFinite(benchmarkMs) && benchmarkMs >= 0 ? benchmarkMs : Number.POSITIVE_INFINITY;
  if (ms <= 150) return { depth: 18, movetimeCapMs: 1500, tier: 'fast', benchmarkMs };
  if (ms <= 400) return { depth: 16, movetimeCapMs: 1200, tier: 'normal', benchmarkMs };
  if (ms <= 1000) return { depth: 14, movetimeCapMs: 900, tier: 'slow', benchmarkMs };
  if (ms <= 2500) return { depth: 12, movetimeCapMs: 700, tier: 'very-slow', benchmarkMs };
  return { depth: 10, movetimeCapMs: 500, tier: 'minimal', benchmarkMs };
}

/**
 * Applies a budget to the limits of one call: no limits → budget depth + cap; a depth without movetime → the cap is
 * added; an explicit movetime is kept.
 */
export function applyBudget<T extends { depth?: number; movetimeMs?: number }>(opts: T, budget: EngineBudget): T {
  if (opts.movetimeMs !== undefined) return opts;
  if (opts.depth === undefined) return { ...opts, depth: budget.depth, movetimeMs: budget.movetimeCapMs };
  return { ...opts, movetimeMs: budget.movetimeCapMs };
}
