/** URL parameters and defaults of the puzzle pages. */
import { SELF_ASSESSMENT_OPTIONS } from '@/core/profile';
import { THEME_DIFFICULTIES, type ThemeDifficulty } from '@/puzzles';

/** Rating used before the self-assessment: Einsteiger (the primary persona, D-10). */
export const DEFAULT_PUZZLE_CENTER = SELF_ASSESSMENT_OPTIONS.find((o) => o.id === 'beginner')!.puzzleRating;

/** Query parameter of the difficulty filter (`?d=easy|medium|hard`, default all). */
export const DIFFICULTY_PARAM = 'd';

/** Query parameter of the opening filter (`?opening=Italian_Game`). */
export const OPENING_PARAM = 'opening';

/** Difficulty from the query string (unknown values → `all`). */
export function parseDifficulty(value: string | null): ThemeDifficulty {
  return THEME_DIFFICULTIES.includes(value as ThemeDifficulty) ? (value as ThemeDifficulty) : 'all';
}

/** Query string for the theme filters (`''` for the defaults). */
export function themeSearch(difficulty: ThemeDifficulty, opening?: string): string {
  const q = new URLSearchParams();
  if (difficulty !== 'all') q.set(DIFFICULTY_PARAM, difficulty);
  if (opening) q.set(OPENING_PARAM, opening);
  const s = q.toString();
  return s ? `?${s}` : '';
}
