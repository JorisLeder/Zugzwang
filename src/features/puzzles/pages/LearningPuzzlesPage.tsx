/**
 * Lernmodus `/puzzles/learn` (P0-05): no rating, no timer, hints and "Lösung zeigen", retry after wrong moves,
 * motif tags + explanation after every puzzle. Puzzles come from around the puzzle rating (or the Einsteiger start
 * value before the self-assessment). `?puzzle=<id>` opens a specific puzzle first (links from lessons/reviews).
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { selectLearning } from '@/puzzles';
import { usePageTitle } from '@/ui/layout';
import { PuzzleEmpty, PuzzleError, PuzzleLoading } from '../components/PuzzlePageStates';
import { UnratedSession } from '../components/UnratedSession';
import { DEFAULT_PUZZLE_CENTER } from '../params';
import { STRINGS_DE } from '../strings.de';
import { usePuzzleBank, usePuzzleRating } from '../usePuzzleData';

function LearningSession({ center, firstId }: { center: number; firstId: string | null }) {
  const { data } = useServices();
  const select = useCallback(
    (seen: ReadonlySet<string>, currentId?: string) => selectLearning(data.repos.puzzles, center, { seenIds: seen, currentId }),
    [data, center],
  );
  const firstPuzzle = useCallback(async () => (firstId ? data.repos.puzzles.get(firstId) : null), [data, firstId]);
  return (
    <UnratedSession
      mode="learning"
      title={STRINGS_DE.puzzlesLearn}
      modeTitle={STRINGS_DE.puzzlesLearn}
      backTo={paths.puzzles()}
      select={select}
      firstPuzzle={firstPuzzle}
      empty={<PuzzleEmpty title={STRINGS_DE.puzzlesLearn} heading={STRINGS_DE.puzzlesLearn} text={STRINGS_DE.noPuzzles} />}
    />
  );
}

/** Lernmodus (lazy route module). */
export function Component() {
  usePageTitle(STRINGS_DE.puzzlesLearn);
  const { data } = useServices();
  data.activity.useTracking('puzzles');
  const bank = usePuzzleBank();
  const rating = usePuzzleRating();
  const [params] = useSearchParams();
  if (bank.status === 'error') return <PuzzleError title={STRINGS_DE.puzzlesLearn} onRetry={bank.retry} />;
  if (bank.status === 'loading' || rating === undefined) return <PuzzleLoading title={STRINGS_DE.puzzlesLearn} />;
  return <LearningSession center={Math.round(rating?.rating ?? DEFAULT_PUZZLE_CENTER)} firstId={params.get('puzzle')} />;
}
