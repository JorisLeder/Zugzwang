/**
 * Turns confirmed lines into bank puzzles: id, rating (`rating.ts`), German explanation and the final `Puzzle`.
 *
 * The explanation is generated once with the rule-based templates (`explainRuleBased({ kind: 'puzzle', … })` on the
 * facts of `buildFacts`) and stored with the puzzle (PRD P0-05, data model `puzzles`): 1–3 sentences, "du", moves only
 * from the solution line; tactical motifs are mentioned only when the tagger confirmed them with the line. The
 * generator rejects a puzzle whose explanation fails the validator's structure checks.
 */
import { createHash } from 'node:crypto';
import type { Fen, Uci } from '@/core/chess';
import type { Score } from '@/core/engine';
import type { ExplanationText, MotifId } from '@/core/explain';
import { RATING_DEFAULTS } from '@/core/rating';
import type { Puzzle, PuzzleThemeId } from '@/core/puzzles';
import { buildFacts } from '@/analysis';
import { explainRuleBased } from '@/explain';
import { ChessGame, fenTurn } from '@/lib/chess';
import { estimateRating, ratingFeatures } from './rating';
import type { RawPuzzle } from './selfplay';

/** Stable id of a generated puzzle: `gen-` + 10 hex characters of sha256(fen + moves). */
export function generatedPuzzleId(fen: Fen, moves: readonly Uci[]): string {
  return `gen-${createHash('sha256').update(`${fen}|${moves.join(' ')}`).digest('hex').slice(0, 10)}`;
}

/** Position after the opponent's first move (the solver's puzzle position). */
export function solverStart(fen: Fen, moves: readonly Uci[]): Fen {
  const game = ChessGame.fromFen(fen);
  if (!game.move(moves[0]!)) throw new Error(`illegal first move ${moves[0]!} in ${fen}`);
  return game.fen();
}

/**
 * Tactical motifs that the explanation may only mention when the tagger confirmed them with the line (a pin that a
 * capture creates by accident is not what the puzzle is about).
 */
const MOTIF_NEEDS_THEME: Partial<Record<MotifId, PuzzleThemeId>> = {
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discovered_attack: 'discoveredAttack',
  trapped_piece: 'trappedPiece',
};

/**
 * Stored German explanation of a puzzle line.
 * @param firstScore White-POV score of the best line at the first solver ply (mate lines: derived from `mateIn`).
 */
export function explainPuzzle(fen: Fen, moves: readonly Uci[], themes: readonly PuzzleThemeId[], mateIn: number | null, firstScore?: Score): ExplanationText {
  const start = solverStart(fen, moves);
  const solver = fenTurn(start);
  const bestScore: Score | undefined = mateIn !== null ? { type: 'mate', value: solver === 'w' ? mateIn : -mateIn } : firstScore;
  const facts = buildFacts('puzzle', { fenBefore: start, bestLine: moves.slice(1), ...(bestScore ? { bestScore } : {}), themes: [...themes] });
  facts.motifs = facts.motifs.filter((m) => {
    const theme = MOTIF_NEEDS_THEME[m.id];
    return theme === undefined || themes.includes(theme);
  });
  return explainRuleBased(facts);
}

/** The bank puzzle of a generated line (source `generated`). */
export function toGeneratedPuzzle(raw: RawPuzzle): Puzzle {
  const id = generatedPuzzleId(raw.fen, raw.moves);
  const rating = estimateRating(ratingFeatures(raw.fen, raw.moves, raw.mateIn, raw.findDepth, raw.themes), id);
  return {
    id,
    fen: raw.fen,
    moves: [...raw.moves],
    rating,
    ratingDeviation: RATING_DEFAULTS.puzzleRd,
    themes: [...raw.themes],
    openingTags: [...raw.openingTags],
    source: 'generated',
    explanation: explainPuzzle(raw.fen, raw.moves, raw.themes, raw.mateIn, raw.firstScore),
  };
}
