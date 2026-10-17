/**
 * Start / Dashboard `/` (PRD P0-14, Fortschritt §5): Puzzle-Rating, Bot-Rating, Serie, Tagesziel, "Weiter, wo du
 * aufgehört hast", "Nächste Lektion", "Als Nächstes trainieren" and a fitting bot. Every area is one click away.
 * Redirects to `/onboarding` while the onboarding is not completed (first start).
 */
import { useMemo } from 'react';
import { Navigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { recommendBot } from '@/bots';
import { DEFAULT_DAILY_GOAL_MINUTES } from '@/core/profile';
import { useLessonCatalog, useUnlockContext } from '@/features/lessons/useLessonData';
import {
  useAnalysedGames,
  useLiveProfile,
  useRating,
  useStreak,
  useThemeStatsLive,
  useTodayActivity,
  useTodayKey,
} from '@/features/profile/useProgressData';
import { nextLessonFor } from '@/lessons';
import { recommendTraining } from '@/stats';
import { Page } from '@/ui/layout';
import { Spinner } from '@/ui/primitives';
import { FittingBotCard, NextLessonCard, TrainNextCard } from '../components/Cards';
import { ResumeCard } from '../components/ResumeCard';
import { BotRatingTile, DailyGoalTile, PuzzleRatingTile, StreakTile } from '../components/StatTiles';
import { resumeTargets } from '../logic';
import { STRINGS_DE } from '../strings.de';
import {
  onboardingDecision,
  useActiveGames,
  useLessonProgressList,
  useMotifThemesWithPuzzles,
  useProfileSettled,
  useRecentAttempts,
} from '../useDashboardData';

/** Dashboard (lazy route module). */
export function Component() {
  const profile = useLiveProfile();
  const settled = useProfileSettled();
  const decision = onboardingDecision(profile, settled);

  if (decision === 'onboarding') return <Navigate to={paths.onboarding()} replace />;
  if (decision === 'loading' || !profile) {
    return (
      <Page title={STRINGS_DE.home}>
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner size={20} />
          {STRINGS_DE.loading}
        </div>
      </Page>
    );
  }
  return <Dashboard dailyGoalMinutes={profile.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES} displayName={profile.displayName} />;
}

function Dashboard({ dailyGoalMinutes, displayName }: { dailyGoalMinutes: number; displayName: string }) {
  const { botRoster } = useServices();
  const today = useTodayKey();
  const todayActivity = useTodayActivity(today);
  const streak = useStreak(today, todayActivity);
  const puzzleRating = useRating('puzzle');
  const botRating = useRating('bot');
  const themeStats = useThemeStatsLive();
  const analysed = useAnalysedGames();
  const activeGames = useActiveGames();
  const attempts = useRecentAttempts();
  const lessonProgress = useLessonProgressList();
  const motifThemes = useMotifThemesWithPuzzles();
  const catalog = useLessonCatalog();
  const ctx = useUnlockContext(catalog);

  const next = useMemo(() => (ctx ? nextLessonFor(ctx) : undefined), [ctx]);
  const bot = useMemo(
    () => (botRating === undefined ? undefined : botRoster.length ? recommendBot(botRating?.rating ?? null, botRoster) : null),
    [botRating, botRoster],
  );
  const targets = useMemo(
    () =>
      activeGames && attempts && lessonProgress && catalog
        ? resumeTargets({ activeGames, attempts, lessonProgress, courses: catalog.courses })
        : undefined,
    [activeGames, attempts, lessonProgress, catalog],
  );
  const rec = useMemo(() => {
    if (!themeStats || !analysed || next === undefined || bot === undefined || !motifThemes) return undefined;
    return recommendTraining({
      themeStats,
      games: analysed,
      nextLesson: next ? { courseId: next.courseId, lessonId: next.lessonId } : null,
      fittingBotId: bot?.id ?? null,
      availableThemes: motifThemes,
    });
  }, [themeStats, analysed, next, bot, motifThemes]);

  const name = displayName.trim();
  const subtitle = name && name !== 'Du' ? STRINGS_DE.greeting(name) : STRINGS_DE.subtitle;
  const minutes = todayActivity === undefined ? undefined : (todayActivity?.minutes ?? 0);

  return (
    <Page title={STRINGS_DE.home} subtitle={subtitle}>
      <div className="flex flex-col gap-6">
        <section aria-label={STRINGS_DE.overviewLabel}>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <li className="min-w-0">
              <PuzzleRatingTile rating={puzzleRating} />
            </li>
            <li className="min-w-0">
              <BotRatingTile rating={botRating} />
            </li>
            <li className="min-w-0">
              <StreakTile streak={streak} />
            </li>
            <li className="min-w-0">
              <DailyGoalTile minutes={minutes} goal={dailyGoalMinutes} />
            </li>
          </ul>
        </section>
        <ResumeCard targets={targets} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <NextLessonCard next={next} hasCourses={!!catalog && catalog.courses.some((c) => c.status === 'available')} />
          <TrainNextCard rec={rec} bot={bot ?? null} />
          <FittingBotCard bot={bot} />
        </div>
      </div>
    </Page>
  );
}
