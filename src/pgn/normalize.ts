/**
 * Identity of an imported game (P0-15, P2-01): `externalId = sha256(normalised tags + movetext)`, so the same game
 * imported twice – with other comments, NAGs, variations, line breaks or tag spacing – is recognised as a duplicate.
 *
 * Normal form (WP-11's `games-import` must produce the same string to agree on ids):
 * ```
 * [Event "…"]            one line per present Seven Tag Roster tag, in the order Event Site Date Round White Black
 * …                      Result; values trimmed with inner whitespace collapsed; Result = the parsed result
 * [FEN "<start FEN>"]    only for a non-standard start (normalised FEN)
 *                        (empty line)
 * e4 e5 Nf3 … 1-0        main line in English SAN (as chess.js writes it), then the result
 * ```
 */
import { START_FEN, type GameEndReason } from '@/core/chess';
import type { Game } from '@/core/games';
import type { PgnGame } from './parser';
import { sha256Hex } from './sha256';

/** Seven Tag Roster in PGN order. */
export const SEVEN_TAG_ROSTER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'] as const;

const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

/** The normal form of a game used for its external id (see the file header). */
export function normalizedGameText(game: Pick<PgnGame, 'headers' | 'startFen' | 'moves' | 'result'>): string {
  const tags: string[] = [];
  for (const name of SEVEN_TAG_ROSTER) {
    const value = name === 'Result' ? game.result : game.headers[name];
    if (value !== undefined) tags.push(`[${name} "${clean(value)}"]`);
  }
  if (game.startFen !== START_FEN) tags.push(`[FEN "${game.startFen}"]`);
  const movetext = [...game.moves.map((m) => m.san), game.result].join(' ');
  return `${tags.join('\n')}\n\n${movetext}`;
}

const escapeTagValue = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Movetext of the main line with move numbers ("1. e4 e5 2. Nf3", "12... Kg7 13. Qd2") and the result. */
function movetext(game: Pick<PgnGame, 'startFen' | 'moves' | 'result'>): string {
  const fields = game.startFen.split(' ');
  let moveNumber = Number(fields[5]) || 1;
  let white = fields[1] !== 'b';
  const out: string[] = [];
  game.moves.forEach((m, i) => {
    out.push(white ? `${moveNumber}. ${m.san}` : i === 0 ? `${moveNumber}... ${m.san}` : m.san);
    if (!white) moveNumber += 1;
    white = !white;
  });
  out.push(game.result);
  return out.join(' ');
}

/**
 * PGN of a parsed game with exactly its own tag pairs and its main line – the text the app sends to `games-import`.
 * `game.pgn` cannot be used for that: its writer adds Seven Tag Roster placeholders (`[Site "?"]`, …) the original
 * did not have, so parsing it again would give another `normalizedGameText`. Parsing this text gives the same one.
 */
export function pgnWithOwnTags(game: Pick<PgnGame, 'headers' | 'startFen' | 'moves' | 'result'>): string {
  const tags = Object.entries(game.headers)
    .filter(([name]) => name !== 'FEN' && name !== 'SetUp')
    .map(([name, value]) => `[${name} "${escapeTagValue(value)}"]`);
  if (game.startFen !== START_FEN) tags.push('[SetUp "1"]', `[FEN "${game.startFen}"]`);
  return tags.length > 0 ? `${tags.join('\n')}\n\n${movetext(game)}\n` : `${movetext(game)}\n`;
}

/** External id of an imported game: lowercase hex SHA-256 of `normalizedGameText`. */
export function pgnExternalId(game: Pick<PgnGame, 'headers' | 'startFen' | 'moves' | 'result'>): string {
  return sha256Hex(normalizedGameText(game));
}

const AUTOMATIC_ENDS: ReadonlySet<GameEndReason> = new Set([
  'checkmate',
  'stalemate',
  'insufficient_material',
  'fivefold_repetition',
  'seventyfive_moves',
]);

/**
 * The `Game` row for an imported PGN game (local mode: `progress.createGame`): source `pgn`, external id, status
 * `finished`, no bot, unknown user colour. The end reason is set only when the final position ends the game by rule
 * (checkmate, stalemate, …); a resignation or a draw agreement cannot be read from a PGN.
 */
export function importedGameRecord(game: PgnGame, nowIso: string): Omit<Game, 'id' | 'createdAt' | 'updatedAt'> {
  const reason = game.status.reason;
  return {
    source: 'pgn',
    externalId: pgnExternalId(game),
    botId: null,
    userColor: null,
    assistance: null,
    timeControl: { kind: 'none' },
    startFen: game.startFen,
    pgn: game.pgn,
    headers: { ...game.headers },
    status: 'finished',
    result: game.result,
    endReason: reason && AUTOMATIC_ENDS.has(reason) ? reason : null,
    origin: game.startFen === START_FEN ? { type: 'new' } : { type: 'fen' },
    activeDeviceId: null,
    activeHeartbeatAt: null,
    ratingBefore: null,
    ratingAfter: null,
    finishedAt: nowIso,
  };
}
