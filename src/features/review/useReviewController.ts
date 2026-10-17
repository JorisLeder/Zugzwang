/**
 * React binding of the `ReviewController`: one controller per game id, started on mount and disposed on unmount
 * (StrictMode-safe: `start()` may run again after `dispose()`).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useServices } from '@/app/services';
import { ReviewController, type ReviewState } from './reviewController';

/** The controller and its current state for `gameId`. */
export function useReviewController(gameId: string): { controller: ReviewController; state: ReviewState } {
  const services = useServices();
  const controller = useMemo(() => new ReviewController(services, gameId), [services, gameId]);
  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return { controller, state };
}
