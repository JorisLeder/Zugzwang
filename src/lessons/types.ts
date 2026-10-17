/** Step type aliases of the lesson contract (`@/core/lessons`). */
import type { LessonStep } from '@/core/lessons';

/** Erklärung. */
export type ExplanationStep = Extract<LessonStep, { type: 'explanation' }>;
/** Demo. */
export type DemoStep = Extract<LessonStep, { type: 'demo' }>;
/** Finde den Zug. */
export type FindMoveStep = Extract<LessonStep, { type: 'find_move' }>;
/** Quiz. */
export type QuizStep = Extract<LessonStep, { type: 'quiz' }>;
/** Ausspielen. */
export type PlayOutStep = Extract<LessonStep, { type: 'play_out' }>;
