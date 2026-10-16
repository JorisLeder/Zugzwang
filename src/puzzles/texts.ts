/**
 * German task and hint texts of a puzzle (DESIGN §8.1, §9.2): "Weiß am Zug. Finde den besten Zug.",
 * "Schau dir deinen Springer auf f3 an.", "Er will nach e5." and the motif hint for Lernmodus ("Denk an eine Gabel.").
 */
import type { Fen, Square } from '@/core/chess';
import { PUZZLE_THEMES, type Puzzle } from '@/core/puzzles';
import { ChessGame } from '@/lib/chess';
import { puzzleMateLength, solverColor } from './check';
import { MOTIF_HINTS_DE, PUZZLE_DOMAIN_DE } from './strings.de';

/** "Weiß am Zug" / "Schwarz am Zug" for the solver of the puzzle. */
export function sideToMoveDe(puzzle: Pick<Puzzle, 'fen'>): string {
  return PUZZLE_DOMAIN_DE.sideToMove(solverColor(puzzle) === 'w');
}

/** Task line: "Weiß am Zug. Finde den besten Zug." or, for mate puzzles, "Schwarz am Zug. Setze matt in 2 Zügen." */
export function taskTextDe(puzzle: Pick<Puzzle, 'fen' | 'moves' | 'themes'>): string {
  const white = solverColor(puzzle) === 'w';
  const mate = puzzleMateLength(puzzle);
  return mate ? PUZZLE_DOMAIN_DE.taskMate(white, mate) : PUZZLE_DOMAIN_DE.taskBest(white);
}

/** Motif hint for the puzzle's most specific motif, or `null` (DESIGN §8.1 stage 1 in Lernmodus). */
export function motifHintDe(puzzle: Pick<Puzzle, 'themes'>): string | null {
  for (const theme of PUZZLE_THEMES) {
    if (puzzle.themes.includes(theme.id) && MOTIF_HINTS_DE[theme.id]) return MOTIF_HINTS_DE[theme.id]!;
  }
  return puzzle.themes.some((t) => t.startsWith('mateIn')) ? MOTIF_HINTS_DE.mate! : null;
}

/**
 * Hint text for the solver move `uci` in position `fen` at `stage` (1: piece, 2: target square, 3: solution).
 * `withMotif` adds the motif hint at stage 1 (Lernmodus, Themen-Training).
 */
export function hintTextDe(fen: Fen, uci: string, stage: 1 | 2 | 3, opts: { motif?: string | null } = {}): string {
  if (stage === 3) return PUZZLE_DOMAIN_DE.hintSolution;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4);
  let piece: ReturnType<ChessGame['pieceAt']> = null;
  try {
    piece = ChessGame.fromFen(fen).pieceAt(from);
  } catch {
    piece = null;
  }
  const type = piece?.type ?? 'p';
  if (stage === 1) {
    const text = PUZZLE_DOMAIN_DE.hintPiece(type, from);
    return opts.motif ? `${text} ${opts.motif}` : text;
  }
  return PUZZLE_DOMAIN_DE.hintTarget(type, to);
}
