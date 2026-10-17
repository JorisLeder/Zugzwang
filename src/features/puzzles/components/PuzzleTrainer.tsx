/**
 * Board screen of one puzzle (DESIGN §3.3–§3.5, §8.1, §8.2): board, panel (task, feedback, hints, result, motif tags,
 * explanation, solution replay) and action bar (Hinweis · Brett drehen · Nächstes Puzzle). Shared by rated, learning,
 * theme and demo mode. Remount it with a `key` per puzzle.
 *
 * `onAttempt` is called exactly once per puzzle: in rated mode at the first wrong move, confirmed hint or shown
 * solution (D-11), when the learner leaves an unfinished rated puzzle, or at the end; in the other modes at the end.
 */
import { Swords } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import type { SquareMark } from '@/core/chess';
import type { Puzzle } from '@/core/puzzles';
import { formatNumber } from '@/i18n';
import { cn } from '@/lib/cn';
import {
  hintSquares,
  hintTextDe,
  isFailedForRating,
  motifHintDe,
  puzzleExplanation,
  puzzleStartFen,
  reviewPositions,
  sessionOutcome,
  sideToMoveDe,
  solverColor,
  taskTextDe,
  type PuzzleOutcome,
  type PuzzleSessionMode,
  type PuzzleSessionState,
} from '@/puzzles';
import { Board, BoardMenu, FlipBoardButton, type Orientation } from '@/ui/board';
import { NavigationControls } from '@/ui/chess';
import { BoardLayout } from '@/ui/layout';
import { Button, Dialog, DialogContent } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';
import { usePuzzleController, type PuzzleTimings } from '../usePuzzleController';
import { perfMeasureSwitch, usePuzzleShortcuts } from '../usePuzzleData';
import { PuzzleExplanation } from './PuzzleExplanation';

/** Props of `PuzzleTrainer`. */
export interface PuzzleTrainerProps {
  puzzle: Puzzle;
  mode: PuzzleSessionMode;
  /** Mode name in the desktop panel header ("Bewertete Puzzles", "Themen-Training: Gabel"). */
  modeTitle: string;
  /** Target of the phone top bar's back link (the area hub). */
  backTo: string;
  /** Chips next to the side to move (own rating, demo progress). */
  headerMeta?: ReactNode;
  /** Short line above the task (rating window widened, demo notice). */
  notice?: ReactNode;
  /** Result line under the status, e.g. the new rating with delta (shown as soon as it exists). */
  statusExtra?: ReactNode;
  onAttempt?: (outcome: PuzzleOutcome, timeMs: number) => void;
  /** "Nächstes Puzzle" after the end. */
  onNext?: () => void;
  nextLoading?: boolean;
  /** Replaces "Nächstes Puzzle" after the end (demo call to action). */
  endAction?: ReactNode;
  /** Extra panel content after the end. */
  endContent?: ReactNode;
  /** "Gegen Bot ausspielen" after the end (default true). */
  playVsBot?: boolean;
  /** Thumbs up/down under the explanation (default true). */
  explanationFeedback?: boolean;
  /** ⋮ board menu (Töne, Einstellungen; default true – off in the demo, which persists nothing). */
  showMenu?: boolean;
  timings?: PuzzleTimings;
}

function statusLine(state: PuzzleSessionState): string {
  const rated = state.mode === 'rated';
  switch (state.phase) {
    case 'intro':
      return taskTextDe(state.puzzle);
    case 'wrong':
      return rated ? STRINGS_DE.wrongRated : STRINGS_DE.wrongLearning;
    case 'solution':
      return STRINGS_DE.solutionPlaying;
    case 'done':
      if (state.solutionShown) return STRINGS_DE.solutionShown;
      if (rated && isFailedForRating(state)) return STRINGS_DE.finishedAfterFail;
      return STRINGS_DE.solved;
    default:
      if (state.lastVerdict === 'correct' || state.lastVerdict === 'mate') return STRINGS_DE.correct;
      if (state.lastVerdict === 'wrong') return rated ? STRINGS_DE.wrongRated : STRINGS_DE.wrongLearning;
      return taskTextDe(state.puzzle);
  }
}

