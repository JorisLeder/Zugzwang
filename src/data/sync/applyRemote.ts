/**
 * Applies backend changes (full pull or realtime) to the local database – without outbox entries.
 *
 * - Append-only rows (attempts, moves, feedback) are inserted; the server's attempt row (with the server-computed
 *   rating before/after) replaces the local one.
 * - Lesson progress: furthest wins. Profile: settings LWW by `settings.updatedAt`, rest by `updatedAt`. Games:
 *   `mergeGame` (newer wins, finished stays finished, device fields by the newer heartbeat).
 * - Server-computed values (ratings, daily activity, theme stats) replace the provisional local ones – unless local
 *   writes that affect them are still in the outbox; then ratings are kept and counters are merged field-wise (max).
 *   The sync service pulls them again once the outbox is empty. A server rating with fewer rated games than the local
 *   one is an outdated event and ignored.
 */
import type { RemoteChange } from '@/core/storage';
import {
  fromRow,
  type DailyActivityRow,
  type ExplanationFeedbackRow,
  type GameAnalysisRow,
  type GameMoveRow,
  type GameRow,
  type LessonProgressRow,
  type ProfileRow,
  type PuzzleAttemptRow,
  type RatingRow,
  type ReviewQueueRow,
  type TableName,
  type ThemeStatRow,
} from '@/core/tables';
import type { Game } from '@/core/games';
import type { OutboxRow, ZugzwangDb } from '../db';
import { currentProfile, putProfile } from '../dexie/context';
import { maxDay, mergeGame, mergeLessonProgress, mergeProfile } from '../progress';

type Row = Record<string, unknown>;

/** Applies a batch of changes in one transaction. Unknown tables are ignored. */
export async function applyRemoteChanges(db: ZugzwangDb, changes: readonly RemoteChange[]): Promise<void> {
  if (!changes.length) return;
  await db.transaction(
    'rw',
    [
      db.profile,
      db.ratings,
      db.puzzleAttempts,
      db.games,
      db.gameMoves,
      db.gameAnalyses,
      db.lessonProgress,
      db.dailyActivity,
      db.themeStats,
      db.reviewQueue,
      db.explanationFeedback,
      db.outbox,
    ],
    async () => {
      const pending = new Set((await db.outbox.orderBy('table').uniqueKeys()) as TableName[]);
      const goal = (await currentProfile(db))?.dailyGoalMinutes;
      for (const c of changes) {
        if (!c.row || typeof c.row !== 'object') continue;
        if (c.op === 'delete') await applyDelete(db, c.table, c.row as Row);
        else await applyUpsert(db, c.table, c.row as Row, pending, goal);
      }
    },
  );
}

async function applyUpsert(db: ZugzwangDb, table: TableName, row: Row, pending: Set<TableName>, goal: number | undefined): Promise<void> {
  switch (table) {
    case 'profiles': {
      const incoming = fromRow.profile(row as unknown as ProfileRow);
      await putProfile(db, mergeProfile(await currentProfile(db), incoming));
      return;
    }
    case 'ratings': {
      const r = fromRow.rating(row as unknown as RatingRow, false);
      const affectedBy: TableName = r.kind === 'bot' ? 'games' : 'puzzle_attempts';
      if (pending.has(affectedBy) || pending.has('ratings')) return;
      // An older server value (late realtime event) never replaces a newer one.
      const local = await db.ratings.get(r.kind);
      if (local && r.gamesCount < local.gamesCount) return;
      await db.ratings.put(r);
      return;
    }
    case 'puzzle_attempts':
      await db.puzzleAttempts.put(fromRow.puzzleAttempt(row as unknown as PuzzleAttemptRow));
      return;
    case 'games': {
      const incoming = fromRow.game(row as unknown as GameRow);
      await adoptServerCopy(db, incoming);
      await db.games.put(mergeGame(await db.games.get(incoming.id), incoming));
      return;
    }
    case 'game_moves': {
      const e = fromRow.gameMove(row as unknown as GameMoveRow);
      if (await db.gameMoves.get(e.id)) return;
      if (await db.gameMoves.where('[gameId+seq]').equals([e.gameId, e.seq]).first()) return;
      await db.gameMoves.add(e);
      return;
    }
    case 'game_analyses': {
      const a = fromRow.gameAnalysis(row as unknown as GameAnalysisRow);
      const local = await db.gameAnalyses.get(a.gameId);
      if (!local || a.createdAt >= local.createdAt) await db.gameAnalyses.put(a);
      return;
    }
    case 'lesson_progress': {
      const p = fromRow.lessonProgress(row as unknown as LessonProgressRow);
      await db.lessonProgress.put(mergeLessonProgress(await db.lessonProgress.get(p.lessonId), p));
      return;
    }
    case 'daily_activity': {
      const d = fromRow.dailyActivity(row as unknown as DailyActivityRow);
      const local = await db.dailyActivity.get(d.date);
      const busy = pending.has('daily_activity') || pending.has('puzzle_attempts') || pending.has('games') || pending.has('lesson_progress');
      await db.dailyActivity.put(local && busy ? maxDay(local, d, goal) : d);
      return;
    }
    case 'theme_stats': {
      const s = fromRow.themeStat(row as unknown as ThemeStatRow);
      const local = await db.themeStats.get(s.theme);
      const merged =
        local && pending.has('puzzle_attempts')
          ? { theme: s.theme, attempts: Math.max(local.attempts, s.attempts), successes: Math.max(local.successes, s.successes) }
          : s;
      await db.themeStats.put(merged);
      return;
    }
    case 'review_queue':
      await db.reviewQueue.put(fromRow.reviewQueueItem(row as unknown as ReviewQueueRow));
      return;
    case 'explanation_feedback': {
      const f = fromRow.explanationFeedback(row as unknown as ExplanationFeedbackRow);
      if (!(await db.explanationFeedback.get(f.id))) await db.explanationFeedback.add(f);
      return;
    }
    default:
      return;
  }
}

