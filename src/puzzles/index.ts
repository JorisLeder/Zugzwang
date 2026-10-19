/**
 * `@/puzzles` – puzzle domain logic (WP-03, PRD P0-04 … P0-06, P0-01 demo). Pure functions and the session state
 * machine; the pages live in `src/features/puzzles`.
 *
 * - Checking moves: `checkPuzzleMove` (solution move or any checkmate, D-12), `solverColor`, `puzzleStartFen`.
 * - Session: `createPuzzleSession`, `playOpponentMove`, `submitUserMove`, `revertWrongMove`, `requestHint`,
 *   `revealSolution`, `playSolutionStep`, `hintSquares`, `sessionOutcome`, `isFailedForRating`, `reviewPositions`.
 * - Selection: `selectNextRated` (±150 → ±250 → ±400 → any, never a rated repeat, D-32), `selectLearning`,
 *   `selectThemePuzzle`, `difficultyRange`, `countThemePuzzles`, `openingTagsForTheme`.
 * - Bank: `loadPuzzleBank` (manifest + chunks → repository, idempotent, offline fallback, D-25).
 * - Texts: `taskTextDe`, `hintTextDe`, `motifHintDe`, `sideToMoveDe`; explanations: `puzzleExplanation`, `puzzleFacts`.
 * - Themes: `TRAINABLE_THEMES`, `listTrainingThemes`, `themeSuccessRate`, `motifTags`, `openingLabel`.
 * - Demo: `DEMO_PUZZLES` (5 fixed easy puzzles).
 */
export { puzzleAttemptInput, settleAbandonedRatedPuzzle, type PuzzleAttemptInput } from './attempt';
export {
  loadPuzzleBank,
  parseChunk,
  parseManifest,
  PUZZLE_BANK_DIR,
  PUZZLE_BANK_MANIFEST,
  PuzzleBankError,
  type LoadPuzzleBankOptions,
  type PuzzleBankStatus,
} from './bank';
export {
  checkPuzzleMove,
  isUserPly,
  puzzleGameAt,
  puzzleMateLength,
  puzzleStartFen,
  solverColor,
  userMoveCount,
  type PuzzleMoveVerdict,
} from './check';
export { DEMO_PUZZLES } from './demo';
export { puzzleExplanation, puzzleFacts } from './explanation';
export {
  countThemePuzzles,
  difficultyRange,
  openingTagsForTheme,
  RATING_WINDOWS,
  selectLearning,
  selectNear,
  selectNextRated,
  selectThemePuzzle,
  THEME_DIFFICULTIES,
  type PuzzleSelectionRepos,
  type RatedSelection,
  type SelectionFilter,
  type ThemeDifficulty,
  type ThemeFilter,
} from './select';
export {
  createPuzzleSession,
  hintSquares,
  isFailedForRating,
  playOpponentMove,
  playSolutionStep,
  requestHint,
  revealSolution,
  revertWrongMove,
  reviewPositions,
  sessionOutcome,
  submitUserMove,
  type HintEffect,
  type HintStage,
  type PuzzleFeedback,
  type PuzzleOutcome,
  type PuzzlePhase,
  type PuzzleSessionMode,
  type PuzzleSessionState,
} from './session';
export { MOTIF_HINTS_DE, PUZZLE_DOMAIN_DE, THEME_GROUP_LABELS_DE } from './strings.de';
export { hintTextDe, motifHintDe, sideToMoveDe, taskTextDe } from './texts';
export {
  listTrainingThemes,
  MIN_LISTED_THEMES,
  motifTags,
  openingLabel,
  THEME_MIN_PUZZLES,
  themeSuccessRate,
  TRAINABLE_THEMES,
  type ThemeListEntry,
} from './themes';
