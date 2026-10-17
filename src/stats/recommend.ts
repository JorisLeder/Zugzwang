/**
 * "Als Nächstes trainieren" (PRD P0-14, User Story Fortschritt 3): one recommendation based on the user's mistakes.
 *
 * Order:
 * 1. the weakest puzzle theme with ≥ 5 attempts and < 60 % success → Themen-Training of that theme;
 * 2. else the most frequent motif behind mistakes in analysed games → the matching theme (`MOTIF_THEME`);
 * 3. else the next lesson;
 * 4. else a fitting bot.
 * `null` when none of these is available.
 */
import type { MotifId } from '@/core/explain';
import type { ThemeStat } from '@/core/profile';
import type { PuzzleThemeId } from '@/core/puzzles';
import { mistakeMotifs, type AnalysedGame } from './games';
import { isSkillTheme, weakestTheme } from './themes';
import { MOTIF_THEME } from './weakness';

/** A recommendation. */
export type TrainingRecommendation =
  | { kind: 'theme'; reason: 'weak_theme'; themeId: PuzzleThemeId; rate: number; attempts: number }
  | { kind: 'theme'; reason: 'game_motif'; themeId: PuzzleThemeId; motif: MotifId; count: number }
  | { kind: 'lesson'; reason: 'next_lesson'; courseId: string; lessonId: string }
  | { kind: 'bot'; reason: 'fitting_bot'; botId: string };

/** Input of `recommendTraining`. */
export interface RecommendationInput {
  themeStats: readonly ThemeStat[];
  games: readonly AnalysedGame[];
  /** The next lesson (`nextLessonFor`), `null` when everything open is done or content is missing. */
  nextLesson: { courseId: string; lessonId: string } | null;
  /** A bot that fits the user's rating (`recommendBot`), `null` without a roster. */
  fittingBotId: string | null;
  /** Themes that have puzzles in the local bank; when given, motif themes without puzzles are skipped. */
  availableThemes?: ReadonlySet<PuzzleThemeId>;
}

/** Computes the recommendation. */
export function recommendTraining(input: RecommendationInput): TrainingRecommendation | null {
  const weak = weakestTheme(input.themeStats);
  if (weak) return { kind: 'theme', reason: 'weak_theme', themeId: weak.theme.id, rate: weak.rate, attempts: weak.attempts };

  for (const m of mistakeMotifs(input.games)) {
    const themeId = MOTIF_THEME[m.motif];
    if (!themeId || !isSkillTheme(themeId)) continue;
    if (input.availableThemes && !input.availableThemes.has(themeId)) continue;
    return { kind: 'theme', reason: 'game_motif', themeId, motif: m.motif, count: m.count };
  }

  if (input.nextLesson) return { kind: 'lesson', reason: 'next_lesson', courseId: input.nextLesson.courseId, lessonId: input.nextLesson.lessonId };
  if (input.fittingBotId) return { kind: 'bot', reason: 'fitting_bot', botId: input.fittingBotId };
  return null;
}
