/**
 * `@/lessons` – lesson engine domain logic (WP-06, P0-12): content loading (D-26, D-52), unlock rules (D-38), stars
 * (D-13), test scoring, the lesson session with its progress records, and the pure state machines of the step types.
 * No React here – the pages live in `src/features/lessons`.
 *
 * Public API for other packages (BACKLOG WP-06 "Exposes"): `loadCatalog`, `loadLesson`, `nextLessonFor`,
 * `isUnlocked`, `computeStars` (+ the helpers below). Build the `UnlockContext` with `toProgressMap`
 * (`data.repos.lessonProgress.list()`) and the profile (`selfAssessment`, `stageZeroSkipped`).
 */
import { createLessonLoader, sourcesFromGlob, type FixtureContent, type LoadOptions } from './loader';

export {
  createLessonLoader,
  lessonFilePath,
  lessonKey,
  parseCatalog,
  sourcesFromGlob,
  type ContentError,
  type CourseLessons,
  type FixtureContent,
  type LessonCatalogData,
  type LessonLoader,
  type LessonLoadResult,
  type LessonSources,
  type LoadOptions,
  type SkipTestRef,
} from './loader';
export { parseLessonFile, lessonPositionErrors, formatSchemaIssues, type ParsedLesson } from './validate';
export { computeStars, bestStars, type EarnedStars } from './stars';
export { STAGES, STAGE_IDS, stageMeta, type StageMeta } from './stages';
export {
  availableCourses,
  courseItemIds,
  courseLessonCounts,
  courseStars,
  isCourseCompleted,
  isCourseOpen,
  isLessonCompleted,
  isStageCompleted,
  isStageOpen,
  isUnlocked,
  lessonAccess,
  stageOpenReason,
  stageSearchOrder,
  startStage,
  STAGE_ONE_ASSESSMENTS,
  toProgressMap,
  type LearnerState,
  type LessonAccess,
  type ProgressMap,
  type StageOpenReason,
  type UnlockContext,
} from './unlock';
export { nextInCourse, nextLessonFor, type NextLesson } from './next';
export {
  DEFAULT_PASS_THRESHOLD,
  EXERCISE_STEP_TYPES,
  exerciseCount,
  isExercise,
  isPassed,
  isTest,
  passThreshold,
  testResult,
  testScore,
  type TestResult,
} from './scoring';
export {
  canResume,
  completeStep,
  createLessonSession,
  goNext,
  goPrev,
  goTo,
  isReviewing,
  progressRecord,
  recordHint,
  recordMistake,
  restartSession,
  type LessonResult,
  type LessonSession,
} from './session';
export {
  canRequestHint,
  createFindMove,
  findMoveHint,
  maxHintStage,
  playFindMoveReply,
  playUci,
  requestFindMoveHint,
  revertFindMoveWrong,
  submitFindMove,
  type FindMoveHint,
  type FindMovePhase,
  type FindMoveResult,
  type FindMoveState,
  type FindMoveVerdict,
} from './findMove';
export { judgePlayOut, movesLeft, type PlayOutPly, type PlayOutReason, type PlayOutVerdict } from './playOut';
export { MAX_PLAY_OUT_ELO, playOutBot, practiceBot } from './practice';
export { LESSONS_DE } from './strings.de';
export type { DemoStep, ExplanationStep, FindMoveStep, PlayOutStep, QuizStep } from './types';

/** Every JSON file below `content/lessons/` (lazy, one chunk per file). */
const CONTENT_MODULES = import.meta.glob<unknown>('/content/lessons/**/*.json', { import: 'default' });

/** The fixture course is only bundled where e2e runs can happen (never in a production build without `VITE_E2E`). */
const FIXTURES: (() => Promise<FixtureContent>) | undefined =
  import.meta.env.PROD && import.meta.env.VITE_E2E !== '1' && import.meta.env.VITE_E2E !== 'true'
    ? undefined
    : () => import('./__fixtures__');

const defaultLoader = createLessonLoader(sourcesFromGlob(CONTENT_MODULES, FIXTURES));

/** Loads `content/lessons/catalog.json` (+ the fixture course when `opts.e2e`). Never throws. */
export function loadCatalog(opts: LoadOptions) {
  return defaultLoader.loadCatalog(opts);
}

/** Loads and validates one lesson. Never throws; `ok: false` for missing or invalid files. */
export function loadLesson(courseId: string, lessonId: string, opts: LoadOptions) {
  return defaultLoader.loadLesson(courseId, lessonId, opts);
}

/** Loads all lessons (and the course test) of a course. */
export function loadCourseLessons(...args: Parameters<typeof defaultLoader.loadCourseLessons>) {
  return defaultLoader.loadCourseLessons(...args);
}

/** Finds the Stufe-0 skip test (`kind: 'skip_test'`), `null` if there is none. */
export function findSkipTest(...args: Parameters<typeof defaultLoader.findSkipTest>) {
  return defaultLoader.findSkipTest(...args);
}
