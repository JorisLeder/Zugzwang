/**
 * `ChessGame` – the app's only rules layer (BACKLOG 2.7, D-04, RULES.md §5). Thin wrapper over chess.js that adds
 * the FIDE game-end rules chess.js lacks or gets wrong:
 *
 * - Game end check after every move, in this order (RULES §5.1): checkmate (5.1.1, beats 9.3/9.6.2) → stalemate
 *   (5.2.1) → insufficient material (5.2.2 subset, D-05) → fivefold repetition (9.6.1) → 75-move rule (9.6.2,
 *   half-move clock ≥ 150) → claims: threefold repetition (9.2) and 50-move rule (9.3, clock ≥ 100).
 * - chess.js `isGameOver()`/`isDraw()` are never used: they end the game on threefold repetition and at clock 100.
 * - Repetition key = first four FEN fields of chess.js `fen()` (it lists the e.p. square only when an e.p. capture is
 *   legal, which matches 9.2.2). The count includes the start position.
 * - Every FEN entry point is normalised (castling flags, e.p. square) and validated (RULES §5.4).
 * - Resuming = replaying all moves from the start FEN (`fromMoves`), so the repetition history is kept.
 */
import { Chess, type Move as ChessJsMove } from 'chess.js';
import type {
  Color,
  DrawClaim,
  Fen,
  GameEndReason,
  GameResult,
  GameStatus,
  MoveInput,
  MoveRecord,
  PieceSymbol,
  PromotionPiece,
  San,
  Square,
  Uci,
} from '@/core/chess';
import { START_FEN } from '@/core/chess';
import { fenFullmoveNumber, fenHalfmoveClock, normalizeFen, positionKey, validateFen } from './fen';
import { cannotMate } from './material';
import { parseUci } from './notation';

/** Thrown by `fromFen`/`fromMoves`/`fromPgn` on invalid input. `messageDe` is a German message for the learner. */
export class ChessRulesError extends Error {
  /** German message. */
  readonly messageDe: string;
  constructor(messageDe: string, detail?: string) {
    super(detail ? `${messageDe} (${detail})` : messageDe);
    this.name = 'ChessRulesError';
    this.messageDe = messageDe;
  }
}

/** A legal move in the current position (`legalMoves`). */
export interface LegalMove extends MoveInput {
  san: San;
  uci: Uci;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  isCapture: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
  isPromotion: boolean;
}

/** Manual game end (resignation, accepted claim, flag fall). */
interface ManualEnd {
  result: GameResult;
  reason: GameEndReason;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** A game from a start position with FIDE-correct status, repetition history and PGN export (see file header). */
export class ChessGame {
  private readonly chess: Chess;
  private readonly initialFen: Fen;
  private readonly records: MoveRecord[] = [];
  /** keys[0] = start position, keys[i] = position after ply i. */
  private readonly keys: string[];
  private manualEnd: ManualEnd | null = null;
  private readonly tags: Record<string, string> = {};

  private constructor(startFen: Fen) {
    this.initialFen = startFen;
    this.chess = new Chess(startFen);
    this.keys = [positionKey(this.chess.fen())];
  }

  /**
   * New game from a FEN (normalised and validated, RULES §5.4). Throws `ChessRulesError` with a German message for
   * illegal positions (use `validateFen` first to show the message without try/catch).
   */
  static fromFen(fen: Fen = START_FEN): ChessGame {
    let normalized: Fen;
    try {
      normalized = normalizeFen(fen);
    } catch {
      throw new ChessRulesError('Die FEN ist ungültig.', fen);
    }
    const v = validateFen(normalized);
    if (!v.ok) throw new ChessRulesError(v.errorDe, fen);
    return new ChessGame(normalized);
  }

  /**
   * Replays a game from `startFen` (keeps the repetition history – use this to resume, RULES §0 row 14).
   * Throws `ChessRulesError` naming the first illegal move.
   */
  static fromMoves(startFen: Fen, uciMoves: readonly Uci[]): ChessGame {
    const game = ChessGame.fromFen(startFen);
    uciMoves.forEach((uci, i) => {
      if (!game.move(uci)) {
        throw new ChessRulesError(`Zug ${i + 1} („${uci}“) ist in dieser Stellung nicht erlaubt.`, uci);
      }
    });
    return game;
  }

