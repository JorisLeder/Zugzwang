/**
 * Static exchange evaluation (SEE) and small board helpers for the motif detectors and the "brilliant" rule (D-07).
 *
 * All attack information comes from `@/lib/chess` (`attackersOf`, `isSquareAttacked` – attacks include pinned pieces,
 * D-44); pieces are removed/placed via `boardPieces`/`buildFen`. No move generation is hand-written here.
 *
 * SEE details:
 * - The capturing side always uses its least valuable attacker whose capture does not leave its own king attacked
 *   (so absolutely pinned pieces and illegal king captures are skipped).
 * - Either side may stop capturing when continuing would lose material (classic swap-list minimax).
 * - Values in pawns: P 1, N 3, B 3, R 5, Q 9 (`PIECE_VALUES`). Promotions during an exchange are ignored.
 */
import type { Color, Fen, PieceSymbol, Square, Uci } from '@/core/chess';
import { attackersOf, boardPieces, buildFen, isSquareAttacked, parseUci, PIECE_VALUES, type BoardPiece } from '@/lib/chess';

/** Pieces keyed by square. */
export type PieceMap = Map<Square, BoardPiece>;

/** The other colour. */
export function otherColor(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

/** Piece value in pawns (king 0, as `PIECE_VALUES`). */
export function pieceValue(type: PieceSymbol): number {
  return PIECE_VALUES[type];
}

/** Ordering value for "least valuable attacker" (king last). */
function attackerOrder(type: PieceSymbol): number {
  return type === 'k' ? 100 : PIECE_VALUES[type];
}

/** Pieces of a FEN keyed by square. */
export function pieceMap(fen: Fen): PieceMap {
  return new Map(boardPieces(fen).map((p) => [p.square, p]));
}

/** A FEN for attack queries on a piece map (side to move and other fields are irrelevant for attacks). */
export function mapFen(map: PieceMap, turn: Color = 'w'): Fen {
  return buildFen({ pieces: [...map.values()], turn });
}

/** Square of `color`'s king in a piece map. */
export function kingOf(map: PieceMap, color: Color): Square | null {
  for (const p of map.values()) if (p.type === 'k' && p.color === color) return p.square;
  return null;
}

/** Piece map after moving the piece on `from` to `to` (capturing whatever stands there). */
export function movePiece(map: PieceMap, from: Square, to: Square): PieceMap {
  const piece = map.get(from);
  const next = new Map(map);
  if (!piece) return next;
  next.delete(from);
  next.set(to, { ...piece, square: to });
  return next;
}

/** Whether moving `attacker` to `square` (a capture) leaves its own king unattacked. */
function captureIsLegal(map: PieceMap, attacker: BoardPiece, square: Square): boolean {
  const next = movePiece(map, attacker.square, square);
  const king = attacker.type === 'k' ? square : kingOf(next, attacker.color);
  if (!king) return true;
  return !isSquareAttacked(mapFen(next), king, otherColor(attacker.color));
}

/** Least valuable piece of `side` that can legally capture on `square`, or `null`. */
export function leastValuableAttacker(map: PieceMap, square: Square, side: Color): BoardPiece | null {
  const attackers = attackersOf(mapFen(map), square, side)
    .map((sq) => map.get(sq))
    .filter((p): p is BoardPiece => p !== undefined)
    .sort((a, b) => attackerOrder(a.type) - attackerOrder(b.type));
  for (const a of attackers) if (captureIsLegal(map, a, square)) return a;
  return null;
}

/**
 * Swap list for a capture sequence on `square` that starts with `first` capturing. Returns the material result for
 * `first`'s side (can be negative), with both sides allowed to stop after the first capture.
 */
function swap(map: PieceMap, square: Square, first: BoardPiece, targetValue: number): number {
  const gains: number[] = [targetValue];
  let board = movePiece(map, first.square, square);
  let onSquare = attackerOrder(first.type);
  let side = otherColor(first.color);
  let depth = 0;
  for (;;) {
    const attacker = leastValuableAttacker(board, square, side);
    if (!attacker) break;
    depth += 1;
    gains[depth] = onSquare - gains[depth - 1]!;
    // Neither side would continue a sequence that is already lost for it.
    if (Math.max(-gains[depth - 1]!, gains[depth]!) < 0) break;
    // A king only captures when the square is no longer defended (`captureIsLegal`), so it is never recaptured.
    board = movePiece(board, attacker.square, square);
    onSquare = attackerOrder(attacker.type);
    side = otherColor(side);
  }
  while (depth > 0) {
    gains[depth - 1] = -Math.max(-gains[depth - 1]!, gains[depth]!);
    depth -= 1;
  }
  return gains[0]!;
}

/**
 * Material (pawns, ≥ 0) that `byColor` wins by starting a capture sequence on `square` with best play by both sides
 * (`0` if the square holds no enemy piece, the piece is a king, no legal capture exists or capturing does not pay).
 */
export function captureGain(fen: Fen, square: Square, byColor: Color): number {
  const map = pieceMap(fen);
  const target = map.get(square);
  if (!target || target.color === byColor || target.type === 'k') return 0;
  const first = leastValuableAttacker(map, square, byColor);
  if (!first) return 0;
  return Math.max(0, swap(map, square, first, pieceValue(target.type)));
}

/**
 * SEE of a specific capture `move` in `fen` for the side that makes it (pawns; negative = the capture loses material).
 * Non-captures return 0. En passant captures count as winning a pawn.
 */
export function seeMove(fen: Fen, move: Uci): number {
  const input = parseUci(move);
  if (!input) return 0;
  const map = pieceMap(fen);
  const mover = map.get(input.from);
  if (!mover) return 0;
  const target = map.get(input.to);
  if (target && target.color !== mover.color) return swap(map, input.to, mover, pieceValue(target.type));
  if (!target && mover.type === 'p' && input.from[0] !== input.to[0]) {
    // En passant: remove the captured pawn, then evaluate the exchange on the destination square.
    const capturedSquare = `${input.to[0]}${input.from[1]}` as Square;
    const withoutPawn = new Map(map);
    withoutPawn.delete(capturedSquare);
    return swap(withoutPawn, input.to, mover, 1);
  }
  return 0;
}
