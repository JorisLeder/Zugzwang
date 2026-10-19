/**
 * `SupabaseSyncAdapter` (cloud mode): pushes outbox entries, pulls all rows of the user and subscribes to realtime
 * `postgres_changes` filtered by the owner column.
 *
 * - Append-only tables (+ initial ratings): `upsert(rows, { onConflict, ignoreDuplicates: true })` – rows the server
 *   already has come back as `duplicate` (= success).
 * - Lesson progress and active minutes: RPCs (`upsert_lesson_progress`, `upsert_daily_minutes`) – merged on the server.
 * - Profile: plain upsert in one request; the server's `updated_at` guard (trigger) keeps the newer values – settings
 *   by `settings.updatedAt`, the other fields by `updated_at` (same rule as `mergeProfile`).
 * - Other tables: upsert by primary key (rows for the same key in one batch are collapsed first).
 * - A multi-row request that fails permanently (a constraint violation rejects the whole statement) is re-pushed
 *   key by key, so only the offending entry reports the failure and the others succeed. Retryable failures are not
 *   split (the whole group is retried later).
 * - A `games` row whose `(user_id, source, external_id)` already exists on the server under another id (the same PGN
 *   imported on two devices; unique constraint `games_user_source_external_id_key`) is reported as `duplicate`. The
 *   adapter cannot adopt the server id (the local game and its outbox entries are keyed by the local id), so the next
 *   pull delivers the server row; the local copy stays as it is.
 * - Consecutive entries of the same table/op are pushed in one request, in outbox order. A retryable failure
 *   (network, 5xx, 401, 408, 429) stops the push so later rows (e.g. moves of a new game) never overtake earlier ones.
 */
import type { OutboxEntry, PushResult, RemoteChange } from '@/core/storage';
import { fromRow, toRow, USER_ID_COLUMN, type GameRow, type ProfileRow, type UserTableName } from '@/core/tables';
import { isRpcPayload } from '../outbox';
import { mergeGame, mergeProfile } from '../progress';
import type { DataSyncAdapter } from '../sync/syncService';
import { isUserTable, PRIMARY_KEYS, rowKey, SYNCED_TABLES, withOwner } from '../sync/tables';
import type { SbRealtimePayload, SbResponse, SupabaseProvider } from './types';

/** Options of `createSupabaseSyncAdapter`. */
export interface SupabaseSyncAdapterOptions {
  client: SupabaseProvider;
  /** Logged-in user id, `null` when logged out. */
  userId: () => string | null;
  /** Rows per page when pulling (PostgREST default max is 1000). */
  pageSize?: number;
}

type Row = Record<string, unknown>;

/** Whether a failed response may succeed later. */
export function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

function failure(entries: readonly OutboxEntry[], error: string, retryable: boolean): PushResult[] {
  return entries.map((e) => ({ id: e.id, ok: false, error, retryable }));
}

function fromResponse(entries: readonly OutboxEntry[], res: SbResponse<unknown>): PushResult[] | null {
  if (!res.error) return null;
  return failure(entries, res.error.message || 'Speichern fehlgeschlagen', isRetryableStatus(res.status));
}

const GAMES_EXTERNAL_ID_CONSTRAINT = 'games_user_source_external_id_key';

/** Unique violation of the imported-game identity (same PGN already stored under another game id). */
function isExternalIdConflict(res: SbResponse<unknown>, rows: readonly Row[]): boolean {
  const e = res.error;
  return !!e && (e.code === '23505' || res.status === 409) && e.message.includes(GAMES_EXTERNAL_ID_CONSTRAINT) && rows.every((r) => r.source === 'pgn');
}

/** Groups consecutive entries with the same table and op (RPC entries are pushed one by one). */
export function groupEntries(entries: readonly OutboxEntry[]): OutboxEntry[][] {
  const groups: OutboxEntry[][] = [];
  for (const e of entries) {
    const last = groups.at(-1);
    if (last && e.op !== 'rpc' && last[0]!.op === e.op && last[0]!.table === e.table) last.push(e);
    else groups.push([e]);
  }
  return groups;
}