  /**
   * Loads the main line of a PGN (start position from the `FEN` tag if present). Tags are kept and written back by
   * `pgn()`. A result tag alone does not end the game (the reason is unknown); use `resign`/`claimDraw` for that.
   */
  static fromPgn(pgn: string): ChessGame {
    const parser = new Chess();
    try {
      parser.loadPgn(pgn);
    } catch (e) {
      throw new ChessRulesError('Die PGN konnte nicht gelesen werden.', e instanceof Error ? e.message : String(e));
    }
    const headers = parser.getHeaders();
    const startFen = headers.FEN ?? START_FEN;
    const moves = parser.history({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion ?? ''}`);
    const game = ChessGame.fromMoves(startFen, moves);
    for (const [k, v] of Object.entries(headers)) if (v != null) game.tags[k] = v;
    return game;
  }

  /** Start position (normalised). */
  startFen(): Fen {
    return this.initialFen;
  }

  /** Current position. */
  fen(): Fen {
    return this.chess.fen();
  }

  /** Side to move. */
  turn(): Color {
    return this.chess.turn();
  }

  /** Number of half-moves played from the start position. */
  ply(): number {
    return this.records.length;
  }

  /** Moves played, in order. */
  history(): MoveRecord[] {
    return [...this.records];
  }

  /** Moves played as UCI (e.g. for `GameMoveEvent`s and analysis input). */
  uciMoves(): Uci[] {
    return this.records.map((r) => r.uci);
  }

  /** The last move, or `null` at the start. */
  lastMove(): MoveRecord | null {
    return this.records[this.records.length - 1] ?? null;
  }

  /** Piece on a square, or `null`. */
  pieceAt(square: Square): { type: PieceSymbol; color: Color } | null {
    const p = this.chess.get(square);
    return p ? { type: p.type, color: p.color } : null;
  }

  /** Legal moves (optionally of the piece on `square`). Empty when the game is over. */
  legalMoves(square?: Square): LegalMove[] {
    if (this.status().isOver) return [];
    const moves = square ? this.chess.moves({ square, verbose: true }) : this.chess.moves({ verbose: true });
    return moves.map((m) => toLegalMove(m));
  }

  /**
   * Plays a move given as UCI (`e7e8q`), SAN (`Nf3`, `O-O`, also `0-0`) or `MoveInput`. Returns the record, or `null`
   * if the move is illegal, malformed, lacks the promotion piece (no auto-queen), names a promotion for a
   * non-promotion move, or the game is already over. Never throws.
   */
  move(input: Uci | San | MoveInput): MoveRecord | null {
    if (this.status().isOver) return null;
    let request: { from: string; to: string; promotion?: string } | string;
    let promotionRequested: PromotionPiece | undefined;
    if (typeof input === 'string') {
      const uci = parseUci(input);
      if (uci) {
        request = uci;
        promotionRequested = uci.promotion;
      } else {
        request = input.trim();
      }
    } else {
      request = { from: input.from, to: input.to, ...(input.promotion ? { promotion: input.promotion } : {}) };
      promotionRequested = input.promotion;
    }
    const fenBefore = this.chess.fen();
    let m: ChessJsMove;
    try {
      m = this.chess.move(request);
    } catch {
      return null;
    }
    if (promotionRequested && !m.promotion) {
      // chess.js silently ignores a promotion piece on a non-promotion move – we treat it as malformed.
      this.chess.undo();
      return null;
    }
    const fenAfter = this.chess.fen();
    const ply = this.records.length + 1;
    const startTurn = this.initialFen.split(' ')[1] === 'b' ? 1 : 0;
    const record: MoveRecord = {
      ply,
      moveNumber: fenFullmoveNumber(this.initialFen) + Math.floor((ply - 1 + startTurn) / 2),
      color: m.color,
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion ?? ''}`,
      from: m.from,
      to: m.to,
      piece: m.piece,
      fenBefore,
      fenAfter,
      isCheck: m.san.includes('+') || m.san.includes('#'),
      isCheckmate: m.san.includes('#'),
      isCastle: m.isKingsideCastle() || m.isQueensideCastle(),
      isEnPassant: m.isEnPassant(),
    };
    if (m.captured) record.captured = m.captured;
    if (m.promotion) record.promotion = m.promotion as PromotionPiece;
    this.records.push(record);
    this.keys.push(positionKey(fenAfter));
    return record;
  }

  /** Takes back the last move (also clears a resignation/claim/flag-fall end). Returns the removed record. */
  undo(): MoveRecord | null {
    this.manualEnd = null;
    if (this.records.length === 0) return null;
    this.chess.undo();
    this.keys.pop();
    return this.records.pop() ?? null;
  }

  /** How often the current position has occurred so far (including now), per FIDE 9.2.2. */
  repetitionCount(): number {
    const key = this.keys[this.keys.length - 1];
    return this.keys.filter((k) => k === key).length;
  }

