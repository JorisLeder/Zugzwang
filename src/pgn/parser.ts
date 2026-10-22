/**
 * `parsePgnWithDiagnostics(text)` – PGN import (P0-15) with German error messages that name the line.
 *
 * Supported: tag pairs, `{}` and `;` comments, `%` escape lines, NAGs and `!`/`?` suffixes, `( … )` variations
 * (skipped – only the main line is imported), `SetUp`/`FEN` start positions, promotions (`e8=Q`, also `e8Q`),
 * castling with `O` or `0`, all results (`1-0`, `0-1`, `1/2-1/2`, `*`), several games in one text, BOM and CRLF.
 * Moves written with German piece letters (K D T L S) are accepted as a fallback.
 *
 * Every move goes through `@/lib/chess` (chess.js, FIDE rules): a move that is illegal or comes after the end of the
 * game (mate, stalemate, dead position, fivefold repetition, 75-move rule) is an error with line, column, move
 * number and side, e.g. "Zeile 12: Ungültiger Zug „Nf9“ (Zug 23, Weiß). …".
 */
import { START_FEN, type Fen, type GameResult, type GameStatus, type MoveRecord } from '@/core/chess';
import { ChessGame, ChessRulesError, sanFromDisplay } from '@/lib/chess';
import { PGN_DE } from './strings.de';
import { tokenizePgn, type PgnPosition, type PgnToken } from './tokenizer';

/** A parse problem: 1-based line and column plus a German message that starts with "Zeile {line}: ". */
export interface PgnDiagnostic extends PgnPosition {
  messageDe: string;
  /** 0-based index of the game the problem belongs to (absent for problems before the first game). */
  gameIndex?: number;
}

/** One parsed game (main line only). */
export interface PgnGame {
  /** 0-based position of the game in the text. */
  index: number;
  /** Line where the game starts (first tag or first move). */
  line: number;
  /** Tag pairs as written (the last one wins for duplicates); `Result` is set to `result`. */
  headers: Record<string, string>;
  /** Start position (normalised): the `FEN` tag or the standard initial position. */
  startFen: Fen;
  /** Main line as played, with English SAN and UCI. */
  moves: MoveRecord[];
  /**
   * Result: an automatic game end in the final position (checkmate, stalemate, …) wins, then the termination marker
   * in the movetext, then the `Result` tag, else `*`.
   */
  result: GameResult;
  /** FIDE status of the final position. */
  status: GameStatus;
  /** Clean PGN of the main line (tags, English SAN, `O-O`; no comments, NAGs or variations). */
  pgn: string;
}

/** Result of `parsePgnWithDiagnostics`. */
export type PgnParseResult = { ok: true; games: PgnGame[] } | { ok: false; error: PgnDiagnostic };

/** Limits of one import (the `games-import` contract allows 1 000 000 characters). */
export const PGN_LIMITS = { maxChars: 1_000_000, maxGames: 100 } as const;

const RESULT_TAGS: readonly GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];
const STANDARD_VARIANTS = new Set(['', 'standard', 'chess', 'from position', 'fromposition', 'normal']);

class PgnError extends Error {
  constructor(
    readonly at: PgnPosition,
    readonly detail: string,
  ) {
    super(detail);
  }
}

function sideDe(color: 'w' | 'b'): string {
  return color === 'w' ? PGN_DE.white : PGN_DE.black;
}

/** Full-move number and side to move of the current position (for error messages). */
function moveContext(game: ChessGame): { moveNumber: number; side: string } {
  const fen = game.fen().split(' ');
  return { moveNumber: Number(fen[5] ?? '1') || 1, side: sideDe(game.turn()) };
}

/** Plays a SAN token: English SAN first (chess.js is lenient: `e8Q`, `0-0`, missing `+`), then German letters. */
function playSan(game: ChessGame, san: string): MoveRecord | null {
  const clean = san.replace(/[!?]+$/, '');
  const english = game.move(clean);
  if (english) return english;
  const german = sanFromDisplay(clean);
  return german !== clean ? game.move(german) : null;
}

