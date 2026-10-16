/**
 * Lesson content schemas (D-26): `content/lessons/catalog.json` and `content/lessons/<course>/<lesson>.json`.
 */
import { z } from 'zod';
import type { CourseMeta, Lesson, LessonStep, MoveTreeNode, QuizAssert } from '../lessons';
import { arrowSchema, colorSchema, fenSchema, squareMarkSchema, uciSchema } from './common';

const idSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'IDs sind kebab-case');
const stageSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const textSchema = z.string().trim().min(1);

/** Recursive move tree (P2-04). */
export const moveTreeNodeSchema: z.ZodType<MoveTreeNode> = z.lazy(() =>
  z.object({
    move: uciSchema,
    comment: z.string().optional(),
    children: z.array(moveTreeNodeSchema),
  }),
);

/** Machine-checked quiz fact. */
export const quizAssertSchema = z.union([
  z.object({
    kind: z.enum(['isCheckmate', 'isStalemate', 'isCheck', 'isInsufficientMaterial']),
    fen: fenSchema,
    expect: z.boolean(),
  }),
  z.object({ kind: z.literal('isLegalMove'), fen: fenSchema, move: uciSchema, expect: z.boolean() }),
  z.object({ kind: z.literal('bestMove'), fen: fenSchema, move: uciSchema }),
]) satisfies z.ZodType<QuizAssert>;

/** All five step types. */
export const lessonStepSchema = z.discriminatedUnion('type', [
  z.object({
    id: idSchema,
    type: z.literal('explanation'),
    textDe: textSchema,
    fen: fenSchema.optional(),
    orientation: colorSchema.optional(),
    arrows: z.array(arrowSchema).optional(),
    marks: z.array(squareMarkSchema).optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal('demo'),
    introDe: z.string().optional(),
    startFen: fenSchema,
    orientation: colorSchema.optional(),
    moves: z
      .array(
        z.object({
          uci: uciSchema,
          commentDe: z.string().optional(),
          arrows: z.array(arrowSchema).optional(),
          marks: z.array(squareMarkSchema).optional(),
        }),
      )
      .min(1),
  }),
  z.object({
    id: idSchema,
    type: z.literal('find_move'),
    promptDe: textSchema,
    fen: fenSchema,
    orientation: colorSchema.optional(),
    solution: z.array(moveTreeNodeSchema).min(1),
    acceptAnyMate: z.boolean(),
    claim: z.union([
      z.object({ kind: z.literal('best') }),
      z.object({ kind: z.literal('mate'), mateIn: z.number().int().min(1) }),
      z.object({ kind: z.literal('rule') }),
    ]),
    hintsDe: z.array(textSchema).min(1).max(2),
    explanationDe: textSchema,
    puzzle: z
      .object({ rating: z.number().int().min(100).max(3000), themes: z.array(z.string().min(1)).min(1) })
      .optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal('quiz'),
    questionDe: textSchema,
    fen: fenSchema.optional(),
    options: z
      .array(z.object({ id: z.string().min(1), textDe: textSchema, correct: z.boolean(), feedbackDe: z.string().optional() }))
      .min(2)
      .refine((opts) => opts.filter((o) => o.correct).length === 1, 'Genau eine Antwort muss richtig sein'),
    asserts: z.array(quizAssertSchema).optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal('play_out'),
    promptDe: textSchema,
    fen: fenSchema,
    userColor: colorSchema,
    goal: z.enum(['checkmate', 'promote', 'draw']),
    maxMoves: z.number().int().min(1).max(200),
    botElo: z.union([z.number().int().min(100).max(3500), z.literal('max')]),
    successDe: textSchema,
    failDe: textSchema,
  }),
]) satisfies z.ZodType<LessonStep>;

/** A lesson file. Step ids must be unique within the lesson. */
export const lessonSchema = z
  .object({
    id: idSchema,
    courseId: idSchema,
    order: z.number().int().min(0),
    version: z.number().int().min(1),
    kind: z.enum(['lesson', 'course_test', 'skip_test']),
    titleDe: textSchema,
    summaryDe: textSchema,
    steps: z.array(lessonStepSchema).min(1),
    practiceThemes: z.array(z.string().min(1)),
    passThreshold: z.number().min(0).max(1).optional(),
    sources: z.array(z.string()).optional(),
  })
  .refine((l) => new Set(l.steps.map((s) => s.id)).size === l.steps.length, {
    message: 'Schritt-IDs müssen innerhalb einer Lektion eindeutig sein',
    path: ['steps'],
  }) satisfies z.ZodType<Lesson>;

/** Course metadata. */
export const courseMetaSchema = z.object({
  id: idSchema,
  stage: stageSchema,
  order: z.number().int().min(0),
  version: z.number().int().min(1),
  titleDe: textSchema,
  descriptionDe: textSchema,
  status: z.enum(['available', 'planned']),
  lessonIds: z.array(idSchema),
  testLessonId: idSchema.optional(),
}) satisfies z.ZodType<CourseMeta>;

/** `content/lessons/catalog.json`: every course, including planned ones. */
export const lessonCatalogSchema = z.object({
  courses: z.array(courseMetaSchema),
});

/** Parsed catalog type. */
export type LessonCatalog = z.infer<typeof lessonCatalogSchema>;
