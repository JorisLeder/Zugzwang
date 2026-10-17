/**
 * Saving an imported PGN game (P0-15, P2-01): source `pgn`, `externalId = sha256(normalised tags + movetext)`.
 * A game whose external id exists already is not stored again – its id is returned with `duplicate: true`.
 *
 * - Local mode: `progress.createGame(importedGameRecord(game))`.
 * - Cloud mode: `POST {supabaseUrl}/functions/v1/games-import` (contract `GameImportRequest/Response`, WP-11) with the
 *   user's access token; the server computes the same external id. When the function cannot be reached (offline,
 *   network error) the game is stored locally and reaches the backend through the outbox.
 */
import type { GameImportRequest, GameImportResponse } from '@/core/games';
import { gameImportResponseSchema } from '@/core/schemas';
import type { AppServices } from '@/core/services';
import { importedGameRecord, pgnExternalId, type PgnGame } from '@/pgn';
import { STRINGS_DE } from './strings.de';

/** Outcome of an import. */
export type ImportOutcome = { ok: true; gameId: string; duplicate: boolean } | { ok: false; errorDe: string };

/** Timeout of the `games-import` request. */
export const IMPORT_TIMEOUT_MS = 15_000;


/** Options (tests inject `fetchFn`, `now`, `isOnline`). */
export interface ImportOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
  isOnline?: () => boolean;
}

function online(): boolean {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
}

/** URL of the `games-import` edge function (cloud mode only). */
export function gamesImportUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/games-import`;
}

async function importLocally(services: AppServices, game: PgnGame, now: Date): Promise<ImportOutcome> {
  const record = importedGameRecord(game, now.toISOString());
  const existing = await services.data.repos.games.findByExternalId('pgn', record.externalId!);
  if (existing) return { ok: true, gameId: existing.id, duplicate: true };
  const created = await services.data.progress.createGame(record);
  return { ok: true, gameId: created.id, duplicate: false };
}

type CloudResult = { kind: 'done'; outcome: ImportOutcome } | { kind: 'unreachable' };

async function importViaFunction(services: AppServices, game: PgnGame, fetchFn: typeof fetch): Promise<CloudResult> {
  const { config, data } = services;
  const token = await data.auth.accessToken().catch(() => null);
  if (!config.supabaseUrl || !token) return { kind: 'unreachable' };
  const body: GameImportRequest = { pgn: game.pgn };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchFn(gamesImportUrl(config.supabaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(config.supabaseAnonKey ? { apikey: config.supabaseAnonKey } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    return { kind: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
  if (res.status >= 500 || res.status === 404) return { kind: 'unreachable' };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { kind: 'done', outcome: { ok: false, errorDe: STRINGS_DE.importFailed } };
  }
  const parsed = gameImportResponseSchema.safeParse(json);
  if (!parsed.success) return { kind: 'done', outcome: { ok: false, errorDe: STRINGS_DE.importFailed } };
  const r: GameImportResponse = parsed.data;
  if (r.ok) return { kind: 'done', outcome: { ok: true, gameId: r.gameId, duplicate: r.duplicate } };
  return { kind: 'done', outcome: { ok: false, errorDe: r.line ? `${STRINGS_DE.lineError(r.line)}${r.error}` : r.error } };
}

/** Stores one parsed game (see the file header). Never throws. */
export async function importPgnGame(services: AppServices, game: PgnGame, opts: ImportOptions = {}): Promise<ImportOutcome> {
  const now = opts.now ?? (() => new Date());
  try {
    // A game imported before on this device opens without a request.
    const existing = await services.data.repos.games.findByExternalId('pgn', pgnExternalId(game));
    if (existing) return { ok: true, gameId: existing.id, duplicate: true };
    if (services.config.mode === 'cloud' && (opts.isOnline ?? online)()) {
      const fetchFn = opts.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
      const cloud = await importViaFunction(services, game, fetchFn);
      if (cloud.kind === 'done') return cloud.outcome;
    }
    return await importLocally(services, game, now());
  } catch (e) {
    console.warn('PGN import failed', e);
    return { ok: false, errorDe: STRINGS_DE.importFailed };
  }
}

/** Short description of a parsed game for the selection list: "Anna – Ben · 1-0 · 34 Züge · 12.03.2025". */
export function gameSummary(game: PgnGame): { title: string; meta: string } {
  const name = (tag: string, fallback: string) => {
    const v = game.headers[tag]?.trim();
    return v && v !== '?' ? v : fallback;
  };
  const title = `${name('White', STRINGS_DE.white)} – ${name('Black', STRINGS_DE.black)}`;
  const date = game.headers.Date?.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  const parts = [
    STRINGS_DE.resultText(game.result),
    STRINGS_DE.moveCount(Math.ceil(game.moves.length / 2)),
    ...(date ? [`${date[3]}.${date[2]}.${date[1]}`] : []),
    ...(game.headers.Event && game.headers.Event !== '?' ? [game.headers.Event] : []),
  ];
  return { title, meta: parts.join(' · ') };
}
