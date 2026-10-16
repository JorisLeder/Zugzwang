/**
 * React binding of `GameController`: one controller per game id. The effect (re)starts it with `load()` and stops it
 * with `dispose()` – a restart after StrictMode's double mount reloads from the stored events. Bot move sounds and the
 * success sound on a win.
 */
import { useEffect, useMemo } from 'react';
import { useServices, useSettingsStore } from '@/app/services';
import { useSubscribable } from '@/lib/observable';
import { playSound, soundForMove } from '@/ui/sound';
import { GameController, type GameView } from './controller';
import { userOutcome } from './logic';

/** Controller and current view of the game `gameId` (`controller` is `null` until the effect ran). */
export function useGameController(gameId: string): { controller: GameController; view: GameView } {
  const services = useServices();
  const controller = useMemo(
    () =>
      new GameController({
        services,
        gameId,
        moveConfirmation: () => useSettingsStore.getState().settings.moveConfirmation,
        onBotMove: (move) => playSound(soundForMove(move)),
      }),
    [services, gameId],
  );

  useEffect(() => {
    void controller.load();
    let previous: GameView['phase'] = controller.get().phase;
    const unsubscribe = controller.subscribe((v) => {
      // Celebrate only a game that ends while it is open here (DESIGN §8.5 tier 2), not a finished game being opened.
      if (previous === 'active' && v.phase === 'finished' && v.outcome && userOutcome(v.outcome.result, v.userColor) === 'win') {
        playSound('success');
      }
      previous = v.phase;
    });
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  const view = useSubscribable(controller, controller.get());
  return { controller, view };
}
