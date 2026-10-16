/**
 * Pure logic of the position editor ("Stellung aufbauen"): place/remove pieces, side to move, castling rights and
 * en-passant square. The FEN fields are joined with `buildFen` and checked with `validateFen` (German messages) –
 * the editor never decides legality itself; it only greys out options whose pieces are not on their squares.
 */
import { START_FEN, type Color, type Fen, type PieceSymbol, type Square } from '@/core/chess';
import { buildFen, parseFen, validateFen, type BoardPiece, type FenValidation } from '@/lib/chess';
import type { PieceCode } from '@/ui/board';

/** Palette tool: a piece to place or the eraser. */
export type EditorTool = PieceCode | 'erase';

/** Castling flags as in FEN. */
export type CastlingFlag = 'K' | 'Q' | 'k' | 'q';

/** Editor state. */
export interface EditorState {
  pieces: BoardPiece[];
  turn: Color;
  /** Requested castling rights (only effective while king and rook stand on their squares). */
  castling: Record<CastlingFlag, boolean>;
  /** Requested en-passant square (only effective while it fits the position). */
  enPassant: Square | '-';
  fullmove: number;
}

/** Palette order: White K D T L S B, Black K D T L S B. */
export const PALETTE: PieceCode[] = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

const CASTLING_SQUARES: Record<CastlingFlag, { king: Square; rook: Square; color: Color }> = {
  K: { king: 'e1', rook: 'h1', color: 'w' },
  Q: { king: 'e1', rook: 'a1', color: 'w' },
  k: { king: 'e8', rook: 'h8', color: 'b' },
  q: { king: 'e8', rook: 'a8', color: 'b' },
};

/** Editor state from a FEN (falls back to the empty board for an unparsable FEN). */
export function editorFromFen(fen: Fen): EditorState {
  const parts = parseFen(fen);
  if (!parts) return { pieces: [], turn: 'w', castling: { K: false, Q: false, k: false, q: false }, enPassant: '-', fullmove: 1 };
  return {
    pieces: parts.pieces,
    turn: parts.turn,
    castling: {
      K: parts.castling.includes('K'),
      Q: parts.castling.includes('Q'),
      k: parts.castling.includes('k'),
      q: parts.castling.includes('q'),
    },
    enPassant: parts.enPassant,
    fullmove: parts.fullmove,
  };
}

/** The standard initial position. */
export function startPosition(): EditorState {
  return editorFromFen(START_FEN);
}

/** Empty board (keeps side to move). */
export function clearBoard(state: EditorState): EditorState {
  return { ...state, pieces: [], castling: { K: false, Q: false, k: false, q: false }, enPassant: '-' };
}

function pieceAt(pieces: readonly BoardPiece[], square: Square): BoardPiece | undefined {
  return pieces.find((p) => p.square === square);
}

/** Piece code of a board piece (`wK` …). */
export function pieceCode(p: { type: PieceSymbol; color: Color }): PieceCode {
  return `${p.color}${p.type.toUpperCase()}` as PieceCode;
}

/**
 * Applies the tool to a square: the eraser (or the same piece again) removes the piece, any other piece replaces
 * what stands there.
 */
export function placeOnSquare(state: EditorState, square: Square, tool: EditorTool): EditorState {
  const existing = pieceAt(state.pieces, square);
  const rest = state.pieces.filter((p) => p.square !== square);
  if (tool === 'erase' || (existing && pieceCode(existing) === tool)) return { ...state, pieces: rest };
  const color = tool[0] as Color;
  const type = tool[1]!.toLowerCase() as PieceSymbol;
  return { ...state, pieces: [...rest, { square, type, color }] };
}

/** Which castling rights are possible at all: king and rook on their original squares (FIDE 3.8.2.1). */
export function castlingAvailable(pieces: readonly BoardPiece[]): Record<CastlingFlag, boolean> {
  const has = (sq: Square, type: PieceSymbol, color: Color) => {
    const p = pieceAt(pieces, sq);
    return p?.type === type && p.color === color;
  };
  const out = {} as Record<CastlingFlag, boolean>;
  for (const flag of Object.keys(CASTLING_SQUARES) as CastlingFlag[]) {
    const c = CASTLING_SQUARES[flag];
    out[flag] = has(c.king, 'k', c.color) && has(c.rook, 'r', c.color);
  }
  return out;
}

/**
 * En-passant squares that fit the position (3.7.4.1): behind an enemy pawn that could just have advanced two
 * squares, with both squares it passed empty. Whether a capture is actually possible is decided by `@/lib/chess`.
 */
export function enPassantOptions(pieces: readonly BoardPiece[], turn: Color): Square[] {
  const files = 'abcdefgh';
  const out: Square[] = [];
  for (const f of files) {
    const [pawnRank, epRank, startRank] = turn === 'w' ? [5, 6, 7] : [4, 3, 2];
    const pawn = pieceAt(pieces, `${f}${pawnRank}` as Square);
    const enemy: Color = turn === 'w' ? 'b' : 'w';
    if (pawn?.type === 'p' && pawn.color === enemy && !pieceAt(pieces, `${f}${epRank}` as Square) && !pieceAt(pieces, `${f}${startRank}` as Square)) {
      out.push(`${f}${epRank}` as Square);
    }
  }
  return out;
}

/** FEN of the editor state (only effective castling rights and e.p. square; half-move clock 0). */
export function editorFen(state: EditorState): Fen {
  const available = castlingAvailable(state.pieces);
  const castling = (['K', 'Q', 'k', 'q'] as CastlingFlag[]).filter((f) => state.castling[f] && available[f]).join('');
  const ep = state.enPassant !== '-' && enPassantOptions(state.pieces, state.turn).includes(state.enPassant) ? state.enPassant : '-';
  return buildFen({ pieces: state.pieces, turn: state.turn, castling: castling || '-', enPassant: ep, halfmove: 0, fullmove: state.fullmove });
}

/** Validation of the edited position (German message). */
export function validateEditor(state: EditorState): FenValidation {
  return validateFen(editorFen(state));
}
