/**
 * Artificial think time (PRD "1–8 s Bedenkzeit, je nach Komplexität der Stellung"): more legal moves, available
 * captures and close candidate evaluations make a bot "think" longer; book moves and forced moves are quick.
 * In e2e runs the think time is 0 (`config.e2e`).
 */
import type { RandomSource } from './random';

/** Minimum and maximum think time in ms. */
export const THINK_TIME_RANGE_MS = { min: 1000, max: 8000 } as const;

/** What the think time depends on. */
export interface ThinkTimeContext {
  /** Number of legal moves. */
  legalMoves: number;
  /** Number of legal captures. */
  captures: number;
  /** The bot is in check. */
  inCheck: boolean;
  /** Expected-points gap between the best and the second-best candidate (small = hard decision); `null` = unknown. */
  spread: number | null;
  /** The move came from the opening repertoire. */
  book: boolean;
  /** The bot's Elo (stronger bots take a little longer). */
  elo: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Think time in ms within `THINK_TIME_RANGE_MS` (random jitter ±20 %). */
export function thinkTimeMs(ctx: ThinkTimeContext, random: RandomSource): number {
  const { min, max } = THINK_TIME_RANGE_MS;
  if (ctx.legalMoves <= 1) return min;
  const jitter = 0.8 + 0.4 * random();
  if (ctx.book) return Math.round(clamp(min + 1000 * random(), min, 2000));
  const breadth = Math.min(ctx.legalMoves, 40) * 35;
  const tactics = Math.min(ctx.captures, 4) * 300 + (ctx.inCheck ? -400 : 0);
  const difficulty = ctx.spread === null ? 1000 : (1 - Math.min(1, ctx.spread / 0.25)) * 2500;
  const strength = clamp(ctx.elo / 2500, 0, 1) * 1000;
  return Math.round(clamp((1200 + breadth + tactics + difficulty + strength) * jitter, min, max));
}
