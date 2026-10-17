/**
 * The statistics sections (lazy-loaded by the statistics page): rating curves (puzzle, bot), success per theme,
 * accuracy per phase and the most frequent mistakes. Pure presentation of `@/stats` results.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { MOTIF_LABELS_DE } from '@/core/explain';
import { formatNumber, formatPercent } from '@/i18n';
import type { ClassificationCount, MotifCount, PhaseAccuracy, RatingSeries, ThemeSuccess } from '@/stats';
import { WEAK_THEME_MAX_RATE, WEAK_THEME_MIN_ATTEMPTS } from '@/stats';
import { Badge, Button, Card, ClassificationBadge } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';
import { BarRows } from './BarRows';
import { RatingChart } from './RatingChart';

/** Everything the charts show. */
export interface StatsChartsProps {
  puzzle: RatingSeries;
  bot: RatingSeries;
  themes: ThemeSuccess[];
  phases: PhaseAccuracy[];
  mistakes: ClassificationCount[];
  motifs: MotifCount[];
  /** Number of analysed games. */
  analysedGames: number;
}

/** Maximum number of theme rows. */
const MAX_THEMES = 15;

function Section({ id, title, hint, children, testId }: { id: string; title: string; hint: string; children: ReactNode; testId: string }) {
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <Card className="flex min-w-0 flex-col gap-4">
        <div>
          <h2 id={id} className="text-h2 text-text">
            {title}
          </h2>
          <p className="mt-1 text-body-sm text-muted">{hint}</p>
        </div>
        {children}
      </Card>
    </section>
  );
}

/** The statistics sections. */
export default function StatsCharts({ puzzle, bot, themes, phases, mistakes, motifs, analysedGames }: StatsChartsProps) {
  const weakest = phases.filter((p) => p.accuracy !== null).sort((a, b) => a.accuracy! - b.accuracy!)[0];
  const hasMistakes = mistakes.some((m) => m.count > 0);
  return (
    <div className="flex flex-col gap-6">
      <Section id="stats-ratings" title={STRINGS_DE.ratingCurves} hint={STRINGS_DE.ratingCurvesHint} testId="stats-ratings">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RatingChart title={STRINGS_DE.puzzleRating} series={puzzle} emptyText={STRINGS_DE.noHistoryPuzzle} testId="stats-rating-puzzle" />
          <RatingChart title={STRINGS_DE.botRating} series={bot} emptyText={STRINGS_DE.noHistoryBot} testId="stats-rating-bot" />
        </div>
      </Section>

      <Section id="stats-themes-title" title={STRINGS_DE.themesTitle} hint={STRINGS_DE.themesHint} testId="stats-themes">
        {themes.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body text-muted">{STRINGS_DE.themesEmpty}</p>
            <Button asChild variant="secondary">
              <Link to={paths.puzzles()}>{STRINGS_DE.toPuzzles}</Link>
            </Button>
          </div>
        ) : (
          <BarRows
            testId="stats-themes-bars"
            caption={STRINGS_DE.themesTitle}
            columns={[STRINGS_DE.colTheme, STRINGS_DE.colSuccess, STRINGS_DE.colAttempts]}
            rows={themes.slice(0, MAX_THEMES).map((t) => {
              const weak = t.attempts >= WEAK_THEME_MIN_ATTEMPTS && t.rate < WEAK_THEME_MAX_RATE;
              return {
                key: t.theme.id,
                label: t.theme.labelDe,
                value: t.rate,
                valueText: formatPercent(t.rate, 0),
                meta: `${formatNumber(t.attempts)} ${STRINGS_DE.colAttempts}`,
                flagged: weak,
                extra: weak ? (
                  <Link
                    to={paths.puzzleTheme(t.theme.id)}
                    title={STRINGS_DE.themesWeakHint}
                    aria-label={STRINGS_DE.trainTheme(t.theme.labelDe)}
                    className="rounded-full focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Badge tone="warning">{STRINGS_DE.themesWeak}</Badge>
                  </Link>
                ) : undefined,
              };
            })}
          />
        )}
      </Section>

      <Section id="stats-phases-title" title={STRINGS_DE.phasesTitle} hint={STRINGS_DE.phasesHint} testId="stats-phases">
        {analysedGames === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body text-muted">{STRINGS_DE.phasesEmpty}</p>
            <Button asChild variant="secondary">
              <Link to={paths.analysis()}>{STRINGS_DE.toAnalysis}</Link>
            </Button>
          </div>
        ) : (
          <BarRows
            testId="stats-phases-bars"
            caption={STRINGS_DE.phasesTitle}
            columns={[STRINGS_DE.colPhase, STRINGS_DE.colAccuracy, STRINGS_DE.colMoves]}
            rows={phases.map((p) => ({
              key: p.phase,
              label: STRINGS_DE.phaseLabels[p.phase],
              value: p.accuracy,
              valueText: p.accuracy === null ? STRINGS_DE.noValue : formatPercent(p.accuracy, 0),
              meta: `${formatNumber(p.moves)} ${STRINGS_DE.colMoves}`,
              flagged: weakest?.phase === p.phase && phases.filter((x) => x.accuracy !== null).length > 1,
              extra:
                weakest?.phase === p.phase && phases.filter((x) => x.accuracy !== null).length > 1 ? (
                  <Badge tone="warning">{STRINGS_DE.weakPhase}</Badge>
                ) : undefined,
            }))}
          />
        )}
      </Section>

      <Section id="stats-mistakes-title" title={STRINGS_DE.mistakesTitle} hint={STRINGS_DE.mistakesHint} testId="stats-mistakes">
        {!hasMistakes && motifs.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body text-muted">{STRINGS_DE.mistakesEmpty}</p>
            <Button asChild variant="secondary">
              <Link to={paths.analysis()}>{STRINGS_DE.toAnalysis}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm" data-testid="stats-mistake-types">
                <caption className="sr-only">{STRINGS_DE.mistakesTitle}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium text-muted">
                      {STRINGS_DE.colType}
                    </th>
                    <th scope="col" className="py-2 text-right font-medium text-muted">
                      {STRINGS_DE.colCount}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mistakes.map((m) => (
                    <tr key={m.classification} className="border-t border-border" data-classification={m.classification} data-count={m.count}>
                      <th scope="row" className="py-2 pr-3 font-normal">
                        <ClassificationBadge classification={m.classification} showLabel showPlainTooltip />
                      </th>
                      <td className="py-2 text-right tabular-nums text-text">{formatNumber(m.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-h3 text-text">{STRINGS_DE.motifsTitle}</h3>
              {motifs.length === 0 ? (
                <p className="text-body-sm text-muted">{STRINGS_DE.motifsEmpty}</p>
              ) : (
                <ol className="flex flex-col gap-1" data-testid="stats-motifs">
                  {motifs.slice(0, 8).map((m) => (
                    <li key={m.motif} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0" data-motif={m.motif} data-count={m.count}>
                      <span className="text-body text-text">{MOTIF_LABELS_DE[m.motif]}</span>
                      <span className="text-body-sm tabular-nums text-muted">{STRINGS_DE.motifCount(m.count)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
