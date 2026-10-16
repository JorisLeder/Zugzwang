/**
 * Rule-based move heuristics of the bot models (D-16): which moves look "natural" to a human (recaptures, development,
 * checks), which pieces hang, and which moves are typical beginner errors (overlooking an attacked piece, missing a
 * capture, putting a piece en prise). Attacks come from `@/lib/chess` (D-44) – no hand-written move generation.
 */
import type { Color, Fen, PieceSymbol, Square, Uci } from '@/core/chess';
import { attackersOf, boardPieces, ChessGame, fenFullmoveNumber, PIECE_VALUES, type LegalMove } from '@/lib/chess';

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Value of a piece for exchange decisions (king counts as very valuable so it never "defends cheaply"). */
function value(p: PieceSymbol): number {
  return p === 'k' ? 100 : PIECE_VALUES[p];
}

/** A piece that can be taken with profit. */
export interface HangingPiece {
  square: Square;
  piece: PieceSymbol;
  color: Color;
  /** Material the attacker wins by a simple capture (piece value, or value − cheapest attacker when defended). */
  gain: number;
}

/**
 * Pieces of `color` (no king) that are en prise in `fen`: attacked by the opponent and either undefended or attacked by
 * a cheaper piece. A one-step exchange estimate (no full SEE) – good enough for beginner-level decisions.
 */
export function hangingPieces(fen: Fen, color: Color): HangingPiece[] {
  const out: HangingPiece[] = [];
  const pieces = boardPieces(fen);
  const typeAt = new Map(pieces.map((p) => [p.square, p.type]));
  for (const p of pieces) {
    if (p.color !== color || p.type === 'k') continue;
    const attackers = attackersOf(fen, p.square, other(color));
    if (attackers.length === 0) continue;
    const defenders = attackersOf(fen, p.square, color);
    const cheapest = Math.min(...attackers.map((sq) => value(typeAt.get(sq) ?? 'q')));
    const gain = defenders.length === 0 ? value(p.type) : value(p.type) - cheapest;
    if (gain > 0) out.push({ square: p.square, piece: p.type, color, gain });
  }
  return out;
}

/** Whether the piece that moved with `move` stands en prise on its destination afterwards. */
export function movesIntoDanger(fenBefore: Fen, move: LegalMove): boolean {
  if (move.piece === 'k') return false;
  const game = ChessGame.fromFen(fenBefore);
  const mover = game.turn();
  const rec = game.move(move.uci);
  if (!rec) return false;
  const after = rec.fenAfter;
  const hanging = hangingPieces(after, mover).find((h) => h.square === rec.to);
  if (!hanging) return false;
  // A capture that wins at least as much as it risks is not a "hanging" mistake.
  const won = rec.captured ? PIECE_VALUES[rec.captured] : 0;
  return hanging.gain > won;
}

const CENTRE = new Set<Square>(['d4', 'e4', 'd5', 'e5']);
const WIDE_CENTRE = new Set<Square>(['c3', 'd3', 'e3', 'f3', 'c4', 'f4', 'c5', 'f5', 'c6', 'd6', 'e6', 'f6']);

/** Rank 1–8 of a square. */
function rank(sq: Square): number {
  return Number(sq[1]);
}

/**
 * How "plausible" a move looks to a beginner (higher = more likely to be considered): captures and checks attract,
 * development and central pawns in the opening, castling; random king walks and under-promotions repel.
 * Used to choose believable gross errors – never uniformly random moves (BACKLOG WP-04).
 */