/**
 * The same imported game (`source` + `externalId`, e.g. a PGN) exists locally under another id – it was imported on
 * two devices and the server kept the other copy (unique `games_user_source_external_id_key`). The server copy wins:
 * the local one is deleted together with its moves and its pending outbox entries (they would be rejected by the
 * server for good). A local analysis moves to the server copy unless that already has one.
 */
async function adoptServerCopy(db: ZugzwangDb, server: Game): Promise<void> {
  if (!server.externalId || server.source === 'bot') return;
  const twins = (await db.games.where('[source+externalId]').equals([server.source, server.externalId]).toArray()).filter((g) => g.id !== server.id);
  for (const twin of twins) {
    const refersTo = (e: OutboxRow, key: string) => (e.payload as Row | null)?.[key] === twin.id;
    const outboxOf = (table: TableName, key: string) => db.outbox.where('table').equals(table).filter((e) => refersTo(e, key)).toArray();

    // Pending entries of the local copy: its row and its moves go; its analysis is re-pointed below.
    const gone = [...(await outboxOf('games', 'id')), ...(await outboxOf('game_moves', 'game_id'))];
    await db.outbox.bulkDelete(gone.map((e) => e.seq!));
    await db.gameMoves.where('gameId').equals(twin.id).delete();

    const analysis = await db.gameAnalyses.get(twin.id);
    const analysisEntries = await outboxOf('game_analyses', 'game_id');
    const keep = !!analysis && !(await db.gameAnalyses.get(server.id));
    if (analysis) await db.gameAnalyses.delete(twin.id);
    if (keep) {
      await db.gameAnalyses.put({ ...analysis, gameId: server.id });
      for (const e of analysisEntries) {
        await db.outbox.update(e.seq!, { payload: { ...(e.payload as Row), game_id: server.id }, rev: (e.rev ?? 0) + 1 });
      }
    } else {
      await db.outbox.bulkDelete(analysisEntries.map((e) => e.seq!));
    }
    await db.games.delete(twin.id);
  }
}

async function applyDelete(db: ZugzwangDb, table: TableName, row: Row): Promise<void> {
  const s = (k: string) => (typeof row[k] === 'string' ? (row[k] as string) : undefined);
  switch (table) {
    case 'profiles':
      if (s('id')) await db.profile.delete(s('id')!);
      return;
    case 'ratings':
      if (s('kind')) await db.ratings.delete(s('kind') as never);
      return;
    case 'puzzle_attempts':
      if (s('id')) await db.puzzleAttempts.delete(s('id')!);
      return;
    case 'games':
      if (s('id')) await db.games.delete(s('id')!);
      return;
    case 'game_moves':
      if (s('id')) await db.gameMoves.delete(s('id')!);
      return;
    case 'game_analyses':
      if (s('game_id')) await db.gameAnalyses.delete(s('game_id')!);
      return;
    case 'lesson_progress':
      if (s('lesson_id')) await db.lessonProgress.delete(s('lesson_id')!);
      return;
    case 'daily_activity':
      if (s('date')) await db.dailyActivity.delete(s('date')!);
      return;
    case 'theme_stats':
      if (s('theme')) await db.themeStats.delete(s('theme')!);
      return;
    case 'review_queue':
      if (s('id')) await db.reviewQueue.delete(s('id')!);
      return;
    case 'explanation_feedback':
      if (s('id')) await db.explanationFeedback.delete(s('id')!);
      return;
    default:
      return;
  }
}
