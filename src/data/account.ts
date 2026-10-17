/**
 * AccountService (PRD Datenschutz, DoD "Konto-Export und -Löschung").
 *
 * - Export: all user data as one JSON document (cloud mode: flushes the outbox and pulls first, best effort).
 * - Delete: local mode wipes the local user data (the caller confirms first); cloud mode calls the `delete-account`
 *   edge function, wipes the local copy and signs out. The puzzle bank (static content) is kept.
 */
import type { AccountService } from '@/core/storage';
import type { ZugzwangDb } from './db';
import { META, USER_DATA_TABLES } from './db';
import { currentProfile } from './dexie/context';

/** Identifier and version of the export format. */
export const EXPORT_FORMAT = { format: 'zugzwang-export', version: 1 } as const;

/** Deletes all user data (and the owner marker) from the local database. */
export async function wipeUserData(db: ZugzwangDb): Promise<void> {
  const tables = USER_DATA_TABLES.map((t) => db[t]);
  await db.transaction('rw', [...tables, db.meta], async () => {
    await Promise.all(tables.map((t) => t.clear()));
    await db.meta.bulkDelete([META.ownerId, META.ownerKind, META.lastPullAt]);
  });
}

/** Reads all user data as a plain object (the export document). */
export async function readExport(db: ZugzwangDb, mode: 'local' | 'cloud', at: string): Promise<Record<string, unknown>> {
  return db.transaction('r', USER_DATA_TABLES.map((t) => db[t]), async () => ({
    ...EXPORT_FORMAT,
    exportedAt: at,
    mode,
    profile: await currentProfile(db),
    ratings: await db.ratings.toArray(),
    puzzleAttempts: await db.puzzleAttempts.orderBy('createdAt').toArray(),
    games: await db.games.toArray(),
    gameMoves: await db.gameMoves.toArray(),
    gameAnalyses: await db.gameAnalyses.toArray(),
    lessonProgress: await db.lessonProgress.toArray(),
    dailyActivity: await db.dailyActivity.toArray(),
    themeStats: await db.themeStats.toArray(),
    reviewQueue: await db.reviewQueue.toArray(),
    explanationFeedback: await db.explanationFeedback.toArray(),
  }));
}

/** Dependencies of the account service. */
export interface AccountDeps {
  db: ZugzwangDb;
  mode: 'local' | 'cloud';
  nowIso(): string;
  /** Cloud: push pending entries and pull the server state before exporting. */
  syncBeforeExport?: () => Promise<void>;
  /** Cloud: calls the `delete-account` function (throws on failure). */
  deleteRemote?: () => Promise<void>;
  /** Cloud: signs out after the deletion. */
  signOut?: () => Promise<void>;
  /** Called after the local wipe (e.g. to re-create the local profile). */
  afterWipe?: () => Promise<void>;
}

/** Creates the account service. */
export function createAccountService(deps: AccountDeps): AccountService {
  return {
    async exportData() {
      if (deps.mode === 'cloud' && deps.syncBeforeExport) {
        try {
          await deps.syncBeforeExport();
        } catch (e) {
          console.warn('Export: sync before export failed – exporting the local copy', e);
        }
      }
      const data = await readExport(deps.db, deps.mode, deps.nowIso());
      return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    },

    async deleteAccount() {
      if (deps.mode === 'cloud') {
        if (!deps.deleteRemote) throw new Error('Konto löschen ist nicht verfügbar.');
        await deps.deleteRemote();
      }
      await wipeUserData(deps.db);
      if (deps.mode === 'cloud') await deps.signOut?.();
      await deps.afterWipe?.();
    },
  };
}
