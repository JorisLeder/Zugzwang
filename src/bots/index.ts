/**
 * `@/bots` – bot roster and move generator (WP-04, D-03, D-16, D-17).
 *
 * - `BOT_ROSTER` – 14 original bots (100–2500 Elo, five below 800), sorted by Elo.
 * - `createBotEngine(engine, config)` – the app's `BotEngine` on the `play` engine: repertoire first, then the model of
 *   the bot's strength; think time 1–8 s by complexity (0 when `config.e2e`).
 * - `recommendBot(rating)` – the bot that fits a bot rating; `botGroup`, `botById`, chat helpers.
 * Domain logic only – no React. The `/play` pages live in `src/features/play`.
 */
import type { BotEngine } from '@/core/bots';
import type { EngineService } from '@/core/engine';
import type { AppConfig } from '@/core/services';
import { MaiaBotEngine } from './maia/MaiaBotEngine';
import { StockfishBotEngine, type BotEngineOptions } from './engine';

export { BOT_ROSTER, botAvatarPath, botById, COACH_AVATAR } from './roster';
export { botGroup, DEFAULT_RECOMMENDATION_RATING, recommendBot, type BotGroupId } from './recommend';
export { chatForMove, chatLine, endChatEvent, type BotChatEvent } from './chat';
export { THINK_TIME_RANGE_MS, thinkTimeMs, type ThinkTimeContext } from './thinkTime';
export { botModel, eloParams, humanParams, skillParams, type BotModel, type EloParams, type HumanParams, type SkillParams } from './params';
export { isStandardStart, nextBookMoves, repertoireLines, repertoireMove } from './repertoire';
export { createSeededRandom, type RandomSource } from './random';
export { CLAIM_SEARCH, StockfishBotEngine, type BotEngineOptions } from './engine';
export { MaiaBotEngine, type MaiaModelSource } from './maia/MaiaBotEngine';

/** Creates the bot move generator with explicit options (tests, calibration). */
export function createBotEngineWithOptions(engine: EngineService, opts: BotEngineOptions = {}): BotEngine {
  const stockfish = new StockfishBotEngine(engine, opts);
  // `engine: 'maia'` bots go through the (stub) Maia adapter, which falls back to the human model (D-16).
  const maia = new MaiaBotEngine(stockfish);
  return {
    chooseMove: (req) => (req.bot.engine === 'maia' ? maia.chooseMove(req) : stockfish.chooseMove(req)),
    shouldClaimDraw: (fen, bot) => stockfish.shouldClaimDraw(fen, bot),
  };
}

/** Creates the bot move generator on top of the `play` engine (D-03 factory). */
export function createBotEngine(engine: EngineService, config: AppConfig): BotEngine {
  return createBotEngineWithOptions(engine, { e2e: config.e2e });
}
