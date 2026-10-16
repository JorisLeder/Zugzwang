/**
 * Lesson content contract for WP-06 (engine) and WP-07 (content) (BACKLOG 2.6, PRD P0-12/P0-13, P2-04, D-26).
 * Content lives as JSON in `content/lessons/` and is validated with `lessonSchema`/`courseMetaSchema`.
 */
import type { Arrow, Color, Fen, SquareMark, Uci } from './chess';
import type { PuzzleThemeId } from './puzzles';

/** Lernpfad stage: 0 Neuling, 1 Einsteiger, 2–4 later stages. */
export type StageId = 0 | 1 | 2 | 3 | 4;

/** A course (`courses` table / `content/lessons/catalog.json`). */
export interface CourseMeta {
  /** Stable kebab-case id. */
  id: string;
  stage: StageId;
  /** Order within the stage. */
  order: number;
  /** Content version; bump on changes that affect progress. */
  version: number;
  titleDe: string;
  descriptionDe: string;
  /** `planned` courses are shown as "in Vorbereitung". */
  status: 'available' | 'planned';
  /** Lessons in order (excluding the course test). */
  lessonIds: string[];
  /** Course test, unlocked after all lessons (D-38). */
  testLessonId?: string;
}

/** Node of a move tree (P2-04 variations): an accepted move with its continuations. */
export interface MoveTreeNode {
  move: Uci;
  /** Optional German comment shown after the move. */
  comment?: string;
  /** Next moves: after a user move these are the opponent replies (first one is auto-played); after an opponent move, accepted user moves. */
  children: MoveTreeNode[];
}

/** Machine-checked fact behind a quiz answer (validated by `validate:content`). */
export type QuizAssert =
  | { kind: 'isCheckmate' | 'isStalemate' | 'isCheck' | 'isInsufficientMaterial'; fen: Fen; expect: boolean }
  | { kind: 'isLegalMove'; fen: Fen; move: Uci; expect: boolean }
  | { kind: 'bestMove'; fen: Fen; move: Uci };

/** The five step types (PRD Lektionen §4). */
export type LessonStep =
  /** Erklärung: text with an optional board, arrows and marks. */
  | { id: string; type: 'explanation'; textDe: string; fen?: Fen; orientation?: Color; arrows?: Arrow[]; marks?: SquareMark[] }
  /** Demo: moves played step by step with comments. */
  | {
      id: string;
      type: 'demo';
      introDe?: string;
      startFen: Fen;
      orientation?: Color;
      moves: Array<{ uci: Uci; commentDe?: string; arrows?: Arrow[]; marks?: SquareMark[] }>;
    }
  /** Finde den Zug: the learner plays; `solution` holds the accepted first user moves (with opponent replies as children). */
  | {
      id: string;
      type: 'find_move';
      promptDe: string;
      fen: Fen;
      orientation?: Color;
      solution: MoveTreeNode[];
      /** Accept every immediately mating move (D-12). */
      acceptAnyMate: boolean;
      /** What the validator confirms: engine-best, forced mate in N, or only legality for rule exercises. */
      claim: { kind: 'best' } | { kind: 'mate'; mateIn: number } | { kind: 'rule' };
      /** 1–2 text hints; afterwards piece and target highlight. */
      hintsDe: string[];
      explanationDe: string;
      /** Export as an easy puzzle (P0-04). */
      puzzle?: { rating: number; themes: PuzzleThemeId[] };
    }
  /** Quiz: single choice with per-option feedback. */
  | {
      id: string;
      type: 'quiz';
      questionDe: string;
      fen?: Fen;
      options: Array<{ id: string; textDe: string; correct: boolean; feedbackDe?: string }>;
      asserts?: QuizAssert[];
    }
  /** Ausspielen: play the position against a bot until the goal is reached. */
  | {
      id: string;
      type: 'play_out';
      promptDe: string;
      fen: Fen;
      userColor: Color;
      goal: 'checkmate' | 'promote' | 'draw';
      /** Maximum number of user moves. */
      maxMoves: number;
      /** Bot strength, or `max` for full engine strength. */
      botElo: number | 'max';
      successDe: string;
      failDe: string;
    };

/** Step type names. */
export type LessonStepType = LessonStep['type'];

/** A lesson (`lessons` + `lesson_steps` tables). */
export interface Lesson {
  id: string;
  courseId: string;
  order: number;
  version: number;
  /** Normal lesson, course test, or the Stufe-0 skip test. */
  kind: 'lesson' | 'course_test' | 'skip_test';
  titleDe: string;
  summaryDe: string;
  steps: LessonStep[];
  /** Puzzle themes for "Passende Puzzles" after the lesson. */
  practiceThemes: PuzzleThemeId[];
  /** Pass threshold for tests (score = correct first tries / exercises), default 0.8. */
  passThreshold?: number;
  /** References, e.g. "FIDE Laws of Chess 2023, Art. 3.8.2". */
  sources?: string[];
}

/** Progress of one lesson (`lesson_progress`, furthest progress wins). */
export interface LessonProgress {
  lessonId: string;
  lessonVersion: number;
  /** Index of the step to resume at (0-based). */
  currentStep: number;
  completed: boolean;
  /** 0 = not completed; completed lessons have 1–3 stars (D-13). */
  stars: 0 | 1 | 2 | 3;
  mistakes: number;
  hintsUsed: number;
  /** Test score 0–1 (course/skip tests). */
  score?: number;
  updatedAt: string;
  completedAt: string | null;
}
