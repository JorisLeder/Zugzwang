/**
 * `@/pgn` – PGN import (WP-05, PRD P0-15, P2-01/P2-02).
 *
 * - `parsePgnWithDiagnostics(text)` → `{ ok: true, games }` or `{ ok: false, error: { line, column, messageDe } }`.
 * - `pgnExternalId(game)` – SHA-256 of the normalised tags + movetext (duplicate detection, `games.external_id`).
 * - `pgnWithOwnTags(game)` – the game's PGN with exactly its own tags (sent to `games-import`; same external id).
 * - `importedGameRecord(game, now)` – the `Game` row for `progress.createGame` (local mode).
 * Domain logic only – the `/analysis/import` page lives in `src/features/pgn-import`.
 */
export { parsePgnWithDiagnostics, PGN_LIMITS, type PgnDiagnostic, type PgnGame, type PgnParseResult } from './parser';
export { importedGameRecord, normalizedGameText, pgnExternalId, pgnWithOwnTags, SEVEN_TAG_ROSTER } from './normalize';
export { sha256Hex } from './sha256';
export { normalizePgnText, tokenizePgn, type PgnPosition, type PgnToken, type PgnTokenizeResult } from './tokenizer';
export { PGN_DE } from './strings.de';
