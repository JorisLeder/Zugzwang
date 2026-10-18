/**
 * `games-import` handler with a mocked auth and games table: auth, contract validation, PGN diagnostics with line,
 * the external id (identical to the app's `pgnExternalId`), dedupe (existing row and insert race) and DB failures.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameSource } from '@/core/games';
import { gameImportResponseSchema } from '@/core/schemas';
import type { GameRow } from '@/core/tables';
import { STRINGS_DE as IMPORT_DE } from '@/features/pgn-import/strings.de';
import { normalizedGameText, parsePgnWithDiagnostics, pgnExternalId, pgnWithOwnTags, sha256Hex, type PgnGame } from '@/pgn';
import { FUNCTIONS_DE } from '../_shared/strings.de.ts';
import type { GamesPort } from '../_shared/supabase.ts';
import { createGamesImportHandler, type GamesImportDeps } from './handler';

const FIXTURES = fileURLToPath(new URL('../../../src/pgn/__fixtures__/', import.meta.url));
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const TOKEN = 'jwt-of-alice';
const NOW = new Date('2026-10-18T12:00:00.000Z');

function onlyGame(text: string): PgnGame {
  const r = parsePgnWithDiagnostics(text);
  if (!r.ok || r.games.length !== 1) throw new Error('fixture must hold one game');
  return r.games[0]!;
}

/** In-memory `games` table of one user with the unique key `(user_id, source, external_id)`. */
class FakeGames implements GamesPort {
  rows: GameRow[] = [];
  /** Rows "inserted concurrently" right before the next insert. */
  racing: GameRow[] = [];
  findByExternalId = vi.fn(async (userId: string, source: GameSource, externalId: string) => {
    return this.rows.find((r) => r.user_id === userId && r.source === source && r.external_id === externalId)?.id ?? null;
  });
  insert = vi.fn(async (row: GameRow) => {
    this.rows.push(...this.racing.splice(0));
    if (this.rows.some((r) => r.user_id === row.user_id && r.source === row.source && r.external_id === row.external_id)) return 'duplicate' as const;
    this.rows.push(row);
    return 'inserted' as const;
  });
}

function setup() {
  const table = new FakeGames();
  let n = 0;
  const games = vi.fn((_token: string) => table);
  const userId = vi.fn(async (t: string) => (t === TOKEN ? 'alice' : null));
  const deps: GamesImportDeps = { auth: { userId }, games, newId: () => `00000000-0000-4000-8000-00000000000${(n += 1)}`, now: () => NOW };
  return { deps, table, games, userId };
}

function post(body: unknown, opts: { token?: string | null; raw?: string } = {}): Request {
  const token = opts.token === undefined ? TOKEN : opts.token;
  return new Request('http://localhost/functions/v1/games-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.raw ?? JSON.stringify(body),
  });
}

async function call(deps: GamesImportDeps, req: Request): Promise<{ status: number; body: unknown }> {
  const res = await createGamesImportHandler(deps)(req);
  const body: unknown = await res.json();
  expect(gameImportResponseSchema.safeParse(body).success).toBe(true);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  return { status: res.status, body };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('games-import: HTTP, auth and contract', () => {
  it('answers the CORS preflight and refuses other methods', async () => {
    const { deps } = setup();
    expect((await createGamesImportHandler(deps)(new Request('http://localhost/', { method: 'OPTIONS' }))).status).toBe(204);
    expect(await call(deps, new Request('http://localhost/', { method: 'PUT' }))).toEqual({ status: 405, body: { ok: false, error: FUNCTIONS_DE.methodNotAllowed } });
  });

  it('requires a valid access token', async () => {
    const s = setup();
    const pgn = fixture('01-simple.pgn');
    expect(await call(s.deps, post({ pgn }, { token: null }))).toEqual({ status: 401, body: { ok: false, error: FUNCTIONS_DE.signInRequired } });
    expect(await call(s.deps, post({ pgn }, { token: 'forged' }))).toEqual({ status: 401, body: { ok: false, error: FUNCTIONS_DE.signInRequired } });
    expect(s.games).not.toHaveBeenCalled();
  });

  it.each([
    ['no JSON', undefined, '{"pgn":'],
    ['neither pgn nor source', {}, undefined],
    ['empty pgn', { pgn: '' }, undefined],
    ['source without externalId', { source: 'lichess' }, undefined],
    ['unknown source', { source: 'icc', externalId: 'x' }, undefined],
  ])('rejects an invalid request (%s) with 400', async (_name, body, raw) => {
    const s = setup();
    expect(await call(s.deps, post(body, raw !== undefined ? { raw } : {}))).toEqual({ status: 400, body: { ok: false, error: FUNCTIONS_DE.invalidRequest } });
    expect(s.games).not.toHaveBeenCalled();
  });

  it('rejects a PGN over 1 000 000 characters with 413', async () => {
    const s = setup();
    expect(await call(s.deps, post({ pgn: `1. e4 e5 ${' '.repeat(1_000_000)}*` }))).toEqual({ status: 413, body: { ok: false, error: FUNCTIONS_DE.tooLarge } });
  });

  it('answers 501 for an import by external id (V2)', async () => {
    const s = setup();
    expect(await call(s.deps, post({ source: 'chesscom', externalId: '123456' }))).toEqual({ status: 501, body: { ok: false, error: FUNCTIONS_DE.externalImportNotSupported } });
  });
});

describe('games-import: PGN rules', () => {
  it('returns the parser message and its line; the app shows exactly the parser text', async () => {
    const s = setup();
    const pgn = '[Event "Test"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6\n3. Bb5 Nf9 *\n';
    const parsed = parsePgnWithDiagnostics(pgn);
    if (parsed.ok) throw new Error('expected a parse error');
    const res = await call(s.deps, post({ pgn }));
    expect(res.status).toBe(422);
    const body = res.body as { ok: false; error: string; line: number };
    expect(body.line).toBe(5);
    expect(body.error).toMatch(/^Ungültiger Zug „Nf9“ \(Zug 3, Schwarz\)/);
    // `importPgnGame` shows `lineError(line) + error`.
    expect(`${IMPORT_DE.lineError(body.line)}${body.error}`).toBe(parsed.error.messageDe);
    expect(s.table.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['an illegal castling through check', '[FEN "r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1"]\n[SetUp "1"]\n\n1. O-O *'],
    ['a move after mate', '1. f3 e5 2. g4 Qh4# 3. a3 0-1'],
    ['an en passant capture without the two-square advance', '[FEN "4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1"]\n[SetUp "1"]\n\n1. exd6 *'],
    ['a promotion without piece', '[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n[SetUp "1"]\n\n1. a8 *'],
  ])('refuses %s (rules layer)', async (_name, pgn) => {
    const s = setup();
    const res = await call(s.deps, post({ pgn }));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, line: expect.any(Number) });
  });

  it('refuses a text with several games', async () => {
    const s = setup();
    const res = await call(s.deps, post({ pgn: fixture('12-multi-game.pgn') }));
    expect(res).toMatchObject({ status: 422, body: { ok: false } });
    expect((res.body as { error: string }).error).toMatch(/^Die PGN enthält \d+ Partien\./);
    expect(s.table.insert).not.toHaveBeenCalled();
  });
});

