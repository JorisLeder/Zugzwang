/**
 * `@/lib/chess` – the only rules layer (wraps chess.js; FIDE Laws 2023 per RULES.md). Frozen (WP-00).
 * Never import chess.js elsewhere (enforced by ESLint).
 */
export {
  attackersOf,
  boardPieces,
  buildFen,
  isSquareAttacked,
  kingSquare,
  nullMoveFen,
  parseFen,
  type BoardPiece,
  type FenParts,
} from './board';
export { ChessGame, ChessRulesError, type LegalMove } from './game';
export {
  fenFullmoveNumber,
  fenHalfmoveClock,
  fenTurn,
  normalizeFen,
  positionKey,
  validateFen,
  type FenValidation,
} from './fen';
export { cannotMate, materialBalance, pieceCounts, PIECE_VALUES } from './material';
export {
  formatSan,
  isUci,
  parseUci,
  pieceNameDe,
  sanFromDisplay,
  sanToUci,
  toUci,
  uciLineToSan,
  uciToSan,
} from './notation';
