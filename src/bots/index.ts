/**
 * `@/bots` – bot engine factory and roster (D-03). PLACEHOLDER written by WP-00: random-move bot and two test bots.
 * WP-04 replaces both WITHOUT changing the signatures.
 */
import type { BotEngine, BotProfile } from '@/core/bots';
import type { EngineService } from '@/core/engine';
import type { AppConfig } from '@/core/services';
import { FakeBotEngine, FIXTURE_BOTS } from '@/core/testing';

/** All bots, sorted by Elo. */
export const BOT_ROSTER: BotProfile[] = [...FIXTURE_BOTS].sort((a, b) => a.elo - b.elo);

/** Creates the bot move generator on top of the `play` engine. */
export function createBotEngine(engine: EngineService, config: AppConfig): BotEngine {
  void engine;
  return new FakeBotEngine({ thinkTimeMs: config.e2e ? 0 : 500 });
}
