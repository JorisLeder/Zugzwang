/**
 * Puzzle move checking (PRD Puzzles "Ablauf", D-12, D-24).
 *
 * Lichess format: `puzzle.fen` is the position before the opponent's first move, `moves[0]` is that move, then the
 * solver and the opponent alternate. The solver makes `moves[1]`, `moves[3]`, …
 * A user move is accepted when it equals the solution move **or when it delivers checkmate** (every mating move counts,
 * PRD "Gibt es mehrere Mattzüge, gilt jeder als richtig").
 */
import type { Color, Fen, MoveRecord, Uci } from '@/core/chess';
import type { Puzzle } from '@/core/puzzles';
import { ChessGame, fenTurn } from '@/lib/chess';

/** Result of checking a user move: the solution move, another checkmating move, or wrong. */
export type PuzzleMoveVerdict = 'correct' | 'mate' | 'wrong';

/** Side that solves the puzzle: the side to move after the opponent's first move. */
export function solverColor(puzzle: Pick<Puzzle, 'fen'>): Color {
  return fenTurn(puzzle.fen) === 'w' ? 'b' : 'w';
}

/** `true` if `ply` (index into `puzzle.moves`) is a move of the solver. */
export function isUserPly(ply: number): boolean {
  return ply % 2 === 1;
}

/** Number of moves the solver has to find. */
export function userMoveCount(puzzle: Pick<Puzzle, 'moves'>): number {
  return Math.floor(puzzle.moves.length / 2);
}

/** Replays the first `ply` moves of the puzzle line. Throws `ChessRulesError` on an illegal FEN or move. */
export function puzzleGameAt(puzzle: Pick<Puzzle, 'fen' | 'moves'>, ply: number): ChessGame {
  return ChessGame.fromMoves(puzzle.fen, puzzle.moves.slice(0, ply));
}

/** The task position: after the opponent's first move (`moves[0]`). */
export function puzzleStartFen(puzzle: Pick<Puzzle, 'fen' | 'moves'>): Fen {
  return puzzleGameAt(puzzle, 1).fen();
}

/** Number of the mate the solver delivers (user moves) if the puzzle is a mate puzzle, else `null`. */
export function puzzleMateLength(puzzle: Pick<Puzzle, 'themes' | 'moves'>): number | null {
  const isMate = puzzle.themes.some((t) => t === 'mate' || /^mateIn\d$/.test(t));
  return isMate ? userMoveCount(puzzle) : null;
}

/**
 * Checks the user's move `uci` at `ply` (a solver ply) in position `fen` (the position after `ply` line moves).
 * Returns the verdict and the move record (`null` for an illegal move, which counts as wrong).
 */
export function checkPuzzleMove(
  puzzle: Pick<Puzzle, 'moves'>,
  ply: number,
  fen: Fen,
  uci: Uci,
): { verdict: PuzzleMoveVerdict; record: MoveRecord | null } {
  let record: MoveRecord | null = null;
  try {
    record = ChessGame.fromFen(fen).move(uci);
  } catch {
    record = null;
  }
  if (!record || !isUserPly(ply) || ply >= puzzle.moves.length) return { verdict: 'wrong', record };
  const expected = puzzle.moves[ply]!.toLowerCase();
  if (record.uci === expected) return { verdict: 'correct', record };
  if (record.isCheckmate) return { verdict: 'mate', record };
  return { verdict: 'wrong', record };
}
