/**
 * Explanation after a puzzle (PRD Puzzles "Erklärung nach dem Puzzle", P0-05): the stored German explanation
 * (`puzzle.explanation`, 1–3 sentences) or, if missing, the rule-based explanation from the puzzle facts.
 */
import type { ExplanationFacts, ExplanationService, ExplanationText } from '@/core/explain';
import type { Puzzle } from '@/core/puzzles';
import { uciLineToSan } from '@/lib/chess';
import { puzzleMateLength, puzzleStartFen, solverColor } from './check';

/** Engine-confirmed facts of a puzzle for `explainRuleBased({ kind: 'puzzle', … })`. */
export function puzzleFacts(puzzle: Puzzle): ExplanationFacts {
  const fenBefore = puzzleStartFen(puzzle);
  const solution = puzzle.moves.slice(1);
  const san = uciLineToSan(fenBefore, solution);
  const facts: ExplanationFacts = {
    kind: 'puzzle',
    mover: solverColor(puzzle),
    fenBefore,
    bestLine: san,
    refutation: [],
    motifs: [],
    themes: [...puzzle.themes],
  };
  if (solution[0] && san[0]) facts.bestMove = { uci: solution[0], san: san[0] };
  const mate = puzzleMateLength(puzzle);
  if (mate) facts.mateIn = mate;
  return facts;
}

/** Stored explanation, else the rule-based one (never throws; `null` only if even that fails). */
export function puzzleExplanation(
  puzzle: Puzzle,
  explain: Pick<ExplanationService, 'explainRuleBased'>,
): ExplanationText | null {
  if (puzzle.explanation) return puzzle.explanation;
  try {
    return explain.explainRuleBased(puzzleFacts(puzzle));
  } catch (e) {
    console.warn('Puzzle explanation failed', e);
    return null;
  }
}
