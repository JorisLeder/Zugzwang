/** Sync metadata per user table: primary keys, owner column, synced tables. */
import { USER_ID_COLUMN, USER_TABLES, type UserTableName } from '@/core/tables';

/** Primary key columns per user table (`@/core/tables`). */
export const PRIMARY_KEYS: Record<UserTableName, readonly string[]> = {
  profiles: ['id'],
  ratings: ['user_id', 'kind'],
  puzzle_attempts: ['id'],
  review_queue: ['id'],
  games: ['id'],
  game_moves: ['id'],
  game_analyses: ['game_id'],
  lesson_progress: ['user_id', 'lesson_id'],
  daily_activity: ['user_id', 'date'],
  theme_stats: ['user_id', 'theme'],
  explanation_usage: ['user_id', 'date'],
  explanation_feedback: ['id'],
};

/** Tables mirrored into the local database (`explanation_usage` is server-only, written by the explain function). */
export const SYNCED_TABLES: readonly UserTableName[] = USER_TABLES.filter((t) => t !== 'explanation_usage');

/** Tables whose values the server computes (ratings, streak basis, weakness profile). */
export const DERIVED_TABLES: readonly UserTableName[] = ['ratings', 'daily_activity', 'theme_stats'];

/** Whether `t` is a user table. */
export function isUserTable(t: string): t is UserTableName {
  return (USER_TABLES as readonly string[]).includes(t);
}

/** Stable key of a row from its primary key columns. */
export function rowKey(table: UserTableName, row: Record<string, unknown>): string {
  return PRIMARY_KEYS[table].map((c) => String(row[c])).join('|');
}

/** Copy of `row` owned by `userId` (owner column overwritten). */
export function withOwner(table: UserTableName, row: Record<string, unknown>, userId: string): Record<string, unknown> {
  return { ...row, [USER_ID_COLUMN[table]]: userId };
}
