/**
 * Themen-Training overview `/puzzles/themes` (P0-06, DESIGN §3.6): ≥ 20 trainable motifs grouped by kind, each with
 * the number of puzzles for the chosen difficulty and the learner's success rate ("62 % gelöst"); segmented
 * difficulty filter Leicht · Mittel · Schwer · Alle (`?d=`). Themes without puzzles stay visible but cannot be opened.
 */
import { Link, useSearchParams } from 'react-router';
import { paths } from '@/app/paths';
import type { PuzzleTheme } from '@/core/puzzles';
import { formatPercent } from '@/i18n';
import { listTrainingThemes, THEME_DIFFICULTIES, THEME_GROUP_LABELS_DE, themeSuccessRate, type ThemeDifficulty, type ThemeListEntry } from '@/puzzles';
import { Page, usePageTitle } from '@/ui/layout';
import { Card, CardMeta, CardTitle, SegmentedControl, Spinner } from '@/ui/primitives';
import { PuzzleError } from '../components/PuzzlePageStates';
import { DEFAULT_PUZZLE_CENTER, DIFFICULTY_PARAM, parseDifficulty, themeSearch } from '../params';
import { STRINGS_DE } from '../strings.de';
import { usePuzzleBank, usePuzzleRating, useThemeCounts, useThemeStats } from '../usePuzzleData';

const DIFFICULTY_LABELS: Record<ThemeDifficulty, { label: string; description: string }> = {
  easy: { label: STRINGS_DE.difficultyEasy, description: STRINGS_DE.difficultyEasyText },
  medium: { label: STRINGS_DE.difficultyMedium, description: STRINGS_DE.difficultyMediumText },
  hard: { label: STRINGS_DE.difficultyHard, description: STRINGS_DE.difficultyHardText },
  all: { label: STRINGS_DE.difficultyAll, description: STRINGS_DE.difficultyAllText },
};

const GROUP_ORDER: Array<PuzzleTheme['group']> = ['motif', 'mate', 'special', 'phase', 'endgame'];

function ThemeCard({ entry, rate, difficulty }: { entry: ThemeListEntry; rate: number | null; difficulty: ThemeDifficulty }) {
  const meta = (
    <CardMeta>
      {entry.available ? STRINGS_DE.themeCount(entry.count) : STRINGS_DE.themeNoPuzzles}
      {' · '}
      {rate === null ? STRINGS_DE.themeNotTrained : STRINGS_DE.themeSuccess(formatPercent(rate, 0))}
    </CardMeta>
  );
  if (!entry.available) {
    return (
      <Card data-testid="theme-card" data-theme={entry.theme.id} aria-disabled="true" className="h-full">
        <CardTitle className="text-muted">{entry.theme.labelDe}</CardTitle>
        {meta}
      </Card>
    );
  }
  return (
    <Card interactive asChild className="h-full">
      <Link
        to={{ pathname: paths.puzzleTheme(entry.theme.id), search: themeSearch(difficulty) }}
        data-testid="theme-card"
        data-theme={entry.theme.id}
        title={entry.theme.descriptionDe}
      >
        <CardTitle>{entry.theme.labelDe}</CardTitle>
        {meta}
      </Link>
    </Card>
  );
}

/** Themen-Training overview (lazy route module). */
export function Component() {
  usePageTitle(STRINGS_DE.puzzleThemes);
  const bank = usePuzzleBank();
  const rating = usePuzzleRating();
  const stats = useThemeStats();
  const [params, setParams] = useSearchParams();
  const difficulty = parseDifficulty(params.get(DIFFICULTY_PARAM));
  const userRating = Math.round(rating?.rating ?? DEFAULT_PUZZLE_CENTER);
  const counts = useThemeCounts(bank.status === 'ready', difficulty, userRating);
  if (bank.status === 'error') return <PuzzleError title={STRINGS_DE.puzzleThemes} onRetry={bank.retry} />;
  const entries = counts ? listTrainingThemes(counts.totals, counts.filtered) : [];
  const statById = new Map(stats.map((s) => [s.theme, s]));

  return (
    <Page title={STRINGS_DE.puzzleThemes} subtitle={STRINGS_DE.themesSubtitle}>
      <div className="mb-6 max-w-xl">
        <SegmentedControl<ThemeDifficulty>
          label={STRINGS_DE.difficulty}
          value={difficulty}
          onValueChange={(d) => setParams(d === 'all' ? {} : { [DIFFICULTY_PARAM]: d }, { replace: true })}
          options={THEME_DIFFICULTIES.map((d) => ({ value: d, ...DIFFICULTY_LABELS[d] }))}
        />
      </div>
      {!counts ? (
        <div role="status" className="flex items-center gap-3 text-body text-muted">
          <Spinner />
          <span>{STRINGS_DE.bankLoading}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-8" data-testid="theme-list">
          {GROUP_ORDER.map((group) => {
            const inGroup = entries.filter((e) => e.theme.group === group);
            if (inGroup.length === 0) return null;
            const sorted = [...inGroup.filter((e) => e.available), ...inGroup.filter((e) => !e.available)];
            return (
              <section key={group} aria-labelledby={`theme-group-${group}`}>
                <h2 id={`theme-group-${group}`} className="mb-3 text-h2 text-text">
                  {THEME_GROUP_LABELS_DE[group]}
                </h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sorted.map((entry) => (
                    <li key={entry.theme.id}>
                      <ThemeCard entry={entry} rate={themeSuccessRate(statById.get(entry.theme.id))} difficulty={difficulty} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