export function plausibility(fen: Fen, move: LegalMove): number {
  const game = ChessGame.fromFen(fen);
  const color = game.turn();
  const opening = fenFullmoveNumber(fen) <= 10;
  const forward = color === 'w' ? rank(move.to) - rank(move.from) : rank(move.from) - rank(move.to);
  let score = 0;
  if (move.captured) score += 1.5 + 0.3 * PIECE_VALUES[move.captured];
  if (move.san.includes('+') || move.san.includes('#')) score += 1.5;
  if (move.isCastle) score += 2;
  if (move.isPromotion) score += move.promotion === 'q' ? 3 : -2;
  const backRank = color === 'w' ? 1 : 8;
  if (opening) {
    if ((move.piece === 'n' || move.piece === 'b') && rank(move.from) === backRank) score += 1.5;
    if (move.piece === 'p' && (move.from[0] === 'd' || move.from[0] === 'e')) score += 1.5;
    if (move.piece === 'p' && move.from[0] !== 'd' && move.from[0] !== 'e') score += 0.3;
    if (move.piece === 'q') score += 0.5;
  }
  if (move.piece === 'k' && !move.isCastle && !game.status().inCheck) score -= 1.5;
  if (forward > 0) score += 0.5;
  else if (forward < 0) score -= 0.5;
  if (CENTRE.has(move.to)) score += 0.5;
  else if (WIDE_CENTRE.has(move.to)) score += 0.25;
  return score;
}

/** Kinds of "natural" moves a human prefers (used as a small bonus in the human model). */
export interface NaturalMoveTraits {
  recapture: boolean;
  check: boolean;
  capture: boolean;
  development: boolean;
  castle: boolean;
}

/**
 * Traits of `move` in `fen`. `previousTo`/`previousCaptured` describe the opponent's last move (recapture = taking back
 * on the square where the opponent just captured).
 */
export function naturalTraits(fen: Fen, move: LegalMove, previous: { to: Square; captured?: PieceSymbol } | null): NaturalMoveTraits {
  const color = ChessGame.fromFen(fen).turn();
  const backRank = color === 'w' ? 1 : 8;
  const opening = fenFullmoveNumber(fen) <= 12;
  return {
    recapture: Boolean(previous?.captured && move.captured && previous.to === move.to),
    check: move.san.includes('+') || move.san.includes('#'),
    capture: Boolean(move.captured),
    development: opening && (move.piece === 'n' || move.piece === 'b') && rank(move.from) === backRank,
    castle: move.isCastle,
  };
}

/** Error kinds of the rule-based gross errors of weak bots. */
export type GrossErrorKind = 'ignore-attacked-piece' | 'miss-capture' | 'hang-piece' | 'careless';

/** A candidate gross error: the kind and the moves that commit it. */
export interface GrossErrorCandidates {
  kind: GrossErrorKind;
  moves: LegalMove[];
}

/**
 * Moves that commit a typical beginner error in `fen` (BACKLOG WP-04 "overlooking attacked pieces, missing
 * captures"):
 * 1. an own piece is en prise → moves that leave it en prise (do not move it, do not take the attacker);
 * 2. else an opponent piece is en prise → moves that do not take it;
 * 3. else → moves that put the moved piece en prise;
 * 4. else (quiet position, nothing to overlook) → all non-best plausible moves (`careless`).
 * `avoid` (usually the engine's move) is removed from the candidates when other moves exist.
 */
export function grossErrorCandidates(fen: Fen, avoid?: Uci | null): GrossErrorCandidates {
  const game = ChessGame.fromFen(fen);
  const color = game.turn();
  const legal = game.legalMoves();
  const withoutAvoid = (moves: LegalMove[]) => {
    const filtered = moves.filter((m) => m.uci !== avoid);
    return filtered.length > 0 ? filtered : moves;
  };
  if (legal.length <= 1) return { kind: 'careless', moves: legal };

  const own = hangingPieces(fen, color);
  if (own.length > 0) {
    const ownSquares = new Set(own.map((h) => h.square));
    const attackers = new Set(own.flatMap((h) => attackersOf(fen, h.square, other(color))));
    const moves = legal.filter((m) => !ownSquares.has(m.from) && !attackers.has(m.to));
    if (moves.length > 0) return { kind: 'ignore-attacked-piece', moves: withoutAvoid(moves) };
  }

  const opp = hangingPieces(fen, other(color));
  if (opp.length > 0) {
    const targets = new Set(opp.map((h) => h.square));
    const moves = legal.filter((m) => !targets.has(m.to));
    if (moves.length > 0) return { kind: 'miss-capture', moves: withoutAvoid(moves) };
  }

  const hanging = legal.filter((m) => movesIntoDanger(fen, m));
  if (hanging.length > 0) return { kind: 'hang-piece', moves: withoutAvoid(hanging) };

  return { kind: 'careless', moves: withoutAvoid(legal) };
}
