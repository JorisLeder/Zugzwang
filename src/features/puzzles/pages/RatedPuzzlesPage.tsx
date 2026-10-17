/**
 * Bewertete Puzzles `/puzzles/rated` (P0-04): self-assessment if no puzzle rating exists, then puzzles in the ±150
 * window (widening per D-32, never a rated repeat), Glicko-2 update after every attempt shown immediately with delta
 * and "vorläufig" marker, next puzzle prefetched as soon as the attempt is recorded (switch ≤ 300 ms).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import type { PuzzleAttempt } from '@/core/puzzles';
import type { RatingRecord } from '@/core/rating';
import { formatNumber } from '@/i18n';
import { puzzleAttemptInput, selectNextRated, type PuzzleOutcome, type RatedSelection } from '@/puzzles';
import { usePageTitle } from '@/ui/layout';
import { Badge, Button, RatingDelta } from '@/ui/primitives';
import { PuzzleEmpty, PuzzleError, PuzzleLoading } from '../components/PuzzlePageStates';
import { PuzzleTrainer } from '../components/PuzzleTrainer';
import { SelfAssessmentPrompt } from '../components/SelfAssessmentPrompt';
import { STRINGS_DE } from '../strings.de';
import { PERF, perfMark, usePuzzleBank, usePuzzleRating } from '../usePuzzleData';

type Current = Extract<RatedSelection, { kind: 'puzzle' }> | { kind: 'exhausted' };
type Recorded = { attempt: PuzzleAttempt; rating: RatingRecord | null };

/** Own rating chip with "vorläufig" marker (cloud mode until the server confirms, D-28). */
function RatingChip({ rating }: { rating: RatingRecord | null | undefined }) {
  if (!rating) return null;
  return (
    <>
      <Badge tone="accent" data-testid="rating-chip">
        {STRINGS_DE.ratingChip(formatNumber(Math.round(rating.rating)))}
      </Badge>
      {rating.provisional && <Badge tone="info">{STRINGS_DE.provisional}</Badge>}
    </>
  );
}

/** "Puzzle-Rating 612 +8 (vorläufig)" after the attempt was recorded. */
function RatingResult({ result }: { result: Recorded | 'pending' | null }) {
  if (result === null) return null;
  if (result === 'pending') return <p className="text-body-sm text-muted">{STRINGS_DE.ratingUpdating}</p>;
  const { attempt, rating } = result;
  if (attempt.ratingAfter === undefined) return null;
  const delta = attempt.ratingAfter - (attempt.ratingBefore ?? attempt.ratingAfter);
  return (
    <p data-testid="rating-result" aria-live="polite" className="flex flex-wrap items-center gap-2 text-body text-text">
      <span>{STRINGS_DE.puzzleRating(formatNumber(Math.round(attempt.ratingAfter)))}</span>
      <RatingDelta value={delta} />
      {rating?.provisional && <Badge tone="info">{STRINGS_DE.provisional}</Badge>}
    </p>
  );
}

function RatedSession() {
  const { data } = useServices();
  const rating = usePuzzleRating();
  const repos = useMemo(() => ({ puzzles: data.repos.puzzles, puzzleAttempts: data.repos.puzzleAttempts }), [data]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Recorded | 'pending' | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const prefetched = useRef<Promise<RatedSelection> | null>(null);

  /** Selection around the latest stored rating. */
  const select = useCallback(
    async (excludeIds: string[] = []): Promise<RatedSelection> => {
      const r = await data.repos.ratings.get('puzzle');
      return selectNextRated(repos, r?.rating ?? 0, { excludeIds });
    },
    [data, repos],
  );

  useEffect(() => {
    let alive = true;
    select().then(
      (sel) => alive && setCurrent(sel),
      (e: unknown) => {
        console.warn('Puzzle selection failed', e);
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [select]);

  const puzzle = current?.kind === 'puzzle' ? current.puzzle : null;

  const onAttempt = useCallback(
    (outcome: PuzzleOutcome, timeMs: number) => {
      if (!puzzle) return;
      setResult('pending');
      data.progress
        .recordPuzzleAttempt(puzzleAttemptInput(puzzle, 'rated', outcome, timeMs))
        .then(
          (r) => setResult(r),
          (e: unknown) => {
            console.warn('Puzzle attempt not saved', e);
            setResult(null);
          },
        )
        .finally(() => {
          // Prefetch with the updated rating while the learner reads the explanation.
          prefetched.current = select([puzzle.id]);
          prefetched.current.catch(() => {});
        });
    },
    [data, puzzle, select],
  );

  const onNext = useCallback(() => {
    perfMark(PERF.next);
    setNextLoading(true);
    const next = prefetched.current ?? select(puzzle ? [puzzle.id] : []);
    prefetched.current = null;
    next.then(
      (sel) => {
        setResult(null);
        setCurrent(sel);
        setNextLoading(false);
      },
      (e: unknown) => {
        console.warn('Puzzle selection failed', e);
        setNextLoading(false);
        setFailed(true);
      },
    );
  }, [puzzle, select]);

  if (failed) return <PuzzleError title={STRINGS_DE.puzzlesRated} />;
  if (!current) return <PuzzleLoading title={STRINGS_DE.puzzlesRated} />;
  if (current.kind === 'exhausted') {
    return (
      <PuzzleEmpty
        title={STRINGS_DE.puzzlesRated}
        heading={STRINGS_DE.exhaustedTitle}
        text={STRINGS_DE.exhaustedText}
        action={
          <Button asChild>
            <Link to={paths.puzzlesLearn()}>{STRINGS_DE.toLearning}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <PuzzleTrainer
      key={current.puzzle.id}
      puzzle={current.puzzle}
      mode="rated"
      modeTitle={STRINGS_DE.puzzlesRated}
      backTo={paths.puzzles()}
      headerMeta={<RatingChip rating={rating} />}
      notice={current.window !== 150 ? STRINGS_DE.windowNotice : undefined}
      statusExtra={<RatingResult result={result} />}
      onAttempt={onAttempt}
      onNext={onNext}
      nextLoading={nextLoading}
    />
  );
}

/** Bewertete Puzzles (lazy route module). */
export function Component() {
  usePageTitle(STRINGS_DE.puzzlesRated);
  const { data } = useServices();
  data.activity.useTracking('puzzles');
  const bank = usePuzzleBank();
  const rating = usePuzzleRating();
  if (bank.status === 'error') return <PuzzleError title={STRINGS_DE.puzzlesRated} onRetry={bank.retry} />;
  if (bank.status === 'loading' || rating === undefined) return <PuzzleLoading title={STRINGS_DE.puzzlesRated} />;
  if (rating === null) return <SelfAssessmentPrompt title={STRINGS_DE.puzzlesRated} />;
  return <RatedSession />;
}