function hintButtonLabel(stage: number): string {
  if (stage === 0) return STRINGS_DE.hint;
  return stage === 1 ? STRINGS_DE.hintMore : STRINGS_DE.showSolution;
}

/** Board screen of one puzzle. */
export function PuzzleTrainer({
  puzzle,
  mode,
  modeTitle,
  backTo,
  headerMeta,
  notice,
  statusExtra,
  onAttempt,
  onNext,
  nextLoading = false,
  endAction,
  endContent,
  playVsBot = true,
  explanationFeedback = true,
  showMenu = true,
  timings,
}: PuzzleTrainerProps) {
  const { explain } = useServices();
  const navigate = useNavigate();
  const ctl = usePuzzleController(puzzle, mode, timings);
  const { state } = ctl;
  const done = state.phase === 'done';
  const [orientation, setOrientation] = useState<Orientation>(() => (solverColor(puzzle) === 'w' ? 'white' : 'black'));
  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), []);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Attempt reporting (exactly once).
  const reportedRef = useRef(false);
  const [reported, setReported] = useState(false);
  const report = useCallback(
    (s: PuzzleSessionState) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      setReported(true);
      onAttempt?.(sessionOutcome(s), ctl.elapsedMs());
    },
    [onAttempt, ctl],
  );
  useEffect(() => {
    if (done || (mode === 'rated' && isFailedForRating(state))) report(state);
  }, [state, done, mode, report]);

  useEffect(() => perfMeasureSwitch(), []);
  useEffect(() => {
    if (done) nextRef.current?.focus();
  }, [done]);

  // Leaving an unfinished rated puzzle counts as not solved (DESIGN §3.4).
  const inProgress = mode === 'rated' && !reported && !done;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => inProgress && currentLocation.pathname !== nextLocation.pathname);

  const canHint = state.phase === 'user';
  const hint = useCallback(() => {
    if (state.phase === 'user') ctl.hint();
  }, [state.phase, ctl]);
  usePuzzleShortcuts({ onHint: canHint ? hint : undefined, onNext: done && onNext ? onNext : undefined, onFlip: flip });

  const positions = useMemo(() => reviewPositions(state), [state]);
  const lastIndex = positions.length - 1;
  const reviewing = done && reviewIndex !== null && reviewIndex !== lastIndex;
  const shown = reviewing ? positions[reviewIndex]! : null;

  const squares = hintSquares(state);
  const marks: SquareMark[] = [];
  if (squares.piece) marks.push({ square: squares.piece, kind: 'hint-piece' });
  if (squares.target) marks.push({ square: squares.target, kind: 'hint-target' });

  const taskFen = state.line.at(-1)?.fenAfter ?? state.fen;
  const solutionUci = state.puzzle.moves[state.ply];
  const hintText =
    (state.phase === 'user' || state.phase === 'wrong') && (state.hintStage === 1 || state.hintStage === 2) && solutionUci
      ? hintTextDe(taskFen, solutionUci, state.hintStage, { motif: mode === 'rated' ? null : motifHintDe(puzzle) })
      : null;
  const failedRated = mode === 'rated' && isFailedForRating(state);
  const explanation = useMemo(() => (done ? puzzleExplanation(puzzle, explain) : null), [done, puzzle, explain]);
  const sideToMove = sideToMoveDe(puzzle);
  const menu = showMenu ? <BoardMenu onFlip={flip} /> : undefined;

  const panel = (
    <div className="flex flex-col gap-4" data-testid="puzzle-panel" data-phase={state.phase} data-puzzle-id={puzzle.id}>
      {/* Phones and tablets have no panel header: name the mode (and the motif in Themen-Training) here. */}
      <p className="text-caption text-muted lg:hidden">{modeTitle}</p>
      {headerMeta && <div className="flex flex-wrap items-center gap-2">{headerMeta}</div>}
      {notice && <p className="text-body-sm text-muted">{notice}</p>}
      <div className="flex flex-col gap-2">
        <p role="status" aria-live="polite" data-testid="puzzle-status" className="text-body-lg font-semibold text-text">
          {statusLine(state)}
        </p>
        {statusExtra}
        {hintText && (
          <p data-testid="puzzle-hint" className="text-body text-text">
            {hintText}
          </p>
        )}
        {state.hintWarning && (
          <p role="status" data-testid="hint-warning" className="text-body-sm text-warning-text">
            {STRINGS_DE.ratedHintWarning}
          </p>
        )}
        {failedRated && !done && state.phase !== 'solution' && (
          <div>
            <Button variant="link" onClick={ctl.showSolution}>
              {STRINGS_DE.showSolution}
            </Button>
          </div>
        )}
      </div>
      {done && (
        <>
          <p className="text-body-sm text-muted" data-testid="puzzle-difficulty">
            {STRINGS_DE.puzzleDifficulty(formatNumber(puzzle.rating))}
          </p>
          <PuzzleExplanation puzzle={puzzle} explanation={explanation} feedback={explanationFeedback} />
          {positions.length > 1 && (
            <section aria-label={STRINGS_DE.replaySolution} className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm text-muted">{STRINGS_DE.replaySolution}</span>
              <NavigationControls ply={reviewIndex ?? lastIndex} maxPly={lastIndex} onNavigate={setReviewIndex} />
              <span className="sr-only" aria-live="polite">
                {STRINGS_DE.replayPosition((reviewIndex ?? lastIndex) + 1, positions.length)}
              </span>
            </section>
          )}
          {playVsBot && (
            <div>
              <Button variant="secondary" icon={<Swords />} onClick={() => void navigate(paths.playFromPosition(puzzleStartFen(puzzle)))}>
                {STRINGS_DE.playVsBot}
              </Button>
            </div>
          )}
          {endContent}
        </>
      )}
    </div>
  );

  const actions = (
    <>
      {!done && (
        <Button
          variant="secondary"
          onClick={hint}
          disabled={!canHint}
          aria-keyshortcuts="H"
          data-testid="hint-button"
          className={cn(mode !== 'rated' && state.wrongMoves >= 2 && state.hintStage === 0 && 'outline-2 outline-accent')}
        >
          {hintButtonLabel(state.hintStage)}
        </Button>
      )}
      <FlipBoardButton onFlip={flip} className={cn(done && 'order-first')} />
      {done && (endAction ?? (onNext && (
        <Button ref={nextRef} variant="primary" className="ml-auto flex-1 lg:flex-none" loading={nextLoading} onClick={onNext} aria-keyshortcuts="Enter" data-testid="next-puzzle">
          {STRINGS_DE.next}
        </Button>
      )))}
    </>
  );

  return (
    <>
      <BoardLayout
        title={sideToMove}
        backTo={backTo}
        menu={menu}
        panelHeader={
          <div className="flex flex-col gap-1">
            <p className="text-caption text-muted">{modeTitle}</p>
            <div className="flex items-center gap-2">
              <p aria-hidden="true" className="min-w-0 flex-1 text-h3 text-text">
                {sideToMove}
              </p>
              {menu}
            </div>
          </div>
        }
        board={
          <Board
            fen={shown ? shown.fen : state.fen}
            orientation={orientation}
            interactive={state.phase === 'user'}
            onMove={ctl.userMove}
            lastMove={shown ? shown.lastMove : state.lastMove}
            marks={reviewing ? [] : marks}
            feedback={reviewing ? null : state.feedback}
            onFlip={flip}
          />
        }
        panelTabs={panel}
        actions={actions}
      />
      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent title={STRINGS_DE.leaveTitle} description={STRINGS_DE.leaveText} variant="dialog">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              {STRINGS_DE.stay}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                report(state);
                blocker.proceed?.();
              }}
            >
              {STRINGS_DE.leave}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
