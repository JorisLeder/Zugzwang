/**
 * `@/stats` – pure statistics of the progress data (WP-09, PRD Fortschritt §5): rating curves, success per theme,
 * accuracy per phase, frequent mistake motifs, the weakness profile and the "Als Nächstes trainieren" recommendation.
 * No React and no data access – callers pass repository results.
 */
export { DEFAULT_MAX_POINTS, downsample, ratingSeries, type RatingPoint, type RatingSeries } from './rating';
export {
  isSkillTheme,
  themeSuccess,
  WEAK_THEME_MAX_RATE,
  WEAK_THEME_MIN_ATTEMPTS,
  weakestTheme,
  weakThemes,
  type ThemeSuccess,
} from './themes';
export {
  GAME_PHASES,
  MISTAKE_CLASSES,
  mistakeCounts,
  mistakeMotifs,
  pairAnalyses,
  phaseAccuracy,
  userColors,
  type AnalysedGame,
  type ClassificationCount,
  type MotifCount,
  type PhaseAccuracy,
} from './games';
export {
  MOTIF_THEME,
  WEAK_PHASE_MAX_ACCURACY,
  WEAK_PHASE_MIN_MOVES,
  weaknessProfile,
  weakPhases,
  type WeakPhase,
  type WeaknessInput,
  type WeaknessProfile,
} from './weakness';
export { recommendTraining, type RecommendationInput, type TrainingRecommendation } from './recommend';
