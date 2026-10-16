/** Bot recommendation ("passender Bot", PRD Kern-Ablauf 1, dashboard and empty states). */
import type { BotProfile } from '@/core/bots';
import { BOT_ROSTER } from './roster';

/** Rating used when the user has no bot rating yet (Einsteiger start value, D-10). */
export const DEFAULT_RECOMMENDATION_RATING = 400;

/**
 * The bot whose Elo is closest to `rating` (ties → the weaker bot, so the first games are winnable).
 * Without a rating the Einsteiger start value (400) is used.
 */
export function recommendBot(rating: number | null | undefined, roster: readonly BotProfile[] = BOT_ROSTER): BotProfile {
  const target = rating != null && Number.isFinite(rating) ? rating : DEFAULT_RECOMMENDATION_RATING;
  const sorted = [...roster].sort((a, b) => a.elo - b.elo);
  let best = sorted[0];
  if (!best) throw new Error('recommendBot: empty roster');
  for (const bot of sorted) {
    if (Math.abs(bot.elo - target) < Math.abs(best.elo - target)) best = bot;
  }
  return best;
}

/** Strength groups of the bot list (DESIGN §3.6). */
export type BotGroupId = 'beginner' | 'intermediate' | 'strong';

/** Group of a bot: below 800, 800–1599, from 1600. */
export function botGroup(bot: Pick<BotProfile, 'elo'>): BotGroupId {
  if (bot.elo < 800) return 'beginner';
  if (bot.elo < 1600) return 'intermediate';
  return 'strong';
}
