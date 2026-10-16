/**
 * Chess domain types shared by every package (BACKLOG 2.6). Types only, plus a few constants.
 * Rules logic lives in `@/lib/chess` (the only rules layer, wraps chess.js).
 */
import type { Square as ChessJsSquare } from 'chess.js';

/** Side: `w` = White (Weiß), `b` = Black (Schwarz). */
export type Color = 'w' | 'b';

/** Piece letter as in chess.js / FEN (lower case): pawn, knight, bishop, rook, queen, king. */
export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Pieces a pawn may promote to (FIDE 3.7.5.1: queen, rook, bishop or knight of the same colour). */
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

/** Board square in algebraic notation, `a1` … `h8` (re-export of the chess.js type). */
export type Square = ChessJsSquare;

/** Forsyth–Edwards Notation string (six fields). */
export type Fen = string;

/** Move in UCI long algebraic notation, e.g. `e2e4`, `e7e8q` (promotion piece lower case). */
export type Uci = string;

/** Move in Standard Algebraic Notation with **English** piece letters (`Nf3`, `O-O`, `e8=Q+`). Display via `formatSan`. */
export type San = string;

/** Notation shown in the UI: `de` = K D T L S and `0-0` (default, D-23), `en` = K Q R B N and `O-O`. */
export type Notation = 'de' | 'en';

/** FEN of the standard initial position. */
export const START_FEN: Fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** All 64 squares from a8 to h1 (rank 8 first, as in FEN). */
export const SQUARES: readonly Square[] = (['8', '7', '6', '5', '4', '3', '2', '1'] as const).flatMap((rank) =>
  (['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const).map((file) => `${file}${rank}` as Square),
);

/** A move request from the UI or a bot: from/to squares plus the promotion piece when a pawn promotes. */
export interface MoveInput {
  /** Origin square. */
  from: Square;
  /** Destination square (for castling: the king's destination, e.g. `g1`). */
  to: Square;
  /** Required when a pawn reaches the last rank (no auto-queen); must be omitted otherwise. */
  promotion?: PromotionPiece;
}

/** A move that has been played, with everything the UI and analysis need. */
export interface MoveRecord {
  /** 1-based half-move index from the game's start position (first move of the game = 1). */
  ply: number;
  /** Full-move number as in PGN/FEN (taken from the start FEN's move counter). */
  moveNumber: number;
  /** Side that made the move. */
  color: Color;
  /** English SAN (`Nf3`, `O-O`, `exd8=Q+`). */
  san: San;
  /** UCI (`g1f3`, `e1g1`, `e7d8q`). */
  uci: Uci;
  /** Origin square. */
  from: Square;
  /** Destination square. */
  to: Square;
  /** Moving piece (before promotion). */
  piece: PieceSymbol;
  /** Captured piece, if any (en passant: `p`). */
  captured?: PieceSymbol;
  /** Promotion piece, if the move promoted. */
  promotion?: PromotionPiece;
  /** The move gives check (including checkmate). */
  isCheck: boolean;
  /** The move gives checkmate. */
  isCheckmate: boolean;
  /** The move is castling (either side). */
  isCastle: boolean;
  /** The move is an en-passant capture. */
  isEnPassant: boolean;
  /** Position before the move (normalised FEN). */
  fenBefore: Fen;
  /** Position after the move (normalised FEN). */
  fenAfter: Fen;
}

/** PGN result. `*` = game still running / unknown. */
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

/**
 * Why a game ended (FIDE Laws 2023, RULES.md §5).
 * Automatic ends: `checkmate` (5.1.1), `stalemate` (5.2.1), `insufficient_material` (dead position subset, 5.2.2, D-05),
 * `fivefold_repetition` (9.6.1), `seventyfive_moves` (9.6.2).
 * Claims: `threefold_repetition_claim` (9.2), `fifty_moves_claim` (9.3).
 * Other: `resignation` (5.1.2 – a draw when the opponent cannot mate), `timeout` (6.9), `timeout_vs_insufficient_material`
 * (6.9 – draw because the opponent cannot mate), `aborted`.
 */
export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'fivefold_repetition'
  | 'seventyfive_moves'
  | 'threefold_repetition_claim'
  | 'fifty_moves_claim'
  | 'resignation'
  | 'timeout'
  | 'timeout_vs_insufficient_material'
  | 'aborted';

/** Draws that must be claimed (FIDE 9.2 / 9.3) – never automatic. */
export type DrawClaim = 'threefold_repetition' | 'fifty_moves';

/** Game state after the last move, computed per FIDE by `ChessGame.status()` (D-04). */
export interface GameStatus {
  /** The game has ended (automatically or by claim/resignation/timeout). */
  isOver: boolean;
  /** Result; `*` while the game is running. */
  result: GameResult;
  /** End reason, `null` while running. */
  reason: GameEndReason | null;
  /** Side to move. */
  turn: Color;
  /** Side to move is in check. */
  inCheck: boolean;
  /**
   * Draw claims available on the current position (empty when the game is over). The side to move may claim
   * (9.2.1.2 / 9.3.2); the side that has just moved may claim it as its declared move (9.2.1.1 / 9.3.1, RULES §5.2).
   */
  claimableDraws: DrawClaim[];
}

/** Arrow drawn on the board. `kind` selects the colour token (DESIGN §2.2). */
export interface Arrow {
  from: Square;
  to: Square;
  /** `user` right-drag (orange), `best` engine/better move (green), `threat` coach threat (red), `hint` lesson/hint (blue), `played` the move played. */
  kind: 'user' | 'best' | 'threat' | 'hint' | 'played';
}

/** Highlight on a square (DESIGN §4.4). */
export interface SquareMark {
  square: Square;
  /** `user` right-click mark, `hint-piece`/`hint-target` hint stages, `danger` threatened/wrong, `selected`, `last-move`, `check`. */
  kind: 'user' | 'hint-piece' | 'hint-target' | 'danger' | 'selected' | 'last-move' | 'check';
}