describe('games-import: storing and dedupe', () => {
  it('stores the game row of the caller with the external id the app computes', async () => {
    const s = setup();
    const raw = fixture('02-comments.pgn');
    const clientGame = onlyGame(raw);
    // The app sends its parsed game with exactly the game's own tags (`importPgnGame`).
    expect(await call(s.deps, post({ pgn: pgnWithOwnTags(clientGame) }))).toEqual({ status: 201, body: { ok: true, gameId: '00000000-0000-4000-8000-000000000001', duplicate: false } });
    expect(s.games).toHaveBeenCalledWith(TOKEN);
    const row = s.table.rows[0]!;
    expect(row).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      user_id: 'alice',
      source: 'pgn',
      external_id: pgnExternalId(clientGame),
      bot_id: null,
      user_color: null,
      status: 'finished',
      result: '0-1',
      start_fen: clientGame.startFen,
      pgn: clientGame.pgn,
      headers: clientGame.headers,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      finished_at: NOW.toISOString(),
      rating_before: null,
      rating_after: null,
    });
    expect(row.external_id).toBe(sha256Hex(normalizedGameText(clientGame)));
  });

  it('recognises the same game with other comments, variations and line breaks as a duplicate', async () => {
    const s = setup();
    const first = await call(s.deps, post({ pgn: fixture('02-comments.pgn') }));
    expect(first).toMatchObject({ status: 201, body: { duplicate: false } });
    const clean = pgnWithOwnTags(onlyGame(fixture('02-comments.pgn')));
    const second = await call(s.deps, post({ pgn: clean.replace(/(\d+)\. /g, '$1.\n').replace('Nf6', 'Nf6 {Kommentar} (4... d6 5. d4)') }));
    expect(second).toEqual({ status: 200, body: { ok: true, gameId: (first.body as { gameId: string }).gameId, duplicate: true } });
    expect(s.table.insert).toHaveBeenCalledTimes(1);
    expect(s.table.rows).toHaveLength(1);
  });

  it('answers a concurrent insert of the same game (unique key) as a duplicate of the stored row', async () => {
    const s = setup();
    const game = onlyGame(fixture('01-simple.pgn'));
    s.table.racing.push({ id: 'other-device-id', user_id: 'alice', source: 'pgn', external_id: pgnExternalId(game) } as GameRow);
    expect(await call(s.deps, post({ pgn: pgnWithOwnTags(game) }))).toEqual({ status: 200, body: { ok: true, gameId: 'other-device-id', duplicate: true } });
  });

  it('answers 500 (the app then stores locally) when the database fails', async () => {
    const s = setup();
    s.table.findByExternalId.mockRejectedValueOnce(new Error('connection refused'));
    expect(await call(s.deps, post({ pgn: fixture('01-simple.pgn') }))).toEqual({ status: 500, body: { ok: false, error: FUNCTIONS_DE.importFailed } });
    s.table.insert.mockResolvedValueOnce('duplicate');
    s.table.findByExternalId.mockResolvedValue(null);
    expect(await call(s.deps, post({ pgn: fixture('01-simple.pgn') }))).toEqual({ status: 500, body: { ok: false, error: FUNCTIONS_DE.importFailed } });
  });

  it('computes the app external id for every single-game fixture (sent as the app sends it, and as the raw text)', async () => {
    const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.pgn'));
    let checked = 0;
    for (const name of names) {
      const parsed = parsePgnWithDiagnostics(fixture(name));
      if (!parsed.ok || parsed.games.length !== 1) continue;
      const game = parsed.games[0]!;
      const s = setup();
      expect(await call(s.deps, post({ pgn: pgnWithOwnTags(game) })), name).toMatchObject({ status: 201 });
      expect(s.table.rows[0]!.external_id, name).toBe(pgnExternalId(game));
      expect(s.table.rows[0]!.start_fen, name).toBe(game.startFen);
      expect(s.table.rows[0]!.pgn, name).toBe(game.pgn);
      // The raw file is the same game.
      expect(await call(s.deps, post({ pgn: fixture(name) })), name).toMatchObject({ status: 200, body: { duplicate: true } });
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });
});
