/**
 * Weak bots below 800 Elo (D-16, PRD "Stockfish mit Skill Level 0–3 … zusätzlich häufige grobe Fehler nach Regeln"):
 * with an Elo-dependent probability the bot commits a rule-based gross error (overlooks an attacked piece, misses a
 * capture, puts a piece en prise) chosen from plausible-looking moves; otherwise Stockfish plays with Skill Level 0–3
 * at a low depth.
 */
import type { Fen, Uci } from '@/core/chess';
import type { EngineService } from '@/core/engine';
import { ChessGame } from '@/lib/chess';
import { grossErrorCandidates, plausibility, type GrossErrorKind } from '../heuristics';
import type { SkillParams } from '../params';
import { softmaxWeights, weightedPick, type RandomSource } from '../random';

/** A rule-based gross error. */
export interface GrossError {
  uci: Uci;
  kind: GrossErrorKind;
}

/** Picks a gross error in `fen` (weighted by plausibility, never uniformly random); `null` without legal moves. */
export function chooseGrossError(fen: Fen, params: Pick<SkillParams, 'plausibilityTemperature'>, random: RandomSource): GrossError | null {
  const { kind, moves } = grossErrorCandidates(fen);
  if (moves.length === 0) return null;
  const weights = softmaxWeights(
    moves.map((m) => plausibility(fen, m)),
    params.plausibilityTemperature,
  );
  const pick = weightedPick(moves, weights, random);
  return pick ? { uci: pick.uci, kind } : null;
}

/** Result of `chooseSkillMove`. */
export interface SkillMoveResult {
  uci: Uci;
  /** `rule` = gross error, `engine` = Stockfish Skill Level move. */
  origin: 'rule' | 'engine';
  errorKind?: GrossErrorKind;
}

/** Chooses the move of a weak bot (see the file header). */
export async function chooseSkillMove(
  engine: EngineService,
  fen: Fen,
  params: SkillParams,
  random: RandomSource,
  signal?: AbortSignal,
): Promise<SkillMoveResult | null> {
  if (random() < params.grossErrorRate) {
    const error = chooseGrossError(fen, params, random);
    if (error) return { uci: error.uci, origin: 'rule', errorKind: error.kind };
  }
  const r = await engine.bestMove(fen, {
    skillLevel: params.skillLevel,
    depth: params.depth,
    movetimeMs: params.movetimeMs,
    ...(signal ? { signal } : {}),
  });
  const legal = ChessGame.fromFen(fen).legalMoves();
  if (r.move && legal.some((m) => m.uci === r.move)) return { uci: r.move, origin: 'engine' };
  const fallback = chooseGrossError(fen, params, random);
  return fallback ? { uci: fallback.uci, origin: 'rule', errorKind: fallback.kind } : null;
}
