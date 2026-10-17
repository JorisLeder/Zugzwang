/** Pure helpers of the evaluation bar (DESIGN §5.4). Scores are White's point of view (D-08). */
import type { Score } from '@/core/engine';
import { CHESS_UI_DE } from './strings.de';

/**
 * White's share of the bar in percent: win percentage W(cp) from the PRD formula (Lichess),
 * `50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)`, clamped to 3–97 %; forced mate → 100 / 0. Unknown → 50.
 */
export function whiteShare(score: Score | null): number {
  if (!score) return 50;
  if (score.type === 'mate') return score.value > 0 ? 100 : score.value < 0 ? 0 : 50;
  const w = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.value)) - 1);
  return Math.max(3, Math.min(97, w));
}

/** Words for the accessible label: "Weiß steht etwas besser", "Schwarz setzt in 2 Zügen matt", … */
export function evalWords(score: Score | null): string {
  if (!score) return CHESS_UI_DE.equal;
  if (score.type === 'mate') {
    if (score.value === 0) return CHESS_UI_DE.mated;
    return CHESS_UI_DE.mateIn(score.value > 0 ? 'w' : 'b', Math.abs(score.value));
  }
  const cp = Math.abs(score.value);
  if (cp < 30) return CHESS_UI_DE.equal;
  const side = score.value > 0 ? 'w' : 'b';
  return CHESS_UI_DE.advantage(side, cp < 100 ? 'slight' : cp < 300 ? 'clear' : 'decisive');
}

/** Which side leads (decides where the label sits): White for ≥ 50 %. */
export function leadingSide(score: Score | null): 'w' | 'b' {
  return whiteShare(score) >= 50 ? 'w' : 'b';
}
