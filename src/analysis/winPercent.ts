/**
 * Win percentage and expected points (PRD "Analyse-Pipeline" step 3, D-07, D-08).
 *
 * Constants and edge handling follow Lichess (scalachess `chess.eval.WinPercent`, see `THIRD_PARTY_NOTICES.md`):
 * - centipawns are clamped to ±1000 before the logistic conversion (`Cp.CEILING`);
 * - a forced mate counts as ±1000 cp (the side that mates gets the ceiling, the side that is mated the floor);
 * - "mate 0" (the side to move is already checkmated) is a loss for the side to move.
 * The result therefore lies in [2.456, 97.544] – never exactly 0 or 100.
 */
import type { Color } from '@/core/chess';
import type { Score } from '@/core/engine';

/** Logistic multiplier (scalachess `WinPercent.winningChances`, lila PR #11148). */
export const WIN_PERCENT_MULTIPLIER = -0.00368208;

/** Centipawn ceiling applied before the conversion; mate scores map to ±ceiling (scalachess `Eval.Cp.CEILING`). */
export const CP_CEILING = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Winning chances in [-1, +1] from centipawns (side-to-move or any fixed point of view). */
export function winningChances(cp: number): number {
  const c = clamp(cp, -CP_CEILING, CP_CEILING);
  return clamp(2 / (1 + Math.exp(WIN_PERCENT_MULTIPLIER * c)) - 1, -1, 1);
}

/**
 * Win percentage 0–100 from centipawns: `50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)` with cp clamped to ±1000.
 * The point of view is that of the centipawn value (positive cp = that side is better).
 */
export function winPercent(cp: number): number {
  return 50 + 50 * winningChances(cp);
}

/**
 * Win percentage of `pov` for an engine score.
 * @param score Engine score, **White's point of view** (D-08).
 * @param pov Side whose winning chances are wanted (usually the mover).
 * @param turn Side to move in the evaluated position – needed for `mate 0` (the side to move is checkmated).
 */
export function scoreWinPercent(score: Score, pov: Color, turn: Color): number {
  if (score.type === 'mate') {
    if (score.value === 0) return winPercent(turn === pov ? -CP_CEILING : CP_CEILING);
    const whiteMates = score.value > 0;
    const povMates = pov === 'w' ? whiteMates : !whiteMates;
    return winPercent(povMates ? CP_CEILING : -CP_CEILING);
  }
  return winPercent(pov === 'w' ? score.value : -score.value);
}

/** Expected points 0–1 from a win percentage 0–100 (EP = win% / 100). */
export function expectedPoints(winPct: number): number {
  return winPct / 100;
}

/**
 * Expected-points loss of a move, 0–1: `max(0, EP(best) − EP(played))` with EP = mover's win% / 100 (D-07).
 * Rounded to 4 decimals so that stored values and the classification use the same number.
 * @param bestWinPct Mover's win percentage (0–100) after the engine's best move (= evaluation before the move).
 * @param playedWinPct Mover's win percentage (0–100) after the played move.
 */
export function expectedPointsLoss(bestWinPct: number, playedWinPct: number): number {
  const loss = Math.max(0, expectedPoints(bestWinPct) - expectedPoints(playedWinPct));
  return Math.round(loss * 10_000) / 10_000;
}