/** Parses one game starting at `tokens[start]`; returns the game and the index after it. */
function parseGame(tokens: PgnToken[], start: number, index: number): { game: PgnGame | null; next: number } {
  let i = start;
  const headers: Record<string, string> = {};
  const tagLines: Record<string, PgnPosition> = {};
  const first = tokens[start];
  const startLine = first?.line ?? 1;

  const hasTagSection = tokens[start]?.type === 'tagOpen';

  // Tag pair section.
  while (tokens[i]?.type === 'tagOpen') {
    const open = tokens[i]!;
    const name = tokens[i + 1];
    if (name?.type !== 'symbol') throw new PgnError(open, PGN_DE.tagMissingName);
    const value = tokens[i + 2];
    if (value?.type !== 'string') throw new PgnError(name, PGN_DE.tagMissingValue(name.value));
    const close = tokens[i + 3];
    if (close?.type !== 'tagClose') throw new PgnError(value, PGN_DE.tagMissingClose(name.value));
    // chess.js reads tag names of letters only: "Time-Control", "Opening:Name", "Eco_Code" or "Tag2" would make the
    // stored pgn unreadable for the review, so such tags are skipped (not stored, not written back).
    if (/^[A-Za-z]+$/.test(name.value)) {
      headers[name.value] = value.value;
      tagLines[name.value] = { line: open.line, column: open.column };
    }
    i += 4;
    while (tokens[i]?.type === 'comment') i += 1;
  }

  const variant = (headers.Variant ?? '').trim();
  if (!STANDARD_VARIANTS.has(variant.toLowerCase())) {
    throw new PgnError(tagLines.Variant ?? first ?? { line: 1, column: 1 }, PGN_DE.unsupportedVariant(variant));
  }

  let game: ChessGame;
  const fenTag = headers.FEN?.trim();
  if (fenTag) {
    try {
      game = ChessGame.fromFen(fenTag);
    } catch (e) {
      const detail = e instanceof ChessRulesError ? e.messageDe : String(e);
      throw new PgnError(tagLines.FEN ?? { line: startLine, column: 1 }, PGN_DE.invalidFen(detail));
    }
  } else {
    game = ChessGame.fromFen(START_FEN);
  }

  // Movetext.
  let marker: GameResult | null = null;
  let sawMovetext = false;
  let depth = 0;
  const openVariations: PgnToken[] = [];
  for (; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    if (t.type === 'comment' || t.type === 'nag' || t.type === 'period') continue;
    if (t.type === 'varOpen') {
      depth += 1;
      openVariations.push(t);
      continue;
    }
    if (t.type === 'varClose') {
      if (depth === 0) throw new PgnError(t, PGN_DE.unexpectedCloseVariation);
      depth -= 1;
      openVariations.pop();
      continue;
    }
    if (depth > 0) {
      // Inside a variation: only the structure is checked, moves are not imported.
      if (t.type === 'tagOpen') throw new PgnError(openVariations[openVariations.length - 1]!, PGN_DE.unclosedVariation);
      continue;
    }
    if (t.type === 'result') {
      marker = t.value;
      sawMovetext = true;
      i += 1;
      break;
    }
    if (t.type === 'tagOpen') {
      // A new tag section without a termination marker: the previous game ends here (lenient).
      if (!sawMovetext) throw new PgnError(t, PGN_DE.tagAfterMoves);
      break;
    }
    if (t.type === 'tagClose') throw new PgnError(t, PGN_DE.unexpectedBracket);
    if (t.type === 'string') throw new PgnError(t, PGN_DE.unexpectedString);
    if (t.type !== 'symbol') continue;
    // Symbol: move number or SAN.
    if (!sawMovetext && !hasTagSection && !fenTag && /^\d+$/.test(t.value) && Number(t.value) !== 1) {
      // Movetext without tags that does not start at move 1: leftover moves after a result marker, not a game.
      throw new PgnError(t, PGN_DE.strayMovetext(t.value));
    }
    sawMovetext = true;
    if (/^\d+$/.test(t.value)) continue;
    if (t.value === '--' || t.value === 'Z0' || t.value === '0000') {
      const ctx = moveContext(game);
      throw new PgnError(t, PGN_DE.nullMove(ctx.moveNumber, ctx.side));
    }
    const status = game.status();
    if (status.isOver) {
      const reason = (status.reason && PGN_DE.endReasons[status.reason]) || PGN_DE.endReasonFallback;
      throw new PgnError(t, PGN_DE.moveAfterEnd(t.value, reason));
    }
    const ctx = moveContext(game);
    if (!playSan(game, t.value)) throw new PgnError(t, PGN_DE.invalidMove(t.value, ctx.moveNumber, ctx.side));
  }
  if (depth > 0) throw new PgnError(openVariations[openVariations.length - 1]!, PGN_DE.unclosedVariation);

  const hasContent = Object.keys(headers).length > 0 || sawMovetext;
  if (!hasContent) return { game: null, next: i };

  const status = game.status();
  const tagResult = RESULT_TAGS.find((r) => r === headers.Result?.trim()) ?? null;
  const result: GameResult = status.isOver && status.result !== '*' ? status.result : (marker ?? tagResult ?? '*');
  const finalHeaders: Record<string, string> = { ...headers, Result: result };
  return {
    game: {
      index,
      line: startLine,
      headers: finalHeaders,
      startFen: game.startFen(),
      moves: game.history(),
      result,
      status,
      pgn: game.pgn(finalHeaders),
    },
    next: i,
  };
}

/**
 * Parses PGN text into games (main lines) or returns the first problem with line, column and a German message
 * (see the file header). Never throws.
 */
export function parsePgnWithDiagnostics(text: string): PgnParseResult {
  const fail = (at: PgnPosition, detail: string, gameIndex?: number): PgnParseResult => ({
    ok: false,
    error: { line: at.line, column: at.column, messageDe: `${PGN_DE.at(at.line)}${detail}`, ...(gameIndex !== undefined ? { gameIndex } : {}) },
  });
  if (text.length > PGN_LIMITS.maxChars) return fail({ line: 1, column: 1 }, PGN_DE.tooLarge(Math.round(PGN_LIMITS.maxChars / 1000)));
  if (text.replace(/^\uFEFF/, '').trim() === '') return fail({ line: 1, column: 1 }, PGN_DE.empty);

  const tokenized = tokenizePgn(text);
  if (!tokenized.ok) return fail(tokenized.error, tokenized.error.messageDe);
  const { tokens } = tokenized;

  const games: PgnGame[] = [];
  let i = 0;
  while (i < tokens.length) {
    // Comments between games are ignored.
    while (tokens[i]?.type === 'comment') i += 1;
    if (i >= tokens.length) break;
    if (games.length >= PGN_LIMITS.maxGames) return fail(tokens[i]!, PGN_DE.tooManyGames(PGN_LIMITS.maxGames), games.length);
    try {
      const { game, next } = parseGame(tokens, i, games.length);
      if (game) games.push(game);
      i = next > i ? next : i + 1;
    } catch (e) {
      if (e instanceof PgnError) return fail(e.at, e.detail, games.length);
      throw e;
    }
  }
  if (games.length === 0) return fail({ line: 1, column: 1 }, PGN_DE.noGame);
  return { ok: true, games };
}
