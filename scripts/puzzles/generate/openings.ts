/**
 * Varied opening lines for the self-play games: a seeded random walk through the Lichess opening book
 * (`src/analysis/openings/openings.json`, CC0). From the start position the walk picks, at every ply, one of the legal
 * moves whose resulting position is a named book position, until the planned length is reached or the book ends.
 */
import { START_FEN, type Fen, type Uci } from '@/core/chess';
import type { OpeningBook, OpeningInfo } from '@/analysis';
import { ChessGame } from '@/lib/chess';
import { randInt, type Rng } from './rng';

/** A book line. */
export interface OpeningLine {
  /** Moves from the start position (UCI). */
  moves: Uci[];
  /** Deepest named book position of the line (`null` for an empty line). */
  opening: OpeningInfo | null;
  /** Number of plies for which the game was still in the book (= `moves.length`). */
  bookPlies: number;
}

/**
 * Seeded random book line of `minPlies`–`maxPlies` plies (shorter when the book ends earlier).
 * Candidate moves are ordered by UCI before the pick, so the result depends only on the RNG state.
 */
export function randomBookLine(book: Pick<OpeningBook, 'get'>, rng: Rng, minPlies: number, maxPlies: number, start: Fen = START_FEN): OpeningLine {
  const target = randInt(rng, minPlies, maxPlies);
  const game = ChessGame.fromFen(start);
  const moves: Uci[] = [];
  let opening: OpeningInfo | null = null;
  while (moves.length < target) {
    const options: Array<{ uci: Uci; info: OpeningInfo }> = [];
    for (const m of game.legalMoves()) {
      const rec = game.move(m.uci);
      if (!rec) continue;
      const info = book.get(game.fen());
      game.undo();
      if (info) options.push({ uci: rec.uci, info });
    }
    if (options.length === 0) break;
    options.sort((a, b) => a.uci.localeCompare(b.uci));
    const chosen = options[Math.floor(rng() * options.length)]!;
    game.move(chosen.uci);
    moves.push(chosen.uci);
    opening = chosen.info;
  }
  return { moves, opening, bookPlies: moves.length };
}
