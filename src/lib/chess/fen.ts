/**
 * FEN validation and normalisation on top of chess.js (RULES.md §0 row 13, §5.4).
 *
 * chess.js 1.4 accepts positions that are illegal under FIDE 3.10.3 (side not to move in check), trusts castling
 * flags whose king/rook are not on their squares, and accepts bogus en-passant squares. Every FEN entry point
 * (lessons, puzzles, user input, PGN `[FEN]`) therefore goes through `validateFen` (strict, German messages) and/or
 * `normalizeFen` (cleans castling/e.p. fields).
 */
import { Chess, validateFen as chessJsValidateFen, type Square } from 'chess.js';
import type { Color, Fen } from '@/core/chess';

/** Result of `validateFen`: ok, or a German error message for the learner. */
export type FenValidation = { ok: true } | { ok: false; errorDe: string };

const CHESSJS_ERRORS_DE: Array<[RegExp, string]> = [
  [/six space-delimited fields/, 'Die FEN muss aus sechs durch Leerzeichen getrennten Feldern bestehen.'],
  [/move number/, 'Die Zugnummer in der FEN muss eine positive ganze Zahl sein.'],
  [/half move counter/, 'Der Halbzugzähler in der FEN muss eine ganze Zahl ab 0 sein.'],
  [/en-passant square is invalid|illegal en-passant square/, 'Das En-passant-Feld passt nicht zur Stellung.'],
  [/castling availability/, 'Die Rochaderechte in der FEN sind ungültig.'],
  [/side-to-move/, 'Das Zugrecht muss „w“ (Weiß) oder „b“ (Schwarz) sein.'],
  [/8 '\/'-delimited rows|consecutive number|invalid piece|too many squares/, 'Die Stellung in der FEN ist ungültig: Jede der 8 Reihen muss genau 8 Felder beschreiben.'],
  [/missing white king|too many white kings/, 'Weiß braucht genau einen König.'],
  [/missing black king|too many black kings/, 'Schwarz braucht genau einen König.'],
  [/pawns are on the edge rows/, 'Bauern dürfen nicht auf der ersten oder achten Reihe stehen.'],
];

function translateChessJsError(error: string | undefined): string {
  for (const [re, de] of CHESSJS_ERRORS_DE) if (error && re.test(error)) return de;
  return 'Die FEN ist ungültig.';
}

type Board = ReturnType<Chess['board']>;

function pieceAt(board: Board, square: string): { type: string; color: Color } | null {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const cell = board[8 - rank]?.[file];
  return cell ? { type: cell.type, color: cell.color } : null;
}

function otherColor(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

/** Castling flags that are consistent with king and rook on their original squares (3.8.2.1). */
function consistentCastling(board: Board, castling: string): string {
  if (castling === '-') return '-';
  const keep = castling.split('').filter((flag) => {
    const white = flag === 'K' || flag === 'Q';
    const color: Color = white ? 'w' : 'b';
    const rank = white ? '1' : '8';
    const king = pieceAt(board, `e${rank}`);
    const rook = pieceAt(board, `${flag.toLowerCase() === 'k' ? 'h' : 'a'}${rank}`);
    return king?.type === 'k' && king.color === color && rook?.type === 'r' && rook.color === color;
  });
  return keep.length ? keep.join('') : '-';
}

/**
 * Whether an e.p. square is consistent with the position (3.7.4.1): on rank 6 (White to move) or 3 (Black to move),
 * the e.p. square and the start square behind it are empty, and an enemy pawn stands in front of it.
 */
function epConsistent(board: Board, ep: string, turn: Color): boolean {
  if (ep === '-') return true;
  const file = ep[0]!;
  const rank = ep[1];
  if (turn === 'w' ? rank !== '6' : rank !== '3') return false;
  const pawnRank = turn === 'w' ? '5' : '4';
  const startRank = turn === 'w' ? '7' : '2';
  const pawn = pieceAt(board, `${file}${pawnRank}`);
  return (
    pieceAt(board, ep) === null &&
    pieceAt(board, `${file}${startRank}`) === null &&
    pawn?.type === 'p' &&
    pawn.color === otherColor(turn)
  );
}

function countPieces(board: Board, color: Color): Record<string, number> {
  const counts: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const row of board) for (const cell of row) if (cell && cell.color === color) counts[cell.type]! += 1;
  return counts;
}

/**
 * Strict validation (BACKLOG 2.7, RULES §5.4) with German messages:
 * chess.js syntax checks, exactly one king per side, no pawns on rank 1/8, the side **not** to move is not in check,
 * castling rights consistent with king/rook squares, e.p. square consistent, at most 8 pawns and no more extra pieces
 * than promotions could have produced.
 */
