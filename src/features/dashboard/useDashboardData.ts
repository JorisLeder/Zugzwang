/**
 * Live data hooks of the dashboard (each returns `undefined` while loading) and the onboarding redirect decision.
 */
import { useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import type { Game } from '@/core/games';
import { movesFromEvents } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import type { Profile } from '@/core/profile';
import type { PuzzleAttempt, PuzzleThemeId } from '@/core/puzzles';
import { useSyncState } from '@/features/sync/useSyncState';
import { useSubscribable } from '@/lib/observable';
import { MOTIF_THEME } from '@/stats';

/** Attempts read for "Weiter, wo du aufgehört hast" (enough to find the theme of the last theme run). */
export const RECENT_ATTEMPTS = 20;

/** Running bot games, newest first. */
export function useActiveGames(): Game[] | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.games.observeList({ status: 'active', source: 'bot' }), [data]);
  return useSubscribable<Game[] | undefined>(source, undefined);
}

/** Latest puzzle attempts, newest first. */
export function useRecentAttempts(): PuzzleAttempt[] | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.puzzleAttempts.observeRecent(RECENT_ATTEMPTS), [data]);
  return useSubscribable<PuzzleAttempt[] | undefined>(source, undefined);
}

/** All lesson progress rows. */
export function useLessonProgressList(): LessonProgress[] | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.lessonProgress.observeAll(), [data]);
  return useSubscribable<LessonProgress[] | undefined>(source, undefined);
}

/** Number of plies played in a game (live). */
export function useGamePlies(gameId: string): number {
  const { data } = useServices();
  const source = useMemo(() => data.repos.gameMoves.observe(gameId), [data, gameId]);
  const events = useSubscribable(source, []);
  return movesFromEvents(events).length;
}

/** Themes recommended for game motifs that have puzzles in the local bank (read once). */
export function useMotifThemesWithPuzzles(): ReadonlySet<PuzzleThemeId> | undefined {
  const { data } = useServices();
  const [value, setValue] = useState<ReadonlySet<PuzzleThemeId> | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const themes = [...new Set(Object.values(MOTIF_THEME).filter((t): t is string => !!t))];
    Promise.all(themes.map(async (t) => ((await data.repos.puzzles.count({ themes: [t] })) > 0 ? t : null))).then(
      (found) => alive && setValue(new Set(found.filter((t): t is string => !!t))),
      () => alive && setValue(new Set()),
    );
    return () => {
      alive = false;
    };
  }, [data]);
  return value;
}

/** In cloud mode the first pull may still bring the profile – wait at most this long before redirecting. */
export const CLOUD_PROFILE_WAIT_MS = 4000;

/**
 * Whether the dashboard may decide about the onboarding redirect: always in local mode; in cloud mode once the first
 * sync finished, the device is offline, sync fails or `CLOUD_PROFILE_WAIT_MS` passed.
 */
export function useProfileSettled(): boolean {
  const { data } = useServices();
  const sync = useSyncState();
  const cloud = data.auth.mode === 'cloud';
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!cloud) return undefined;
    const t = window.setTimeout(() => setTimedOut(true), CLOUD_PROFILE_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [cloud]);
  if (!cloud) return true;
  return timedOut || !!sync.lastSyncedAt || !sync.online || sync.status === 'error' || sync.status === 'offline';
}

/** What the dashboard shows for a profile state. */
export type OnboardingDecision = 'loading' | 'onboarding' | 'ready';

/** Redirect to the onboarding while it is not completed (D-10). */
export function onboardingDecision(profile: Profile | null | undefined, settled: boolean): OnboardingDecision {
  if (profile?.onboardingCompleted) return 'ready';
  if (profile === undefined || !settled) return 'loading';
  return 'onboarding';
}
