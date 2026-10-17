/**
 * Verzahnung (PRD Lektionen §4): the practice-game bot after a lesson and the bot that plays "Ausspielen" steps.
 */
import type { BotProfile } from '@/core/bots';
import type { StageId } from '@/core/lessons';
import { stageMeta } from './stages';

/** Distance of an Elo to an inclusive range (0 inside). */
function distanceToRange(elo: number, min: number, max: number): number {
  if (elo < min) return min - elo;
  if (elo > max) return elo - max;
  return 0;
}

/** The roster entry minimising `distance`; ties go to the weaker bot. */
function nearest(roster: readonly BotProfile[], distance: (b: BotProfile) => number): BotProfile | null {
  let best: BotProfile | null = null;
  for (const bot of roster) {
    if (!best) {
      best = bot;
      continue;
    }
    const d = distance(bot);
    const bestD = distance(best);
    if (d < bestD || (d === bestD && bot.elo < best.elo)) best = bot;
  }
  return best;
}

/**
 * Bot for the "Übungspartie" after a lesson: nearest to the learner's bot rating; without a bot rating nearest to the
 * Elo range of the lesson's stage (inside the range: the weakest), Stufe 0 → the weakest bot. `null` for an empty roster.
 */
export function practiceBot(roster: readonly BotProfile[], botRating: number | null, stage: StageId): BotProfile | null {
  if (roster.length === 0) return null;
  if (botRating !== null && Number.isFinite(botRating)) return nearest(roster, (b) => Math.abs(b.elo - botRating));
  if (stage === 0) return nearest(roster, (b) => b.elo);
  const { min, max } = stageMeta(stage).elo;
  return nearest(roster, (b) => distanceToRange(b.elo, min, max));
}

/**
 * Bot profile for an "Ausspielen" step with a numeric `botElo`: the roster bot nearest to that Elo (its engine type
 * and personality), with the exact Elo of the step and no opening repertoire (the step starts from its own FEN).
 * `null` for an empty roster.
 */
export function playOutBot(roster: readonly BotProfile[], botElo: number): BotProfile | null {
  const base = nearest(roster, (b) => Math.abs(b.elo - botElo));
  if (!base) return null;
  return { ...base, elo: botElo, repertoire: { white: [], black: [] } };
}
