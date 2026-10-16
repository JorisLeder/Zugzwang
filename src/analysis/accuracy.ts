/**
 * Move and game accuracy (PRD "Analyse-Pipeline" step 3). Formulas re-implemented from the Lichess sources listed in
 * `SOURCES.md` (lila `AccuracyPercent`, scalalib `Maths`); constants are copied exactly.
 */
import type { Color } from '@/core/chess';

/** Accuracy curve `a · e^(−k · Δ) + b` fitted by Lichess (lila `AccuracyPercent.fromWinPercents`). */
export const ACCURACY_A = 103.1668100711649;
export const ACCURACY_K = 0.04354415386753951;
export const ACCURACY_B = -3.166924740191411;
/** Lichess adds +1 "uncertainty bonus (due to imperfect analysis)" before clamping. */
export const ACCURACY_UNCERTAINTY_BONUS = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Accuracy 0–100 of one move from the mover's win percentage before and after it (both 0–100, mover's view):
 * 100 if the win percentage did not drop, otherwise `103.1668 · e^(−0.04354 · (before − after)) − 3.1669 + 1`,
 * clamped to 0–100.
 */
export function moveAccuracy(winPctBefore: number, winPctAfter: number): number {
  if (winPctAfter >= winPctBefore) return 100;
  const diff = winPctBefore - winPctAfter;
  return clamp(ACCURACY_A * Math.exp(-ACCURACY_K * diff) + ACCURACY_B + ACCURACY_UNCERTAINTY_BONUS, 0, 100);
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Population standard deviation (scalalib `Maths.standardDeviation`). */
function standardDeviation(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/** Harmonic mean with every value floored at 1 (scalalib `Maths.harmonicMean`). */
function harmonicMean(values: number[]): number {
  return values.length / values.reduce((s, v) => s + 1 / Math.max(1, v), 0);
}

function weightedMean(pairs: Array<[value: number, weight: number]>): number | null {
  let sum = 0;
  let weights = 0;
  for (const [v, w] of pairs) {
    sum += v * w;
    weights += w;
  }
  return weights === 0 ? null : sum / weights;
}

/**
 * Game accuracy per side (Lichess): the mean of a volatility-weighted mean and the harmonic mean of the move
 * accuracies of that side.
 *
 * - Window size = ⌊plies / 10⌋ clamped to 2…8. The weight of a move is the standard deviation of White's win
 *   percentage over a window of positions ending at the move (the first moves reuse the first window), clamped to
 *   0.5…12 – moves in volatile phases count more.
 * - Every move accuracy uses `moveAccuracy` on the mover's win percentages.
 *
 * @param winPctWhite White's win percentage of every position: index 0 = start position, index i = after ply i.
 * @param startColor Side that made the first move.
 * @returns Accuracy per side, or `null` when one side has no move (fewer than two plies), as Lichess does.
 */
export function gameAccuracy(winPctWhite: readonly number[], startColor: Color): { w: number; b: number } | null {
  const plies = winPctWhite.length - 1;
  if (plies < 1) return null;
  const windowSize = clamp(Math.floor(plies / 10), 2, 8);
  const windows: number[][] = [];
  const firstWindow = winPctWhite.slice(0, windowSize);
  for (let i = 0; i < Math.min(windowSize, winPctWhite.length) - 2; i += 1) windows.push(firstWindow);
  if (winPctWhite.length >= windowSize) {
    for (let i = 0; i + windowSize <= winPctWhite.length; i += 1) windows.push(winPctWhite.slice(i, i + windowSize));
  } else {
    windows.push([...winPctWhite]);
  }
  const weighted: Record<Color, Array<[number, number]>> = { w: [], b: [] };
  for (let i = 0; i < plies; i += 1) {
    const prev = winPctWhite[i]!;
    const next = winPctWhite[i + 1]!;
    const weight = clamp(standardDeviation(windows[i]!), 0.5, 12);
    const color: Color = (i % 2 === 0) === (startColor === 'w') ? 'w' : 'b';
    const accuracy = color === 'w' ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next);
    weighted[color].push([accuracy, weight]);
  }
  const side = (c: Color): number | null => {
    if (weighted[c].length === 0) return null;
    const wm = weightedMean(weighted[c]);
    if (wm === null) return null;
    return (wm + harmonicMean(weighted[c].map(([a]) => a))) / 2;
  };
  const w = side('w');
  const b = side('b');
  return w === null || b === null ? null : { w, b };
}
