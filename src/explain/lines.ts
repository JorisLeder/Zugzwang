/**
 * Replays the engine lines of `ExplanationFacts` with the rules layer (chess.js via `@/lib/chess`). Templates use the
 * records (captured pieces, squares, promotions); the LLM validator uses the positions to check that every move an
 * explanation names is part of a fact line and legal at its place in that line.
 *
 * Start positions: `playedMove` and `bestLine` from `fenBefore`; `refutation` from the position after the played
 * move – for `threat` from the null-move position (`nullMoveFen(fenBefore)`, the opponent's threat line).
 */
import type { Fen, MoveRecord, San } from '@/core/chess';
import type { ExplanationFacts } from '@/core/explain';
import { ChessGame, nullMoveFen } from '@/lib/chess';

/** Replayed fact lines (legal prefixes only). */
export interface FactLines {
  played: MoveRecord | null;
  best: MoveRecord[];
  refutation: MoveRecord[];
  /** Position the refutation starts from, `null` if there is none. */
  refutationStart: Fen | null;
}

/** Plays SAN moves from `fen` and returns the records of the legal prefix (never throws). */
export function replaySan(fen: Fen | null, sans: readonly San[]): MoveRecord[] {
  if (!fen) return [];
  let game: ChessGame;
  try {
    game = ChessGame.fromFen(fen);
  } catch {
    return [];
  }
  const out: MoveRecord[] = [];
  for (const san of sans) {
    const rec = game.move(san);
    if (!rec) break;
    out.push(rec);
  }
  return out;
}

/** The best line of the facts: `bestLine`, or `[bestMove]` if only that is given. */
export function bestLineOf(facts: ExplanationFacts): San[] {
  if (facts.bestLine.length > 0) return [...facts.bestLine];
  return facts.bestMove ? [facts.bestMove.san] : [];
}

/** Replays all lines of the facts (see the file header). */
export function replayFactLines(facts: ExplanationFacts): FactLines {
  const played = facts.playedMove ? (replaySan(facts.fenBefore, [facts.playedMove.san])[0] ?? null) : null;
  const best = replaySan(facts.fenBefore, bestLineOf(facts));
  let refutationStart: Fen | null = null;
  if (facts.kind === 'threat') refutationStart = nullMoveFen(facts.fenBefore);
  else if (played) refutationStart = played.fenAfter;
  const refutation = replaySan(refutationStart, facts.refutation);
  return { played, best, refutation, refutationStart };
}