export function validateFen(fen: Fen): FenValidation {
  const trimmed = fen.trim().replace(/\s+/g, ' ');
  const base = chessJsValidateFen(trimmed);
  if (!base.ok) return { ok: false, errorDe: translateChessJsError(base.error) };

  const [, turnField, castling, ep] = trimmed.split(' ') as [string, Color, string, string];
  let chess: Chess;
  try {
    chess = new Chess(trimmed);
  } catch {
    return { ok: false, errorDe: 'Die FEN ist ungültig.' };
  }
  const board = chess.board();

  for (const color of ['w', 'b'] as const) {
    const c = countPieces(board, color);
    const name = color === 'w' ? 'Weiß' : 'Schwarz';
    if (c.p! > 8) return { ok: false, errorDe: `${name} hat mehr als 8 Bauern.` };
    const extra = Math.max(0, c.q! - 1) + Math.max(0, c.r! - 2) + Math.max(0, c.b! - 2) + Math.max(0, c.n! - 2);
    if (c.p! + extra > 8) {
      return { ok: false, errorDe: `${name} hat mehr Figuren, als durch Umwandlungen entstehen können.` };
    }
  }

  // FIDE 3.10.3: the side that is NOT to move must not be in check.
  const notToMove = otherColor(turnField);
  const kingSquare = chess.findPiece({ type: 'k', color: notToMove })[0];
  if (kingSquare && chess.isAttacked(kingSquare, turnField)) {
    const name = notToMove === 'w' ? 'Weiß' : 'Schwarz';
    return {
      ok: false,
      errorDe: `${name} ist nicht am Zug, steht aber im Schach – diese Stellung kann nicht entstehen.`,
    };
  }

  if (consistentCastling(board, castling) !== (castling === '-' ? '-' : castling)) {
    return {
      ok: false,
      errorDe: 'Die Rochaderechte passen nicht zur Stellung: König oder Turm stehen nicht auf ihrem Ausgangsfeld.',
    };
  }

  if (!epConsistent(board, ep, turnField)) {
    return { ok: false, errorDe: 'Das En-passant-Feld passt nicht zur Stellung.' };
  }

  return { ok: true };
}

/**
 * Cleans a FEN (RULES §5.4 rules 1–2): removes castling flags whose king/rook are not on their original squares and
 * removes the e.p. square unless a legal e.p. capture exists. Whitespace is normalised. Does not check legality –
 * use `validateFen` for that. Throws only if chess.js cannot parse the FEN at all.
 */
export function normalizeFen(fen: Fen): Fen {
  const trimmed = fen.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ');
  if (parts.length !== 6) throw new Error(`Invalid FEN: ${fen}`);
  const [placement, turn, castling, ep, half, full] = parts as [string, Color, string, string, string, string];
  const probe = new Chess(`${placement} ${turn} - - ${half} ${full}`, { skipValidation: true });
  const board = probe.board();
  const cleanCastling = consistentCastling(board, castling);
  let cleanEp = '-';
  if (ep !== '-' && epConsistent(board, ep, turn)) {
    // Keep it only if a legal e.p. capture exists (chess.js computes legality incl. pins).
    const withEp = new Chess(`${placement} ${turn} ${cleanCastling} ${ep} ${half} ${full}`, { skipValidation: true });
    const hasEpCapture = withEp.moves({ verbose: true }).some((m) => m.isEnPassant() && m.to === (ep as Square));
    if (hasEpCapture) cleanEp = ep;
  }
  return `${placement} ${turn} ${cleanCastling} ${cleanEp} ${half} ${full}`;
}

/**
 * Repetition key per FIDE 9.2.2: placement, side to move, castling rights, e.p. square (first four FEN fields).
 * Pass a FEN produced by chess.js `fen()` or `normalizeFen` (the e.p. square only appears when a capture is legal).
 */
export function positionKey(fen: Fen): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

/** Side to move of a FEN. */
export function fenTurn(fen: Fen): Color {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** Half-move clock (FEN field 5); 0 if missing. */
export function fenHalfmoveClock(fen: Fen): number {
  return Number(fen.trim().split(/\s+/)[4] ?? 0) || 0;
}

/** Full-move number (FEN field 6); 1 if missing. */
export function fenFullmoveNumber(fen: Fen): number {
  return Number(fen.trim().split(/\s+/)[5] ?? 1) || 1;
}
