/**
 * Lesson stars (D-13, PRD "1–3 Sterne je Lektion, abhängig von Fehlern und Hinweisen").
 */
import type { LessonProgress } from '@/core/lessons';

/** Stars of a completed lesson. */
export type EarnedStars = 1 | 2 | 3;

/**
 * Stars for a completed lesson: penalty = mistakes + hints; 0 → 3 stars, 1–2 → 2 stars, ≥ 3 → 1 star (a completed
 * lesson always has at least one star). Negative or fractional inputs are treated as 0 / rounded down.
 */
export function computeStars(mistakes: number, hintsUsed: number): EarnedStars {
  const penalty = Math.max(0, Math.floor(mistakes)) + Math.max(0, Math.floor(hintsUsed));
  if (penalty === 0) return 3;
  if (penalty <= 2) return 2;
  return 1;
}

/** The better of two stored star counts ("best result is kept", D-13). */
export function bestStars(a: LessonProgress['stars'], b: LessonProgress['stars']): LessonProgress['stars'] {
  return Math.max(a, b) as LessonProgress['stars'];
}
