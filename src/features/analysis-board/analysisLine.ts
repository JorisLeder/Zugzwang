/**
 * Pure state of the Analysebrett: one line of moves from a start position plus the shown ply, loading from FEN/PGN
 * (German errors) and export. Rules only via `@/lib/chess`.
 */
import { START_FEN, type Fen, type Notation, type Uci } from '@/core/chess';
import type { EngineLine } from '@/core/engine';
import { ChessGame, ChessRulesError, formatSan, uciLineToSan, validateFen } from '@/lib/chess';
import { STRINGS_DE } from './strings.de';

/** The analysed line: moves from `startFen`, `ply` = shown position (0 = start). */
export interface AnalysisLine {
  startFen: Fen;
  moves: Uci[];
  ply: number;
}

/** A loaded position/game, or a German error. */
export type LoadResult = { ok: true; startFen: Fen; moves: Uci[] } | { ok: false; errorDe: string };

/** New line at the end of `moves`. */
export function newLine(startFen: Fen, moves: Uci[] = []): AnalysisLine {
  return { startFen, moves, ply: moves.length };
}

/** The whole line as a game (repetition history kept). */
export function lineGame(line: AnalysisLine): ChessGame {
  return ChessGame.fromMoves(line.startFen, line.moves);
}

/** The shown position as a game (moves up to `ply`). */
export function shownGame(line: AnalysisLine): ChessGame {
  return ChessGame.fromMoves(line.startFen, line.moves.slice(0, line.ply));
}

/** How many later moves playing `uci` at the shown ply would delete (0 = none: at the end or the same move). */
export function movesToReplace(line: AnalysisLine, uci: Uci): number {
  if (line.ply >= line.moves.length || line.moves[line.ply] === uci) return 0;
  return line.moves.length - line.ply;
}

/** Plays `uci` at the shown ply: the same next move just steps forward, another move replaces the later moves. */
export function playAt(line: AnalysisLine, uci: Uci): AnalysisLine {
  if (line.moves[line.ply] === uci) return { ...line, ply: line.ply + 1 };
  const moves = [...line.moves.slice(0, line.ply), uci];
  return { ...line, moves, ply: moves.length };
}

const FEN_PLACEMENT = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}$/;

/** Whether the text looks like a FEN (placement field with 8 ranks) rather than a PGN. */
export function looksLikeFen(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? '';
  return FEN_PLACEMENT.test(first);
}

/** Loads a FEN (4–6 fields; missing clocks default to "0 1"), validated with German messages. */
export function loadFen(text: string): LoadResult {
  const fields = text.trim().split(/\s+/);
  const full = fields.length === 4 ? `${fields.join(' ')} 0 1` : fields.length === 5 ? `${fields.join(' ')} 1` : fields.join(' ');
  const v = validateFen(full);
  if (!v.ok) return { ok: false, errorDe: v.errorDe };
  try {
    return { ok: true, startFen: ChessGame.fromFen(full).startFen(), moves: [] };
  } catch (e) {
    return { ok: false, errorDe: e instanceof ChessRulesError ? e.messageDe : STRINGS_DE.invalidPosition };
  }
}

/** Loads the main line of a PGN (start position from its `FEN` tag). */
export function loadPgn(text: string): LoadResult {
  try {
    const g = ChessGame.fromPgn(text.trim());
    return { ok: true, startFen: g.startFen(), moves: g.uciMoves() };
  } catch (e) {
    const msg = e instanceof ChessRulesError ? e.messageDe : 'Die PGN konnte nicht gelesen werden.';
    return { ok: false, errorDe: `${msg} Züge in der PGN bitte mit englischen Buchstaben schreiben (N, B, R, Q, K, z. B. 1. e4 e5 2. Nf3).` };
  }
}

/** Loads user input: FEN or PGN, detected automatically. */
export function loadInput(text: string): LoadResult {
  if (!text.trim()) return { ok: false, errorDe: STRINGS_DE.importEmpty };
  return looksLikeFen(text) ? loadFen(text) : loadPgn(text);
}

/** Start of the page from `?fen=` / `?pgn=` (PGN wins); the standard position without parameters. */
export function loadFromParams(fen: string | null, pgn: string | null): LoadResult {
  if (pgn) return loadPgn(pgn);
  if (fen) return loadFen(fen);
  return { ok: true, startFen: START_FEN, moves: [] };
}

/** PGN date tag "YYYY.MM.DD". */
export function pgnDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`;
}

/** PGN of the whole line (English SAN, `O-O`; `SetUp`/`FEN` tags for other start positions). */
export function exportPgn(line: AnalysisLine, date = new Date()): string {
  return lineGame(line).pgn({ Event: STRINGS_DE.pgnEvent, Site: 'Zugzwang', Date: pgnDate(date) });
}

/** FEN of the shown position. */
export function exportFen(line: AnalysisLine): Fen {
  return shownGame(line).fen();
}

/**
 * An engine line as numbered SAN in the user's notation: "1. e4 e5 2. Sf3" (White to move) or "1… e5 2. Sf3"
 * (Black to move). At most `maxPlies` moves.
 */
export function formatEngineLine(fen: Fen, line: Pick<EngineLine, 'pv'>, notation: Notation, maxPlies = 10): { text: string; first: string | null } {
  const sans = uciLineToSan(fen, line.pv.slice(0, maxPlies));
  const fields = fen.split(' ');
  let number = Number(fields[5] ?? 1) || 1;
  let white = fields[1] !== 'b';
  const parts: string[] = [];
  sans.forEach((san, i) => {
    const shown = formatSan(san, notation);
    if (white) parts.push(`${number}. ${shown}`);
    else parts.push(i === 0 ? `${number}… ${shown}` : shown);
    if (!white) number += 1;
    white = !white;
  });
  return { text: parts.join(' '), first: sans[0] ? formatSan(sans[0], notation) : null };
}
