/**
 * Material helpers and the "cannot checkmate" test used for resignation (FIDE 5.1.2, 2023) and flag fall (6.9).
 */
import { Chess } from 'chess.js';
import type { Color, Fen, PieceSymbol } from '@/core/chess';

/** Conventional piece values in pawns (king 0). Used for material balance and explanations. */
export const PIECE_VALUES: Readonly<Record<PieceSymbol, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Pieces per colour and type in a FEN position. */
export function pieceCounts(fen: Fen): Record<Color, Record<PieceSymbol, number>> {
  const counts: Record<Color, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  const placement = fen.trim().split(/\s+/)[0] ?? '';
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if ('pnbrqk'.includes(lower) && ch !== '/') {
      const color: Color = ch === lower ? 'b' : 'w';
      counts[color][lower as PieceSymbol] += 1;
    }
  }
  return counts;
}

/** Material balance in pawns from White's point of view (White's material minus Black's). */
export function materialBalance(fen: Fen): number {
  const c = pieceCounts(fen);
  let sum = 0;
  for (const p of Object.keys(PIECE_VALUES) as PieceSymbol[]) sum += (c.w[p] - c.b[p]) * PIECE_VALUES[p];
  return sum;
}

/**
 * `true` if `color` cannot checkmate the opponent by any series of legal moves, judged by material
 * (RULES.md §5.3, table of Lichess `InsufficientMatingMaterial`, verified by brute force in RULES):
 * 1. `color` has only its king; or
 * 2. `color` has king + exactly one knight and nothing else, and the opponent has nothing but king and queen(s)
 *    (a bare king included); or
 * 3. `color` has king + bishop(s) only, all bishops on the board stand on one square colour, and the opponent has
 *    no knight and no pawn.
 * Limit (documented, accepted): material only, locked pawn structures are not detected.
 */
export function cannotMate(fen: Fen, color: Color): boolean {
  const counts = pieceCounts(fen);
  const own = counts[color];
  const opp = counts[color === 'w' ? 'b' : 'w'];
  const ownNonKing = own.p + own.n + own.b + own.r + own.q;
  if (ownNonKing === 0) return true;
  if (own.n === 1 && ownNonKing === 1) {
    // "only king + queen(s)" = nothing but the king and any number of queens (a bare king included).
    return opp.p === 0 && opp.n === 0 && opp.b === 0 && opp.r === 0;
  }
  if (own.b > 0 && own.b === ownNonKing) {
    if (opp.n > 0 || opp.p > 0) return false;
    const chess = new Chess(fen, { skipValidation: true });
    const colours = new Set<string>();
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'b') colours.add(chess.squareColor(cell.square) ?? '');
      }
    }
    return colours.size <= 1;
  }
  return false;
}
