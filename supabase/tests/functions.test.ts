/**
 * Edge-function handlers against the real schema (PGlite with all migrations): `games-import` with a games port that
 * runs as the calling user (RLS, unique key, insert trigger) and `delete-account` with an admin port that runs as the
 * service role – the SQL a deployment executes, without supabase-js and PostgREST in between.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USER_ID_COLUMN, USER_TABLES, type GameRow } from '@/core/tables';
import { PRIMARY_KEYS } from '@/data/sync/tables';
import { parsePgnWithDiagnostics, pgnExternalId, pgnWithOwnTags } from '@/pgn';
import { createTestDb, rpc, upsert, type TestDb } from '../../scripts/supabase/testDb';
import { sampleRow } from '../../scripts/supabase/testRows';
import { createDeleteAccountHandler } from '../functions/delete-account/handler';
import { createGamesImportHandler } from '../functions/games-import/handler';
import { UNIQUE_VIOLATION, type AccountAdminPort, type AuthPort, type GamesPort } from '../functions/_shared/supabase';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

/** Tokens are the user ids here; the real port asks the Auth server. */
const auth: AuthPort = { userId: async (token) => (token.startsWith('valid:') ? token.slice(6) : null) };

/** `GamesPort` running every statement as the token's user (like supabase-js with the caller's JWT). */
function pgGames(token: string): GamesPort {
  const uid = token.slice(6);
  return {
    findByExternalId: (userId, source, externalId) =>
      db.asUser(uid, async (tx) => {
        const r = await tx.query<{ id: string }>('select id from public.games where user_id = $1 and source = $2 and external_id = $3', [userId, source, externalId]);
        return r.rows[0]?.id ?? null;
      }),
    insert: async (row: GameRow) => {
      try {
        await db.asUser(uid, (tx) => upsert(tx, 'games', [row]));
        return 'inserted';
      } catch (e) {
        if ((e as { code?: string }).code === UNIQUE_VIOLATION) return 'duplicate';
        throw e;
      }
    },
  };
}

const PGN = '[Event "Vereinsabend"]\n[White "Anna"]\n[Black "Ben"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0\n';

function importHandler(insertAs?: (token: string) => GamesPort) {
  return createGamesImportHandler({ auth, games: insertAs ?? pgGames, newId: randomUUID, now: () => new Date('2026-10-18T12:00:00.000Z') });
}

const post = (url: string, token: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('games-import on the real schema', () => {
  it('stores the game for the caller (RLS), recognises the duplicate and keeps users apart', async () => {
    const [alice, bob] = [await db.createUser(), await db.createUser()];
    const parsed = parsePgnWithDiagnostics(PGN);
    if (!parsed.ok) throw new Error(parsed.error.messageDe);
    const game = parsed.games[0]!;
    const handler = importHandler();
    const body = { pgn: pgnWithOwnTags(game) };

    const first = await handler(post('http://localhost/games-import', `valid:${alice}`, body));
    expect(first.status).toBe(201);
    const created = (await first.json()) as { ok: true; gameId: string; duplicate: boolean };
    expect(created).toMatchObject({ ok: true, duplicate: false });
    const rows = await db.rows<{ user_id: string; source: string; external_id: string; status: string; result: string; end_reason: string | null; rating_after: number | null }>(
      'select user_id, source, external_id, status, result, end_reason, rating_after from public.games where id = $1',
      [created.gameId],
    );
    expect(rows).toEqual([{ user_id: alice, source: 'pgn', external_id: pgnExternalId(game), status: 'finished', result: '1-0', end_reason: 'checkmate', rating_after: null }]);

    const again = await handler(post('http://localhost/games-import', `valid:${alice}`, { pgn: PGN.replace('3. Qh5', '3. Qh5?! {Schäfermatt-Versuch}') }));
    expect(await again.json()).toEqual({ ok: true, gameId: created.gameId, duplicate: true });

    // Another user imports the same game as their own row.
    const other = await handler(post('http://localhost/games-import', `valid:${bob}`, body));
    expect(other.status).toBe(201);
    expect(await db.rows('select id from public.games where external_id = $1', [pgnExternalId(game)])).toHaveLength(2);
  });

  it('turns a concurrent insert of the same game into a duplicate via the unique key', async () => {
    const alice = await db.createUser();
    const parsed = parsePgnWithDiagnostics(PGN);
    if (!parsed.ok) throw new Error(parsed.error.messageDe);
    const winner = randomUUID();
    // The other request wins the race between our lookup and our insert.
    const racing = (token: string): GamesPort => {
      const real = pgGames(token);
      return {
        findByExternalId: real.findByExternalId,
        insert: async (row) => {
          await db.asUser(alice, (tx) => upsert(tx, 'games', [{ ...row, id: winner }]));
          return real.insert(row);
        },
      };
    };
    const res = await importHandler(racing)(post('http://localhost/games-import', `valid:${alice}`, { pgn: PGN }));
    expect(await res.json()).toEqual({ ok: true, gameId: winner, duplicate: true });
    expect(await db.rows('select id from public.games where user_id = $1', [alice])).toEqual([{ id: winner }]);
  });

  it('cannot write a row for another user: RLS rejects it and the answer is a 500', async () => {
    const [alice, mallory] = [await db.createUser(), await db.createUser()];
    const res = await importHandler(() => pgGames(`valid:${mallory}`))(post('http://localhost/games-import', `valid:${alice}`, { pgn: PGN }));
    expect(res.status).toBe(500);
    expect(await db.rows('select id from public.games where user_id in ($1, $2)', [alice, mallory])).toEqual([]);
  });
});

describe('delete-account on the real schema', () => {
  const admin: AccountAdminPort = {
    deleteUserData: async (userId) =>
      (await db.as('service_role', null, (tx) => rpc<{ delete_user_data: number }>(tx, 'delete_user_data', { p_user_id: userId })))[0]!.delete_user_data,
    deleteAuthUser: async (userId) => {
      await db.pg.query('delete from auth.users where id = $1', [userId]);
    },
  };

  async function fill(uid: string) {
    const gameId = randomUUID();
    for (const table of USER_TABLES) {
      await upsert(db.pg, table, [sampleRow(table, { owner: uid, gameId })], { onConflict: PRIMARY_KEYS[table].join(','), ignoreDuplicates: true });
    }
  }
  async function remaining(uid: string) {
    let n = 0;
    for (const table of USER_TABLES) {
      n += (await db.rows<{ n: number }>(`select count(*)::int as n from public."${table}" where "${USER_ID_COLUMN[table]}" = $1`, [uid]))[0]!.n;
    }
    return n;
  }

  it('deletes every row and the auth user of the caller only', async () => {
    const [alice, bob] = [await db.createUser(), await db.createUser()];
    await fill(alice);
    await fill(bob);
    const bobRows = await remaining(bob);
    const handler = createDeleteAccountHandler({ auth, admin });
    const res = await handler(post('http://localhost/delete-account', `valid:${alice}`, { userId: bob }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; deletedRows: number };
    expect(body.deletedRows).toBeGreaterThanOrEqual(USER_TABLES.length);
    expect(await remaining(alice)).toBe(0);
    expect(await db.rows('select id from auth.users where id = $1', [alice])).toEqual([]);
    expect(await remaining(bob)).toBe(bobRows);
    expect(await db.rows('select id from auth.users where id = $1', [bob])).toHaveLength(1);
  });
});
