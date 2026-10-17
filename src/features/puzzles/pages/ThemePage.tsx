/**
 * Themen-Training of one motif `/puzzles/themes/:themeId?d=&opening=` (P0-06): unrated puzzles with the theme in the
 * chosen difficulty range around the learner's rating, optional opening filter (Lichess opening tags, shown when the
 * theme's puzzles have any). Attempts are recorded with mode `theme`, so the success rate per motif updates.
 */
import { useCallback, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { puzzleThemeById } from '@/core/puzzles';
import { openingLabel, selectThemePuzzle, type ThemeDifficulty, type ThemeFilter } from '@/puzzles';
import { usePageTitle } from '@/ui/layout';
import { Badge, Button, Select } from '@/ui/primitives';
import { PuzzleEmpty, PuzzleError, PuzzleLoading } from '../components/PuzzlePageStates';
import { UnratedSession } from '../components/UnratedSession';
import { DEFAULT_PUZZLE_CENTER, DIFFICULTY_PARAM, OPENING_PARAM, parseDifficulty } from '../params';
import { STRINGS_DE } from '../strings.de';
import { useOpeningTags, usePuzzleBank, usePuzzleRating } from '../usePuzzleData';

const DIFFICULTY_BADGE: Record<ThemeDifficulty, string> = {
  easy: STRINGS_DE.difficultyEasy,
  medium: STRINGS_DE.difficultyMedium,
  hard: STRINGS_DE.difficultyHard,
  all: STRINGS_DE.difficultyAll,
};

const ALL_OPENINGS = '__all__';

interface ThemeSessionProps {
  filter: ThemeFilter;
  title: string;
  openingTags: string[];
  onOpening: (tag: string | undefined) => void;
  onReset: () => void;
}

function ThemeSession({ filter, title, openingTags, onOpening, onReset }: ThemeSessionProps) {
  const { data } = useServices();
  const select = useCallback(
    (seen: ReadonlySet<string>, currentId?: string) => selectThemePuzzle(data.repos.puzzles, filter, { seenIds: seen, currentId }),
    [data, filter],
  );
  const filtered = filter.difficulty !== 'all' || filter.openingTag !== undefined;
  const headerMeta = (
    <>
      <Badge tone="neutral">{`${STRINGS_DE.difficulty}: ${DIFFICULTY_BADGE[filter.difficulty]}`}</Badge>
      {openingTags.length > 0 && (
        <Select<string>
          label={STRINGS_DE.opening}
          value={filter.openingTag ?? ALL_OPENINGS}
          onValueChange={(v) => onOpening(v === ALL_OPENINGS ? undefined : v)}
          options={[{ value: ALL_OPENINGS, label: STRINGS_DE.allOpenings }, ...openingTags.map((t) => ({ value: t, label: openingLabel(t) }))]}
          className="min-w-0 max-w-full"
        />
      )}
    </>
  );
  return (
    <UnratedSession
      mode="theme"
      title={title}
      modeTitle={title}
      backTo={paths.puzzleThemes()}
      select={select}
      headerMeta={headerMeta}
      empty={
        <PuzzleEmpty
          title={title}
          heading={STRINGS_DE.filterEmptyTitle}
          text={STRINGS_DE.filterEmptyText}
          action={
            filtered ? (
              <Button onClick={onReset}>{STRINGS_DE.filterReset}</Button>
            ) : (
              <Button asChild>
                <Link to={paths.puzzleThemes()}>{STRINGS_DE.toThemes}</Link>
              </Button>
            )
          }
        />
      }
    />
  );
}

/** Themen-Training of one motif (lazy route module). */
export function Component() {
  const { themeId = '' } = useParams();
  const theme = puzzleThemeById(themeId);
  const title = theme ? STRINGS_DE.themeTitle(theme.labelDe) : STRINGS_DE.puzzleTheme;
  usePageTitle(title);
  const { data } = useServices();
  data.activity.useTracking('puzzles');
  const bank = usePuzzleBank();
  const rating = usePuzzleRating();
  const [params, setParams] = useSearchParams();
  const difficulty = parseDifficulty(params.get(DIFFICULTY_PARAM));
  const opening = params.get(OPENING_PARAM) ?? undefined;
  const userRating = Math.round(rating?.rating ?? DEFAULT_PUZZLE_CENTER);
  const openingTags = useOpeningTags(bank.status === 'ready', themeId);
  const filter = useMemo<ThemeFilter>(() => ({ theme: themeId, difficulty, userRating, openingTag: opening }), [themeId, difficulty, userRating, opening]);

  if (!theme || !theme.trainable) {
    return (
      <PuzzleEmpty
        title={STRINGS_DE.puzzleTheme}
        heading={STRINGS_DE.unknownTheme}
        text={STRINGS_DE.filterEmptyText}
        action={
          <Button asChild>
            <Link to={paths.puzzleThemes()}>{STRINGS_DE.toThemes}</Link>
          </Button>
        }
      />
    );
  }
  if (bank.status === 'error') return <PuzzleError title={title} onRetry={bank.retry} />;
  if (bank.status === 'loading' || rating === undefined) return <PuzzleLoading title={title} />;
  return (
    <ThemeSession
      key={`${themeId}|${difficulty}|${opening ?? ''}`}
      filter={filter}
      title={title}
      openingTags={openingTags}
      onOpening={(tag) => {
        const next = new URLSearchParams(params);
        if (tag) next.set(OPENING_PARAM, tag);
        else next.delete(OPENING_PARAM);
        setParams(next, { replace: true });
      }}
      onReset={() => setParams({}, { replace: true })}
    />
  );
}
