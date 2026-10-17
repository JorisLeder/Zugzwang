/**
 * Outbox entries: every progress write adds one in the same Dexie transaction (PRD "Warteschlange"). Entries are
 * pushed in `seq` order and are idempotent (row ids are client UUIDs; the server ignores duplicates).
 *
 * Payloads are snake_case rows of `@/core/tables` (`insert`/`upsert`) or `{ fn, args }` (`rpc`). The owner column is
 * filled with the local user id when enqueued; the sync adapter overwrites it with the logged-in user's id when it
 * pushes, so progress made in local mode can be uploaded after the first cloud login.
 */
import type { GameAnalysis } from '@/core/analysis';
import type { ExplanationFeedback } from '@/core/explain';
import type { Game, GameMoveEvent } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import type { Profile, ReviewQueueItem } from '@/core/profile';
import type { PuzzleAttempt } from '@/core/puzzles';
import type { RatingRecord } from '@/core/rating';
import type { OutboxEntry } from '@/core/storage';
import { toRow, type TableName } from '@/core/tables';
import { newId } from '@/lib/ids';

/** RPC functions the client calls (implemented by the backend migrations). */
export const RPC = {
  /** Furthest-wins upsert of one lesson progress row; returns the merged row. */
  upsertLessonProgress: 'upsert_lesson_progress',
  /** `minutes = greatest(minutes, p_minutes)` for one day of the caller (idempotent). */
  upsertDailyMinutes: 'upsert_daily_minutes',
} as const;

/** Payload of an `rpc` entry. */
export interface RpcPayload {
  fn: string;
  args: Record<string, unknown>;
}

function entry(table: TableName, op: OutboxEntry['op'], payload: unknown, at: string): OutboxEntry {
  return { id: newId(), table, op, payload, enqueuedAt: at, attempts: 0 };
}

/** Lesson progress → RPC arguments of `upsert_lesson_progress`. */
export function lessonProgressArgs(p: LessonProgress): Record<string, unknown> {
  const r = toRow.lessonProgress(p, '');
  return {
    p_lesson_id: r.lesson_id,
    p_lesson_version: r.lesson_version,
    p_current_step: r.current_step,
    p_completed: r.completed,
    p_stars: r.stars,
    p_mistakes: r.mistakes,
    p_hints_used: r.hints_used,
    p_score: r.score,
    p_updated_at: r.updated_at,
    p_completed_at: r.completed_at,
  };
}

/** Builders of outbox entries (one per write). */
export const outbox = {
  profile: (p: Profile, at: string) => entry('profiles', 'upsert', toRow.profile(p), at),
  /** Initial ratings (self-assessment): inserted only if the server has none (`insert` = ignore duplicates). */
  rating: (r: RatingRecord, userId: string, at: string) => entry('ratings', 'insert', toRow.rating(r, userId), at),
  puzzleAttempt: (a: PuzzleAttempt, userId: string, puzzleRd: number, at: string) =>
    entry('puzzle_attempts', 'insert', toRow.puzzleAttempt(a, userId, puzzleRd), at),
  game: (g: Game, userId: string, at: string) => entry('games', 'upsert', toRow.game(g, userId), at),
  gameMove: (e: GameMoveEvent, userId: string, at: string) => entry('game_moves', 'insert', toRow.gameMove(e, userId), at),
  gameAnalysis: (a: GameAnalysis, userId: string, at: string) => entry('game_analyses', 'upsert', toRow.gameAnalysis(a, userId), at),
  lessonProgress: (p: LessonProgress, at: string) =>
    entry('lesson_progress', 'rpc', { fn: RPC.upsertLessonProgress, args: lessonProgressArgs(p) } satisfies RpcPayload, at),
  dailyMinutes: (date: string, minutes: number, at: string) =>
    entry('daily_activity', 'rpc', { fn: RPC.upsertDailyMinutes, args: { p_date: date, p_minutes: minutes } } satisfies RpcPayload, at),
  reviewQueueItem: (i: ReviewQueueItem, userId: string, at: string) =>
    entry('review_queue', 'upsert', toRow.reviewQueueItem(i, userId, at), at),
  explanationFeedback: (f: ExplanationFeedback, userId: string, at: string) =>
    entry('explanation_feedback', 'insert', toRow.explanationFeedback(f, userId), at),
};

/** Type guard for RPC payloads. */
export function isRpcPayload(p: unknown): p is RpcPayload {
  return !!p && typeof p === 'object' && typeof (p as RpcPayload).fn === 'string' && typeof (p as RpcPayload).args === 'object';
}
