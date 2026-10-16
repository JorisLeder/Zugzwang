/**
 * Opening repertoire (PRD "Alle Bots spielen die ersten Züge aus ihrem Eröffnungsrepertoire"): while the game still
 * follows one of the bot's lines for its colour, the bot plays the line's next move (random among matching lines).
 * Lines are English SAN from the standard start position; games from another start position never use the book.
 */
import type { BotProfile } from '@/core/bots';
import type { Color, Fen, San, Uci } from '@/core/chess';
import { START_FEN } from '@/core/chess';
import { ChessGame, positionKey, sanToUci } from '@/lib/chess';
import { pickOne, type RandomSource } from './random';

/** Repertoire lines of `bot` for `color`. */
export function repertoireLines(bot: BotProfile, color: Color): San[][] {
  return color === 'w' ? bot.repertoire.white : bot.repertoire.black;
}

/** Whether `fen` is the standard start position (move counters ignored). */
export function isStandardStart(fen: Fen): boolean {
  try {
    return positionKey(ChessGame.fromFen(fen).fen()) === positionKey(START_FEN);
  } catch {
    return false;
  }
}

/**
 * Next book moves (SAN) for the side to move after `history` (SAN of the moves played from the start position):
 * the next move of every line that starts with exactly `history`. Duplicates are kept (more lines = more likely).
 */
export function nextBookMoves(lines: readonly San[][], history: readonly San[]): San[] {
  const out: San[] = [];
  for (const line of lines) {
    if (line.length <= history.length) continue;
    if (history.every((san, i) => line[i] === san)) out.push(line[history.length]!);
  }
  return out;
}

/**
 * The bot's book move for a game (`startFen` + UCI `moves`), or `null` when the game left the repertoire, did not start
 * from the standard position, or the line's move is not legal here (defensive – the validator checks the lines).
 */
export function repertoireMove(bot: BotProfile, startFen: Fen, moves: readonly Uci[], random: RandomSource): Uci | null {
  if (!isStandardStart(startFen)) return null;
  let game: ChessGame;
  try {
    game = ChessGame.fromMoves(startFen, moves);
  } catch {
    return null;
  }
  if (game.status().isOver) return null;
  const history = game.history().map((r) => r.san);
  const candidates = nextBookMoves(repertoireLines(bot, game.turn()), history);
  const san = pickOne(candidates, random);
  if (!san) return null;
  return sanToUci(game.fen(), san);
}
