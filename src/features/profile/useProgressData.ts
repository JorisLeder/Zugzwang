/**
 * Live progress data shared by the dashboard, the profile and the statistics page: profile, ratings, today's activity,
 * the streak and the analysed games. Every hook returns `undefined` while loading.
 */
import { useEffect, useMemo, useState } from 'react';
import { useServices } from '@/app/services';
import type { GameAnalysis } from '@/core/analysis';
import type { Game } from '@/core/games';
import type { DailyActivity, Profile, ThemeStat } from '@/core/profile';
import type { RatingKind, RatingRecord } from '@/core/rating';
import { computeStreak, type StreakInfo } from '@/data';
import { useSubscribable } from '@/lib/observable';
import { addDays, localDateKey, userTimeZone } from '@/lib/time';

/** How many days back the streak is computed (longer streaks still count up to this window). */
export const STREAK_WINDOW_DAYS = 400;

/** Today's `YYYY-MM-DD` key in the user's time zone (re-evaluated when the tab becomes visible again). */
export function useTodayKey(): string {
  const [today, setToday] = useState(() => localDateKey(new Date(), userTimeZone()));
  useEffect(() => {
    const refresh = () => setToday(localDateKey(new Date(), userTimeZone()));
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, []);
  return today;
}

/** Live profile, `undefined` while loading, `null` before it exists. */
export function useLiveProfile(): Profile | null | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.profile.observe(), [data]);
  return useSubscribable<Profile | null | undefined>(source, undefined);
}

/** Live rating of a pool, `undefined` while loading, `null` without a rating. */
export function useRating(kind: RatingKind): RatingRecord | null | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.ratings.observe(kind), [data, kind]);
  return useSubscribable<RatingRecord | null | undefined>(source, undefined);
}

/** Live activity of today, `undefined` while loading, `null` without activity. */
export function useTodayActivity(today: string): DailyActivity | null | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.dailyActivity.observe(today), [data, today]);
  return useSubscribable<DailyActivity | null | undefined>(source, undefined);
}

/** Live theme statistics, `undefined` while loading. */
export function useThemeStatsLive(): ThemeStat[] | undefined {
  const { data } = useServices();
  const source = useMemo(() => data.repos.themeStats.observe(), [data]);
  return useSubscribable<ThemeStat[] | undefined>(source, undefined);
}

/** Current streak; recomputed whenever today's activity changes. `undefined` while loading. */
export function useStreak(today: string, todayActivity: DailyActivity | null | undefined): StreakInfo | undefined {
  const { data } = useServices();
  const [state, setState] = useState<{ key: string; value: StreakInfo } | null>(null);
  const key = `${today}|${todayActivity ? `${todayActivity.minutes}/${todayActivity.puzzles}/${todayActivity.games}/${todayActivity.lessons}` : '-'}`;
  useEffect(() => {
    let alive = true;
    data.repos.dailyActivity
      .range(addDays(today, -STREAK_WINDOW_DAYS), today)
      .then(
        (days) => alive && setState({ key, value: computeStreak(days, today) }),
        (err: unknown) => {
          console.warn('Daily activity could not be read', err);
          if (alive) setState({ key, value: { current: 0, trainedToday: false, longest: 0 } });
        },
      );
    return () => {
      alive = false;
    };
  }, [data, today, key]);
  // While recomputing, the previous streak stays visible (no flicker).
  return state?.value;
}

/** Analyses with their games (read once per mount), `undefined` while loading. */
export function useAnalysedGames(): Array<{ analysis: GameAnalysis; game: Game | null }> | undefined {
  const { data } = useServices();
  const [value, setValue] = useState<Array<{ analysis: GameAnalysis; game: Game | null }> | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    Promise.all([data.repos.gameAnalyses.list(), data.repos.games.list()]).then(
      ([analyses, games]) => {
        if (!alive) return;
        const byId = new Map(games.map((g) => [g.id, g]));
        setValue(analyses.map((analysis) => ({ analysis, game: byId.get(analysis.gameId) ?? null })));
      },
      (err: unknown) => {
        console.warn('Analyses could not be read', err);
        if (alive) setValue([]);
      },
    );
    return () => {
      alive = false;
    };
  }, [data]);
  return value;
}