  /** Game state per FIDE (see file header). */
  status(): GameStatus {
    const turn = this.chess.turn();
    const inCheck = this.chess.inCheck();
    const end = this.manualEnd ?? this.automaticEnd();
    if (end) return { isOver: true, result: end.result, reason: end.reason, turn, inCheck, claimableDraws: [] };
    const claimableDraws: DrawClaim[] = [];
    if (this.repetitionCount() >= 3) claimableDraws.push('threefold_repetition');
    if (fenHalfmoveClock(this.chess.fen()) >= 100) claimableDraws.push('fifty_moves');
    return { isOver: false, result: '*', reason: null, turn, inCheck, claimableDraws };
  }

  private automaticEnd(): ManualEnd | null {
    if (this.chess.isCheckmate()) return { result: this.chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
    if (this.chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
    if (this.chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient_material' };
    if (this.repetitionCount() >= 5) return { result: '1/2-1/2', reason: 'fivefold_repetition' };
    if (fenHalfmoveClock(this.chess.fen()) >= 150) return { result: '1/2-1/2', reason: 'seventyfive_moves' };
    return null;
  }

  /** Ends the game as a draw if `kind` is currently claimable (9.2/9.3). Returns whether the claim was accepted. */
  claimDraw(kind: DrawClaim): boolean {
    const s = this.status();
    if (s.isOver || !s.claimableDraws.includes(kind)) return false;
    this.manualEnd = {
      result: '1/2-1/2',
      reason: kind === 'threefold_repetition' ? 'threefold_repetition_claim' : 'fifty_moves_claim',
    };
    return true;
  }

  /**
   * `color` resigns. FIDE 5.1.2 (2023): the game is lost, unless the opponent cannot checkmate by any series of
   * legal moves – then it is a draw (reason stays `resignation`, result `1/2-1/2`). No effect if the game is over.
   */
  resign(color: Color): GameStatus {
    if (!this.status().isOver) {
      const winner = other(color);
      const draw = cannotMate(this.chess.fen(), winner);
      this.manualEnd = { result: draw ? '1/2-1/2' : winner === 'w' ? '1-0' : '0-1', reason: 'resignation' };
    }
    return this.status();
  }

  /**
   * `color`'s time ran out (FIDE 6.9, clocks are P1-06): lost, unless the opponent cannot checkmate – then a draw
   * (`timeout_vs_insufficient_material`). No effect if the game already ended (5.1.1/5.2 take precedence).
   */
  flagFall(color: Color): GameStatus {
    if (!this.status().isOver) {
      const winner = other(color);
      this.manualEnd = cannotMate(this.chess.fen(), winner)
        ? { result: '1/2-1/2', reason: 'timeout_vs_insufficient_material' }
        : { result: winner === 'w' ? '1-0' : '0-1', reason: 'timeout' };
    }
    return this.status();
  }

  /** PGN tags loaded by `fromPgn`. */
  headers(): Record<string, string> {
    return { ...this.tags };
  }

  /**
   * PGN of the game (castling as `O-O`, the PGN standard). `SetUp`/`FEN` tags are added for non-standard starts and
   * the `Result` tag reflects `status()` (or the given header).
   */
  pgn(headers: Record<string, string> = {}): string {
    const out = new Chess(this.initialFen);
    const merged: Record<string, string> = { ...this.tags, ...headers };
    if (this.initialFen !== START_FEN) {
      merged.SetUp = '1';
      merged.FEN = this.initialFen;
    } else {
      delete merged.SetUp;
      delete merged.FEN;
    }
    const status = this.status();
    if (!headers.Result) merged.Result = status.result;
    for (const [k, v] of Object.entries(merged)) out.setHeader(k, v);
    for (const r of this.records) out.move({ from: r.from, to: r.to, ...(r.promotion ? { promotion: r.promotion } : {}) });
    return out.pgn();
  }
}

function toLegalMove(m: ChessJsMove): LegalMove {
  const lm: LegalMove = {
    from: m.from,
    to: m.to,
    san: m.san,
    uci: `${m.from}${m.to}${m.promotion ?? ''}`,
    piece: m.piece,
    isCapture: m.isCapture() || m.isEnPassant(),
    isCastle: m.isKingsideCastle() || m.isQueensideCastle(),
    isEnPassant: m.isEnPassant(),
    isPromotion: m.isPromotion(),
  };
  if (m.captured) lm.captured = m.captured;
  if (m.promotion) lm.promotion = m.promotion as PromotionPiece;
  return lm;
}
