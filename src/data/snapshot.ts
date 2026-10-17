/**
 * Snapshot upload: local mode queues nothing (there is no backend). When a device that was used in local mode logs
 * in to the cloud for the first time, all local progress is queued once, in an order the server can replay:
 * profile, start ratings (from the self-assessment), games before their moves, attempts oldest first, lesson progress,
 * analyses, review items, feedback, active minutes. The server recomputes ratings, daily activity and theme stats
 * from these rows; ids are client UUIDs, so a repeated upload is ignored as duplicates.
 */
import { SELF_ASSESSMENT_OPTIONS } from '@/core/profile';
import { RATING_DEFAULTS, type RatingRecord } from '@/core/rating';
import type { OutboxEntry } from '@/core/storage';
import type { ZugzwangDb } from './db';
import { currentProfile } from './dexie/context';
import { outbox } from './outbox';

/** Outbox entries that upload all local user data for `userId`. */
export async function snapshotEntries(db: ZugzwangDb, userId: string, at: string): Promise<OutboxEntry[]> {
  const entries: OutboxEntry[] = [];
  const profile = await currentProfile(db);
  if (profile) entries.push(outbox.profile({ ...profile, id: userId }, at));

  const option = SELF_ASSESSMENT_OPTIONS.find((o) => o.id === profile?.selfAssessment);
  if (option) {
    for (const [kind, rating] of [
      ['puzzle', option.puzzleRating],
      ['bot', option.botRating],
    ] as const) {
      const start: RatingRecord = {
        kind,
        rating,
        rd: RATING_DEFAULTS.rd,
        volatility: RATING_DEFAULTS.volatility,
        gamesCount: 0,
        updatedAt: profile!.createdAt,
        provisional: false,
      };
      entries.push(outbox.rating(start, userId, at));
    }
  }

  const games = await db.games.toArray();
  games.sort((a, b) => (a.finishedAt ?? a.updatedAt).localeCompare(b.finishedAt ?? b.updatedAt));
  for (const g of games) {
    entries.push(outbox.game(g, userId, at));
    const moves = await db.gameMoves.where('gameId').equals(g.id).sortBy('seq');
    for (const m of moves) entries.push(outbox.gameMove(m, userId, at));
  }

  const attempts = await db.puzzleAttempts.orderBy('createdAt').toArray();
  const puzzleIds = [...new Set(attempts.map((a) => a.puzzleId))];
  const puzzles = new Map((await db.puzzles.bulkGet(puzzleIds)).filter((p) => !!p).map((p) => [p.id, p]));
  for (const a of attempts) {
    entries.push(outbox.puzzleAttempt(a, userId, puzzles.get(a.puzzleId)?.ratingDeviation || RATING_DEFAULTS.puzzleRd, at));
  }

  for (const p of await db.lessonProgress.toArray()) entries.push(outbox.lessonProgress(p, at));
  for (const a of await db.gameAnalyses.toArray()) entries.push(outbox.gameAnalysis(a, userId, at));
  for (const i of await db.reviewQueue.toArray()) entries.push(outbox.reviewQueueItem(i, userId, at));
  for (const f of await db.explanationFeedback.orderBy('createdAt').toArray()) entries.push(outbox.explanationFeedback(f, userId, at));
  for (const d of await db.dailyActivity.toArray()) if (d.minutes > 0) entries.push(outbox.dailyMinutes(d.date, d.minutes, at));
  return entries;
}
