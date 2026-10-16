/** Bot chat lines (PRD "kurze Chat-Sprüche"): greeting, capture, check, win, loss, draw. */
import type { BotProfile } from '@/core/bots';
import type { MoveRecord } from '@/core/chess';
import { pickOne, type RandomSource } from './random';

/** Chat event kinds. */
export type BotChatEvent = keyof BotProfile['chat'];

/** Probability that a bot comments its own capture / check (it should not talk on every move). */
export const CHAT_PROBABILITY = { onCheck: 0.5, onCapture: 0.35 } as const;

/** A random line of `bot` for `event`. */
export function chatLine(bot: BotProfile, event: BotChatEvent, random: RandomSource): string | undefined {
  return pickOne(bot.chat[event], random);
}

/** Optional chat line for the bot's own move (check beats capture; most moves stay silent). */
export function chatForMove(bot: BotProfile, move: Pick<MoveRecord, 'isCheck' | 'captured'>, random: RandomSource): string | undefined {
  if (move.isCheck) return random() < CHAT_PROBABILITY.onCheck ? chatLine(bot, 'onCheck', random) : undefined;
  if (move.captured) return random() < CHAT_PROBABILITY.onCapture ? chatLine(bot, 'onCapture', random) : undefined;
  return undefined;
}

/** Chat event at the end of a game from the bot's point of view. */
export function endChatEvent(result: '1-0' | '0-1' | '1/2-1/2' | '*', botColor: 'w' | 'b'): BotChatEvent | null {
  if (result === '*') return null;
  if (result === '1/2-1/2') return 'onDraw';
  return (result === '1-0') === (botColor === 'w') ? 'onWin' : 'onLoss';
}
