/**
 * Statistik `/profile/stats` (PRD Fortschritt §5): rating curves (puzzle, bot), success per theme, accuracy per game
 * phase and the most frequent mistake types. The charts are own SVG components with a table view, loaded lazily.
 */
import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { mistakeCounts, mistakeMotifs, phaseAccuracy, ratingSeries, themeSuccess, type RatingPoint } from '@/stats';
import { Page } from '@/ui/layout';
import { Button, ErrorState, Spinner } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';
import { useAnalysedGames, useThemeStatsLive } from '../useProgressData';

const StatsCharts = lazy(() => import('../charts/StatsCharts'));

type History = { puzzle: RatingPoint[]; bot: RatingPoint[] };

/** Rating histories of both pools (read once), `undefined` while loading, `null` on error. */
function useRatingHistories(): History | null | undefined {
  const { data } = useServices();
  const [value, setValue] = useState<History | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    Promise.all([data.repos.ratings.history('puzzle'), data.repos.ratings.history('bot')]).then(
      ([puzzle, bot]) => alive && setValue({ puzzle, bot }),
      (err: unknown) => {
        console.warn('Rating history could not be read', err);
        if (alive) setValue(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [data]);
  return value;
}

function Loading() {
  return (
    <div className="flex items-center gap-3 text-muted" role="status">
      <Spinner size={20} />
      {STRINGS_DE.loading}
    </div>
  );
}

/** Statistics page (lazy route module). */
export function Component() {
  const histories = useRatingHistories();
  const themeStats = useThemeStatsLive();
  const analysed = useAnalysedGames();

  const props = useMemo(() => {
    if (!histories || !themeStats || !analysed) return null;
    return {
      puzzle: ratingSeries(histories.puzzle),
      bot: ratingSeries(histories.bot),
      themes: themeSuccess(themeStats),
      phases: phaseAccuracy(analysed),
      mistakes: mistakeCounts(analysed),
      motifs: mistakeMotifs(analysed),
      analysedGames: analysed.length,
    };
  }, [histories, themeStats, analysed]);

  return (
    <Page
      title={STRINGS_DE.stats}
      subtitle={STRINGS_DE.statsSubtitle}
      actions={
        <Button asChild variant="ghost">
          <Link to={paths.profile()}>
            <ArrowLeft aria-hidden="true" />
            {STRINGS_DE.backToProfile}
          </Link>
        </Button>
      }
    >
      {histories === null ? (
        <ErrorState message={STRINGS_DE.chartsError} />
      ) : !props ? (
        <Loading />
      ) : (
        <Suspense fallback={<Loading />}>
          <StatsCharts {...props} />
        </Suspense>
      )}
    </Page>
  );
}
