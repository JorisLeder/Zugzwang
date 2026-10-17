import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useServices } from '@/app/services';
import type { Puzzle } from '@/core/puzzles';
import { puzzleAttemptInput, type PuzzleOutcome } from '@/puzzles';
import { PERF, perfMark } from '../usePuzzleData';
import { PuzzleError, PuzzleLoading } from './PuzzlePageStates';
import { PuzzleTrainer } from './PuzzleTrainer';

/** Props of `UnratedSession`. */
export interface UnratedSessionProps {
  mode: 'learning' | 'theme';
  /** Page title (loading/error states, document title). */
  title: string;
  /** Mode name in the panel header. */
  modeTitle: string;
  backTo: string;
  /** Picks the next puzzle: avoid `seen` (this session) and `currentId`; `null` = nothing matches. */
  select: (seen: ReadonlySet<string>, currentId?: string) => Promise<Puzzle | null>;
  /** Puzzle to start with (deep link `?puzzle=`), if it exists. */
  firstPuzzle?: () => Promise<Puzzle | null>;
  headerMeta?: ReactNode;
  /** Shown when `select` finds nothing at all. */
  empty: ReactNode;
}

/**
 * Lernmodus and Themen-Training (P0-05, P0-06): unrated, hints and playable solution, explanation after every
 * puzzle, retry after wrong moves. Every finished puzzle is recorded with its mode, so theme statistics update (D-11).
 * The next puzzle is selected as soon as the current one ends.
 */
export function UnratedSession({ mode, title, modeTitle, backTo, select, firstPuzzle, headerMeta, empty }: UnratedSessionProps) {
  const { data } = useServices();
  const [puzzle, setPuzzle] = useState<Puzzle | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [nextLoading, setNextLoading] = useState(false);
  const seen = useRef(new Set<string>());
  const prefetched = useRef<Promise<Puzzle | null> | null>(null);

  const show = useCallback((p: Puzzle | null) => {
    if (p) seen.current.add(p.id);
    setPuzzle(p);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => (firstPuzzle ? await firstPuzzle() : null) ?? select(seen.current))().then(
      (p) => alive && show(p),
      (e: unknown) => {
        console.warn('Puzzle selection failed', e);
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [firstPuzzle, select, show]);

  const onAttempt = useCallback(
    (outcome: PuzzleOutcome, timeMs: number) => {
      if (!puzzle) return;
      data.progress.recordPuzzleAttempt(puzzleAttemptInput(puzzle, mode, outcome, timeMs)).catch((e: unknown) => console.warn('Puzzle attempt not saved', e));
      prefetched.current = select(seen.current, puzzle.id);
      prefetched.current.catch(() => {});
    },
    [data, mode, puzzle, select],
  );

  const onNext = useCallback(() => {
    perfMark(PERF.next);
    setNextLoading(true);
    const next = prefetched.current ?? select(seen.current, puzzle?.id);
    prefetched.current = null;
    next.then(
      (p) => {
        setNextLoading(false);
        show(p);
      },
      (e: unknown) => {
        console.warn('Puzzle selection failed', e);
        setNextLoading(false);
        setFailed(true);
      },
    );
  }, [puzzle, select, show]);

  if (failed) return <PuzzleError title={title} />;
  if (puzzle === undefined) return <PuzzleLoading title={title} />;
  if (puzzle === null) return <>{empty}</>;
  return (
    <PuzzleTrainer
      key={puzzle.id}
      puzzle={puzzle}
      mode={mode}
      modeTitle={modeTitle}
      backTo={backTo}
      headerMeta={headerMeta}
      onAttempt={onAttempt}
      onNext={onNext}
      nextLoading={nextLoading}
    />
  );
}
