/**
 * Board inspection helpers (added by the manager after WP-00, D-44). They wrap chess.js so that packages that need
 * attack information (WP-02 motif detectors and SEE, WP-04 rule-based bot errors) or FEN editing (WP-01 position
 * editor) never import chess.js themselves (CONVENTIONS §5).
 *
 * - `attackersOf`/`isSquareAttacked` report **attacks**, not legal moves: a pinned piece still attacks (it still
 *   defends and still gives check, FIDE 3.9), and en passant is not an attack on a square. The position does not
 *   have to be legal (pieces may be removed for SEE or x-ray checks).
 * - `parseFen`/`buildFen` only split and join the six FEN fields; they do not validate. Validate user input with
 *   `validateFen` and load games with `ChessGame.fromFen`.
 * - `nullMoveFen` gives the move to the opponent (threat detection: "what would the opponent do if it were their
 *   turn?"). It is an analysis device, never a move in a game.
 */
import { Chess } from 'chess.js';
import type { Color, Fen, PieceSymbol, Square } from '@/core/chess';
import { SQUARES } from '@/core/chess';

/** A piece on a square. */
export interface BoardPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

/** The six FEN fields, split. */
export interface FenParts {
  /** All pieces (order: a8 … h8, a7 … h1). */
  pieces: BoardPiece[];
  turn: Color;
  /** Castling field as written (`KQkq`, `-` …). */
  castling: string;
  /** En-passant field (`-` or a square). */
  enPassant: Square | '-';
  halfmove: number;
  fullmove: number;
}

const SQUARE_SET = new Set<string>(SQUARES);
const PIECE_LETTERS = 'pnbrqk';

/** Loads a position into chess.js without validation (positions may lack a king or be otherwise illegal). */
function loadLoose(fen: Fen): Chess {
  return new Chess(fen.trim().replace(/\s+/g, ' '), { skipValidation: true });
}

/**
 * Splits a FEN into its fields. Returns `null` when the placement field does not describe 8 ranks of 8 squares or
 * a field is malformed. No legality checks (use `validateFen`).
 */
export function parseFen(fen: Fen): FenParts | null {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 4 || fields.length > 6) return null;
  const [placement, turn, castling, ep, half = '0', full = '1'] = fields as [string, string, string, string, string?, string?];
  const ranks = placement.split('/');
  if (ranks.length !== 8) return null;
  const pieces: BoardPiece[] = [];
  for (let r = 0; r < 8; r += 1) {
    let file = 0;
    for (const ch of ranks[r]!) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const lower = ch.toLowerCase();
      if (!PIECE_LETTERS.includes(lower) || file > 7) return null;
      const square = `${String.fromCharCode(97 + file)}${8 - r}` as Square;
      pieces.push({ square, type: lower as PieceSymbol, color: ch === lower ? 'b' : 'w' });
      file += 1;
    }
    if (file !== 8) return null;
  }
  if (turn !== 'w' && turn !== 'b') return null;
  if (!/^(-|K?Q?k?q?)$/.test(castling) || castling === '') return null;
  if (ep !== '-' && !SQUARE_SET.has(ep)) return null;
  const halfmove = Number(half);
  const fullmove = Number(full);
  if (!Number.isInteger(halfmove) || halfmove < 0 || !Number.isInteger(fullmove) || fullmove < 1) return null;
  return { pieces, turn, castling, enPassant: ep as Square | '-', halfmove, fullmove };
}

/**
 * Joins FEN fields. Pieces on the same square: the last one wins. Missing fields default to White to move, no
 * castling, no e.p. square, clocks 0/1. No legality checks (use `validateFen`).
 */
export function buildFen(parts: Partial<FenParts> & { pieces: BoardPiece[] }): Fen {
  const grid: Array<Array<string | null>> = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
  for (const p of parts.pieces) {
    const file = p.square.charCodeAt(0) - 97;
    const rank = Number(p.square[1]);
    grid[8 - rank]![file] = p.color === 'w' ? p.type.toUpperCase() : p.type;
  }
  const placement = grid
    .map((row) => {
      let out = '';
      let empty = 0;
      for (const cell of row) {
        if (cell === null) {
          empty += 1;
        } else {
          if (empty) out += String(empty);
          empty = 0;
          out += cell;
        }
      }
      return empty ? out + String(empty) : out;
    })
    .join('/');
  const castling = parts.castling && parts.castling !== '' ? parts.castling : '-';
  return `${placement} ${parts.turn ?? 'w'} ${castling} ${parts.enPassant ?? '-'} ${parts.halfmove ?? 0} ${parts.fullmove ?? 1}`;
}

/** All pieces of a position (empty array for an unparsable FEN). */
export function boardPieces(fen: Fen): BoardPiece[] {
  return parseFen(fen)?.pieces ?? [];
}

/** Square of `color`'s king, or `null` if there is none (or more than one). */
export function kingSquare(fen: Fen, color: Color): Square | null {
  const kings = boardPieces(fen).filter((p) => p.type === 'k' && p.color === color);
  return kings.length === 1 ? kings[0]!.square : null;
}

/**
 * Squares of `byColor`'s pieces that attack `square` (pinned pieces included, en passant excluded). Works on any
 * parsable position, also with pieces removed. Empty for an unparsable FEN.
 */
export function attackersOf(fen: Fen, square: Square, byColor: Color): Square[] {
  if (!parseFen(fen)) return [];
  return loadLoose(fen).attackers(square, byColor);
}

/** Whether `byColor` attacks `square` (see `attackersOf`). */
export function isSquareAttacked(fen: Fen, square: Square, byColor: Color): boolean {
  if (!parseFen(fen)) return false;
  return loadLoose(fen).isAttacked(square, byColor);
}

/**
 * The position with the move passed to the opponent (null move): side to move swapped, e.p. square cleared,
 * half-move clock + 1, full-move number + 1 after Black passes. `null` if the side to move is in check (passing
 * would leave the king in check, FIDE 3.9) or the FEN is unparsable.
 */
export function nullMoveFen(fen: Fen): Fen | null {
  const parts = parseFen(fen);
  if (!parts) return null;
  const king = kingSquare(fen, parts.turn);
  const opponent: Color = parts.turn === 'w' ? 'b' : 'w';
  if (king && isSquareAttacked(fen, king, opponent)) return null;
  return buildFen({
    ...parts,
    turn: opponent,
    enPassant: '-',
    halfmove: parts.halfmove + 1,
    fullmove: parts.turn === 'b' ? parts.fullmove + 1 : parts.fullmove,
  });
}
