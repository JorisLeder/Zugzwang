/**
 * `games-import` edge function (`POST /games/import`, PRD P0-15, P2-01/P2-02): stores one PGN game of the caller.
 *
 * Flow: CORS/POST → caller from the bearer token (401) → body checked with `gameImportRequestSchema` (400) →
 * `source` + `externalId` without PGN is V2 (501; the app then stores the game locally) → PGN parsed with the app's
 * parser (`parsePgnWithDiagnostics`, every move through the FIDE rules layer; 422 with the German message and its
 * line) → exactly one game → the row of `importedGameRecord` (source `pgn`, `external_id = sha256(normalizedGameText)`
 * – the same id the app computes) → an existing game of the caller with that id is answered with `duplicate: true`,
 * otherwise the row is inserted with the caller's JWT (RLS); a concurrent insert of the same game hits the unique key
 * and is a duplicate too. Answers follow `gameImportResponseSchema`.
 */
import type { GameImportRequest, GameImportResponse } from '@/core/games';
import { gameImportRequestSchema } from '@/core/schemas';
import { toRow } from '@/core/tables';
import { importedGameRecord, parsePgnWithDiagnostics, PGN_DE, PGN_LIMITS } from '@/pgn';
import { bearerToken, jsonResponse, postHandler, readJsonBody, type RequestHandler } from '../_shared/http.ts';
import { FUNCTIONS_DE } from '../_shared/strings.de.ts';
import type { AuthPort, GamesPort } from '../_shared/supabase.ts';

/** Largest accepted request body (characters): a PGN of `PGN_LIMITS.maxChars` plus JSON escapes. */
export const MAX_BODY_CHARS = PGN_LIMITS.maxChars * 2 + 1_000;

/** Dependencies (`index.ts` wires the real ones; tests pass fakes). */
export interface GamesImportDeps {
  auth: AuthPort;
  /** The caller's games through a client with the caller's token (RLS). */
  games(token: string): GamesPort;
  newId(): string;
  now(): Date;
}

const answer = (body: GameImportResponse, status: number) => jsonResponse(body, status);
const error = (message: string, status: number, line?: number) =>
  answer({ ok: false, error: message, ...(line !== undefined ? { line } : {}) }, status);

/** The parser's message without its "Zeile N: " prefix (the app adds it from `line`). */
export function withoutLinePrefix(message: string, line: number): string {
  const prefix = PGN_DE.at(line);
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

/** Creates the request handler. */
export function createGamesImportHandler(deps: GamesImportDeps): RequestHandler {
  return postHandler(
    'games-import',
    { methodNotAllowed: { ok: false, error: FUNCTIONS_DE.methodNotAllowed }, internalError: { ok: false, error: FUNCTIONS_DE.importFailed } },
    async (req) => {
      const token = bearerToken(req);
      const userId = token ? await deps.auth.userId(token) : null;
      if (!token || !userId) return error(FUNCTIONS_DE.signInRequired, 401);

      const body = await readJsonBody(req, MAX_BODY_CHARS);
      if (!body.ok) return body.reason === 'too_large' ? error(FUNCTIONS_DE.tooLarge, 413) : error(FUNCTIONS_DE.invalidRequest, 400);
      const parsed = gameImportRequestSchema.safeParse(body.value);
      if (!parsed.success) {
        const tooLong = parsed.error.issues.some((i) => i.code === 'too_big' && i.path[0] === 'pgn');
        return tooLong ? error(FUNCTIONS_DE.tooLarge, 413) : error(FUNCTIONS_DE.invalidRequest, 400);
      }
      const request: GameImportRequest = parsed.data;
      if (request.pgn === undefined) return error(FUNCTIONS_DE.externalImportNotSupported, 501);

      const result = parsePgnWithDiagnostics(request.pgn);
      if (!result.ok) return error(withoutLinePrefix(result.error.messageDe, result.error.line), 422, result.error.line);
      if (result.games.length !== 1) return error(FUNCTIONS_DE.oneGameOnly(result.games.length), 422);
      const game = result.games[0]!;

      const now = deps.now().toISOString();
      const record = importedGameRecord(game, now);
      const externalId = record.externalId!;
      const games = deps.games(token);
      const existing = await games.findByExternalId(userId, record.source, externalId);
      if (existing) return answer({ ok: true, gameId: existing, duplicate: true }, 200);

      const id = deps.newId();
      const inserted = await games.insert(toRow.game({ ...record, id, createdAt: now, updatedAt: now }, userId));
      if (inserted === 'inserted') return answer({ ok: true, gameId: id, duplicate: false }, 201);
      const winner = await games.findByExternalId(userId, record.source, externalId);
      if (!winner) throw new Error('games-import: unique violation without a visible row');
      return answer({ ok: true, gameId: winner, duplicate: true }, 200);
    },
  );
}