/** Creates the adapter. */
export function createSupabaseSyncAdapter(opts: SupabaseSyncAdapterOptions): DataSyncAdapter {
  const pageSize = opts.pageSize ?? 1000;

  /** Pushes a group; a permanent failure of a multi-row request is isolated by re-pushing the rows key by key. */
  async function pushGroup(group: OutboxEntry[], uid: string): Promise<PushResult[]> {
    const results = await pushRequest(group, uid);
    if (group.length < 2 || group[0]!.op === 'rpc' || results.every((r) => r.ok || r.retryable !== false)) return results;
    const table = group[0]!.table;
    if (!isUserTable(table)) return results;
    // Rows with the same key stay together (they are merged into one statement row).
    const byKey = new Map<string, OutboxEntry[]>();
    for (const e of group) {
      const k = rowKey(table, withOwner(table, e.payload as Row, uid));
      byKey.set(k, [...(byKey.get(k) ?? []), e]);
    }
    if (byKey.size < 2) return results;
    const split = new Map<string, PushResult>();
    for (const part of byKey.values()) {
      let res: PushResult[];
      try {
        res = await pushRequest(part, uid);
      } catch (e) {
        res = failure(part, e instanceof Error ? e.message : String(e), true);
      }
      for (const r of res) split.set(r.id, r);
      // A retryable failure in between: stop isolating, the rest is retried later (order is kept).
      if (res.some((r) => !r.ok && r.retryable !== false)) {
        for (const e of group) if (!split.has(e.id)) split.set(e.id, { id: e.id, ok: false, retryable: true, error: res.find((r) => !r.ok)?.error });
        break;
      }
    }
    return group.map((e) => split.get(e.id)!);
  }

  async function pushRequest(group: OutboxEntry[], uid: string): Promise<PushResult[]> {
    const client = await opts.client();
    const first = group[0]!;
    const table = first.table;
    if (!isUserTable(table)) return failure(group, `Unbekannte Tabelle ${table}`, false);

    if (first.op === 'rpc') {
      const results: PushResult[] = [];
      for (const e of group) {
        if (!isRpcPayload(e.payload)) {
          results.push({ id: e.id, ok: false, error: 'Ungültiger RPC-Eintrag', retryable: false });
          continue;
        }
        const res = await client.rpc(e.payload.fn, e.payload.args);
        results.push(fromResponse([e], res)?.[0] ?? { id: e.id, ok: true });
      }
      return results;
    }

    const pk = PRIMARY_KEYS[table];
    const rows = group.map((e) => withOwner(table, e.payload as Row, uid));

    if (first.op === 'insert') {
      const seen = new Set<string>();
      const unique: Row[] = [];
      const dupInBatch = new Set<number>();
      rows.forEach((r, i) => {
        const k = rowKey(table, r);
        if (seen.has(k)) dupInBatch.add(i);
        else {
          seen.add(k);
          unique.push(r);
        }
      });
      const res = await client.from(table).upsert(unique, { onConflict: pk.join(','), ignoreDuplicates: true }).select(pk.join(','));
      const failed = fromResponse(group, res);
      if (failed) return failed;
      const inserted = new Set((res.data ?? []).map((r) => rowKey(table, r)));
      return group.map((e, i) => {
        const duplicate = dupInBatch.has(i) || !inserted.has(rowKey(table, rows[i]!));
        return duplicate ? { id: e.id, ok: true, duplicate: true } : { id: e.id, ok: true };
      });
    }

    // upsert: collapse rows with the same key (one statement may not touch a row twice)
    const byKey = new Map<string, Row>();
    for (const r of rows) {
      const k = rowKey(table, r);
      const prev = byKey.get(k);
      if (prev && table === 'games') {
        const merged = mergeGame(fromRow.game(prev as unknown as GameRow), fromRow.game(r as unknown as GameRow));
        byKey.set(k, toRow.game(merged, uid) as unknown as Row);
      } else if (prev && table === 'profiles') {
        const merged = mergeProfile(fromRow.profile(prev as unknown as ProfileRow), fromRow.profile(r as unknown as ProfileRow));
        byKey.set(k, toRow.profile(merged) as unknown as Row);
      } else {
        byKey.set(k, r);
      }
    }
    const upsertRows = [...byKey.values()];
    const res = await client.from(table).upsert(upsertRows, { onConflict: pk.join(',') });
    if (table === 'games' && upsertRows.length === 1 && isExternalIdConflict(res, upsertRows)) {
      return group.map((e) => ({ id: e.id, ok: true, duplicate: true }));
    }
    return fromResponse(group, res) ?? group.map((e) => ({ id: e.id, ok: true }));
  }

  async function pullTables(tables: readonly UserTableName[]): Promise<RemoteChange[]> {
    const uid = opts.userId();
    if (!uid) return [];
    const client = await opts.client();
    // Tables in parallel (one round trip for a full pull), pages of one table in order.
    const perTable = await Promise.all(
      tables.map(async (table) => {
        const changes: RemoteChange[] = [];
        for (let from = 0; ; from += pageSize) {
          const res = await client
            .from(table)
            .select('*')
            .eq(USER_ID_COLUMN[table], uid)
            .order(PRIMARY_KEYS[table].at(-1)!, { ascending: true })
            .range(from, from + pageSize - 1);
          if (res.error) throw new Error(`Laden von ${table} fehlgeschlagen: ${res.error.message}`);
          const rows = res.data ?? [];
          for (const row of rows) changes.push({ table, row, op: 'insert' });
          if (rows.length < pageSize) break;
        }
        return changes;
      }),
    );
    return perTable.flat();
  }

  return {
    kind: 'supabase',

    async push(entries) {
      const uid = opts.userId();
      if (!uid) return failure(entries, 'Nicht angemeldet', true);
      const results = new Map<string, PushResult>();
      let stop: string | null = null;
      for (const group of groupEntries(entries)) {
        if (stop) {
          for (const r of failure(group, stop, true)) results.set(r.id, r);
          continue;
        }
        let res: PushResult[];
        try {
          res = await pushGroup(group, uid);
        } catch (e) {
          res = failure(group, e instanceof Error ? e.message : String(e), true);
        }
        for (const r of res) results.set(r.id, r);
        const retryable = res.find((r) => !r.ok && r.retryable !== false);
        if (retryable) stop = retryable.error ?? 'Speichern fehlgeschlagen';
      }
      return entries.map((e) => results.get(e.id) ?? { id: e.id, ok: false, retryable: true, error: 'Keine Antwort' });
    },

    pullAll: () => pullTables(SYNCED_TABLES),
    pull: (tables) => pullTables(tables),

    subscribe(onChange) {
      let closed = false;
      let cleanup: (() => void) | null = null;
      void (async () => {
        const uid = opts.userId();
        if (!uid) return;
        const client = await opts.client();
        if (closed) return;
        let channel = client.channel(`zugzwang-sync-${uid}`);
        for (const table of SYNCED_TABLES) {
          channel = channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table, filter: `${USER_ID_COLUMN[table]}=eq.${uid}` },
            (p: SbRealtimePayload) => {
              if (!isUserTable(p.table)) return;
              const op = p.eventType === 'INSERT' ? 'insert' : p.eventType === 'UPDATE' ? 'update' : 'delete';
              onChange({ table: p.table, op, row: op === 'delete' ? p.old : p.new });
            },
          );
        }
        channel.subscribe();
        cleanup = () => void client.removeChannel(channel);
      })().catch((e) => console.warn('Sync: realtime subscription failed', e));
      return () => {
        closed = true;
        cleanup?.();
      };
    },
  };
}
