/** Creating bot games (setup dialog, play from position, rematch). */
import type { BotProfile } from '@/core/bots';
import type { Fen } from '@/core/chess';
import type { AssistanceLevel, Game, GameOrigin } from '@/core/games';
import type { AppServices } from '@/core/services';
import { newBotGame, resolveColor, type ColorChoice } from './logic';

/** Options of `startBotGame`. */
export interface StartBotGameOptions {
  bot: BotProfile;
  color: ColorChoice;
  assistance: AssistanceLevel;
  startFen: Fen;
  origin: GameOrigin;
  random?: () => number;
  now?: Date;
}

/** Creates the game through `progress.createGame` (active on this device) and returns it. */
export function startBotGame(services: AppServices, opts: StartBotGameOptions): Promise<Game> {
  const userColor = resolveColor(opts.color, opts.random);
  return services.data.progress.createGame(
    newBotGame({
      bot: opts.bot,
      userColor,
      assistance: opts.assistance,
      startFen: opts.startFen,
      origin: opts.origin,
      deviceId: services.data.deviceId,
      now: opts.now ?? new Date(),
    }),
  );
}

/** "Revanche": same bot, level and start position, colours swapped. */
export function rematch(services: AppServices, game: Game, bot: BotProfile): Promise<Game> {
  const color = game.userColor === 'w' ? 'b' : 'w';
  return startBotGame(services, { bot, color, assistance: game.assistance ?? 'coach', startFen: game.startFen, origin: game.origin });
}
