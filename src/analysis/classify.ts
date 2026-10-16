/**
 * Move classification (PRD "Zugklassifizierung", thresholds and precedence exactly as D-07).
 *
 * Precedence: book > brilliant > great > best > excellent > good > miss > inaccuracy / mistake / blunder.
 * Loss L = expected-points loss 0–1 (mover's view):
 * - best: the engine's best move, or L < 0.005
 * - excellent: L ≤ 0.02 · good: L ≤ 0.05 · inaccuracy: L ≤ 0.10 · mistake: L < 0.20 · blunder: L ≥ 0.20
 * - brilliant: L ≤ 0.02, a real piece sacrifice (SEE ≤ −2 pawns), mover's win% after ≥ 50 and before < 97, not the
 *   only legal move, not a recapture
 * - great: L ≤ 0.02, not brilliant, and (EP(best) − EP(second best) ≥ 0.15, or win% before < 30 and after ≥ 50),
 *   not a recapture, not the only legal move
 * - miss: the opponent's previous move was a mistake or blunder, the best reply would have recovered ≥ 0.10 EP, and
 *   0.10 ≤ L < 0.20 (blunders stay blunders)
 */
import type { MoveClassification } from '@/core/analysis';
import type { Fen, MoveRecord, Uci } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import { captureGain, otherColor, pieceMap, pieceValue } from './see';

/** Thresholds of D-07 (expected points, 0–1; win percentages 0–100). */
export const CLASSIFICATION_THRESHOLDS = {
  best: 0.005,
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  blunder: 0.2,
  /** Brilliant/great: maximal loss. */
  nearBest: 0.02,
  /** Great: minimal gap between the best and the second-best move. */
  onlyMoveGap: 0.15,
  /** Great: "saves a lost position" – win% before below / after at least. */
  lostBelow: 30,
  savedFrom: 50,
  /** Brilliant: win% after at least / before below. */
  brilliantAfterMin: 50,
  brilliantBeforeMax: 97,
  /** Brilliant: SEE result of the sacrificed material (pawns). */
  sacrificeSee: -2,
  /** Miss: EP the best reply would have recovered. */
  missRecovered: 0.1,
} as const;

/** Inputs of `classifyMove` (all from the mover's point of view). */
export interface ClassifyInput {
  /** Expected-points loss 0–1. */
  loss: number;
  /** The played move is the engine's best move. */
  isBestMove: boolean;
  /** Book condition (D-07): the position after the move is in the opening book and the game has not left book. */
  inBook?: boolean;
  /** Mover's win percentage before the move (best play), 0–100. */
  winPctBefore: number;
  /** Mover's win percentage after the played move, 0–100. */
  winPctAfter: number;
  /** EP(best) − EP(second-best move); `undefined` when no second line exists. */
  secondBestGap?: number;
  /** The played move was the only legal move. */
  onlyLegalMove?: boolean;
  /** The move recaptures on the square where the opponent just captured. */
  isRecapture?: boolean;
  /** Real piece sacrifice: the most material the opponent can win by SEE after the move (≤ −2 = sacrifice), see `sacrificeSee`. */
  sacrificeSee?: number;
  /** Classification of the opponent's previous move, if any. */
  previousClassification?: MoveClassification;
  /** EP the best reply would have recovered after the opponent's previous move (see `missRecovered`). */
  recoverable?: number;
}

/** Whether the inputs describe a "brilliant" move (D-07). */
export function isBrilliant(i: ClassifyInput): boolean {
  const t = CLASSIFICATION_THRESHOLDS;
  return (
    i.loss <= t.nearBest &&
    i.sacrificeSee !== undefined &&
    i.sacrificeSee <= t.sacrificeSee &&
    i.winPctAfter >= t.brilliantAfterMin &&
    i.winPctBefore < t.brilliantBeforeMax &&
    !i.onlyLegalMove &&
    !i.isRecapture
  );
}

/** Whether the inputs describe a "great" move (D-07; call only when not brilliant). */
export function isGreat(i: ClassifyInput): boolean {
  const t = CLASSIFICATION_THRESHOLDS;
  if (i.loss > t.nearBest || i.onlyLegalMove || i.isRecapture) return false;
  const onlyGoodMove = i.secondBestGap !== undefined && i.secondBestGap >= t.onlyMoveGap;
  const savesLostPosition = i.winPctBefore < t.lostBelow && i.winPctAfter >= t.savedFrom;
  return onlyGoodMove || savesLostPosition;
}

/** Whether the inputs describe a "miss" (D-07). */
export function isMiss(i: ClassifyInput): boolean {
  const t = CLASSIFICATION_THRESHOLDS;
  const opponentErred = i.previousClassification === 'mistake' || i.previousClassification === 'blunder';
  return (
    opponentErred &&
    (i.recoverable ?? 0) >= t.missRecovered &&
    i.loss >= t.inaccuracy &&
    i.loss < t.blunder
  );
}

/** Classifies a move (D-07, see file header). */
export function classifyMove(i: ClassifyInput): MoveClassification {
  const t = CLASSIFICATION_THRESHOLDS;
  if (i.inBook) return 'book';
  if (isBrilliant(i)) return 'brilliant';
  if (isGreat(i)) return 'great';
  if (i.isBestMove || i.loss < t.best) return 'best';
  if (i.loss <= t.excellent) return 'excellent';
  if (i.loss <= t.good) return 'good';
  if (isMiss(i)) return 'miss';
  if (i.loss <= t.inaccuracy) return 'inaccuracy';
  if (i.loss < t.blunder) return 'mistake';
  return 'blunder';
}

/**
 * Sacrifice measure for the "brilliant" rule (D-07), in pawns (≤ 0): the worst net material result for the mover
 * after `move`. For every knight, bishop, rook and queen of the mover the most the opponent can win by capturing it
 * (SEE, `captureGain`) is subtracted from the material the move itself captured – so a losing capture (SEE of the move)
 * and a piece left en prise both count, while an even trade (e.g. N×B, B×N back) does not. `0` when nothing can be
 * won or the move is illegal. A value ≤ −2 is a real piece sacrifice.
 */
export function sacrificeSee(fenBefore: Fen, move: Uci): number {
  let rec: MoveRecord | null = null;
  try {
    rec = ChessGame.fromFen(fenBefore).move(move);
  } catch {
    return 0;
  }
  if (!rec) return 0;
  const captured = rec.captured ? pieceValue(rec.captured) : 0;
  let worst = 0;
  const opp = otherColor(rec.color);
  for (const p of pieceMap(rec.fenAfter).values()) {
    if (p.color !== rec.color || p.type === 'k' || p.type === 'p') continue;
    worst = Math.min(worst, captured - captureGain(rec.fenAfter, p.square, opp));
  }
  return worst;
}

/** Whether `move` recaptures on the square where the opponent's previous move captured. */
export function isRecapture(previous: Pick<MoveRecord, 'to' | 'captured'> | null | undefined, move: Pick<MoveRecord, 'to' | 'captured'>): boolean {
  return Boolean(previous?.captured && move.captured && previous.to === move.to);
}
