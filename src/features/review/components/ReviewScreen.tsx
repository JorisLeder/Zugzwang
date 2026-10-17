import { ChevronLeft, ChevronRight, Keyboard, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices, useSettings } from '@/app/services';
import type { Arrow, Color, SquareMark } from '@/core/chess';
import { parseUci } from '@/lib/chess';
import { Board, BoardMenu, FlipBoardButton, type BoardFeedback } from '@/ui/board';
import { EvalBar, MoveList, NavigationControls, isOwnKeyTarget, usePlyNavigation } from '@/ui/chess';
import { BoardLayout } from '@/ui/layout';
import {
  Banner,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  ProgressBar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/ui/primitives';
import { retryDone, retryFen, retryMarks } from '../retry';
import {
  annotationFor,
  bestMoveArrows,
  canRetry,
  classificationsByPly,
  evalAtPly,
  gameDateLabel,
  gameTitle,
  keyMomentFrom,
  playerInfo,
  resultLabel,
  type PlayerInfo,
} from '../review';
import type { ReviewController, ReviewState } from '../reviewController';
import { STRINGS_DE } from '../strings.de';
import { useRetry } from '../useRetry';
import { MoveDetail } from './MoveDetail';
import { RetryPanel } from './RetryPanel';
import { ReviewSummary } from './ReviewSummary';

/** Props of `ReviewScreen`. */
export interface ReviewScreenProps {
  controller: ReviewController;
  state: ReviewState;
  /** The game had been imported before (PGN import opened the existing game). */
  duplicate?: boolean;
}

/**
 * Game review screen (P0-10, P0-11, PRD §3): board with classification symbol at the moved piece, best-move arrow,
 * eval bar and player bars; panel with the analysis progress, the current move (explanation, "Nochmal versuchen",
 * "Variante erkunden"), the summary (accuracy, counts, eval graph, key moments) and the move list.
 * Keys: ←/→/Pos1/Ende (moves), ↑/↓ (key moments), Enter (retry at a mistake), `?` (shortcuts).
 */
export function ReviewScreen({ controller, state, duplicate = false }: ReviewScreenProps) {
  const services = useServices();
  const notation = useSettings((s) => s.notation);
  const navigate = useNavigate();
  const game = state.game!;
  const moves = state.moves;
  const analysis = state.analysis;
  const maxPly = moves.length;
  const [ply, setPly] = useState(0);
  const [tab, setTab] = useState<'summary' | 'moves'>('summary');
  const [orientation, setOrientation] = useState<'white' | 'black'>(game.userColor === 'b' ? 'black' : 'white');
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set());
  const [votes, setVotes] = useState<Record<number, 1 | -1>>({});
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const markRevealed = useCallback((p: number) => setRevealed((s) => (s.has(p) ? s : new Set([...s, p]))), []);
  const retry = useRetry(services.analysis, (s) => markRevealed(s.ply));
  const { start: retryStart, stop: retryStop } = retry;
  const retrying = retry.state !== null;

  const players = useMemo(() => playerInfo(game, services.botRoster), [game, services.botRoster]);
  const classifications = useMemo(() => classificationsByPly(analysis), [analysis]);
  const analysed = ply > 0 ? analysis?.moves[ply - 1] : undefined;
  const move = ply > 0 ? moves[ply - 1] : undefined;

  const goTo = useCallback(
    (p: number) => {
      retryStop();
      setPly(Math.max(0, Math.min(maxPly, p)));
    },
    [maxPly, retryStop],
  );
  const nav = usePlyNavigation({ maxPly, ply, onPlyChange: goTo, keyboard: !retrying && !shortcutsOpen });

  const startRetry = useCallback(() => {
    if (analysed && canRetry(analysed)) retryStart(analysed);
  }, [analysed, retryStart]);

  // ↑/↓ key moments, Enter = retry, ? = shortcuts (not while typing or inside widgets with own keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isOwnKeyTarget(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (retrying || shortcutsOpen || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (e.key === 'Enter') {
        if (target && target !== document.body && target.closest('button, a, summary, input, textarea, select, [role="slider"]')) return;
        if (analysed && canRetry(analysed) && !revealed.has(ply)) {
          e.preventDefault();
          startRetry();
        }
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const next = keyMomentFrom(analysis?.keyMoments ?? [], ply, e.key === 'ArrowDown' ? 1 : -1);
      if (next !== null) {
        e.preventDefault();
        goTo(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analysis, analysed, goTo, ply, retrying, revealed, shortcutsOpen, startRetry]);

  // Thumbs up/down: load an earlier vote for the shown explanation.
  const feedbackRef = `${game.id}:${ply}`;
  useEffect(() => {
    if (ply === 0 || votes[ply] !== undefined) return undefined;
    let cancelled = false;
    services.data.repos.explanationFeedback
      .get('analysis', feedbackRef)
      .then((f) => {
        if (!cancelled && f) setVotes((v) => ({ ...v, [ply]: f.vote }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [feedbackRef, ply, services, votes]);
  const vote = (value: 1 | -1) => {
    setVotes((v) => ({ ...v, [ply]: value }));
    void services.data.progress.recordExplanationFeedback({ context: 'analysis', ref: feedbackRef, vote: value }).catch(() => undefined);
  };

  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'));
  const positionFen = ply === 0 ? state.startFen : moves[ply - 1]!.fenAfter;
  const explore = () => void navigate(paths.analysisBoard({ fen: retry.state ? retryFen(retry.state) : positionFen }));

  // Board decorations.
  let fen = positionFen;
  let arrows: Arrow[] = bestMoveArrows(analysed, revealed.has(ply));
  let marks: SquareMark[] = [];
  let annotations = annotationFor(analysed);
  let lastMove = move ? { from: move.from, to: move.to } : null;
  let feedback: BoardFeedback | null = null;
  if (retry.state) {
    const r = retry.state;
    fen = retryFen(r);
    marks = retryMarks(r);
    annotations = [];
    lastMove = r.attempt ? { from: parseUci(r.attempt.uci)?.from ?? r.hintFrom, to: r.attempt.to } : null;
    if (r.attempt && (r.phase === 'wrong' || r.phase === 'success')) feedback = { square: r.attempt.to, result: r.phase === 'success' ? 'correct' : 'wrong' };
    arrows = r.phase === 'revealed' ? [{ from: r.hintFrom, to: r.hintTo, kind: 'best' }] : [];
  }
  const score = evalAtPly(analysis, retry.state ? Math.max(0, ply - 1) : ply);

  const bottomColor: Color = orientation === 'white' ? 'w' : 'b';
  const topColor: Color = bottomColor === 'w' ? 'b' : 'w';
  const title = gameTitle(game, services.botRoster);
  const date = gameDateLabel(game);

  const progress = state.progress;
  const progressText = !progress
    ? STRINGS_DE.progress(0, maxPly + 1)
    : progress.phase === 'book'
      ? STRINGS_DE.progressBook
      : progress.phase === 'facts'
        ? STRINGS_DE.progressFacts
        : STRINGS_DE.progress(Math.min(progress.done + 1, progress.total), progress.total);

  const statusArea =
    state.run === 'running' ? (
      <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-3" data-testid="analysis-progress">
        <ProgressBar value={progress?.done ?? 0} max={Math.max(1, progress?.total ?? maxPly + 1)} label={progressText} />
        <div>
          <Button variant="secondary" size="sm" onClick={() => controller.cancel()}>
            {STRINGS_DE.cancel}
          </Button>
        </div>
      </div>
    ) : state.run === 'cancelled' || state.run === 'failed' || (state.run === 'idle' && maxPly > 0 && !analysis) ? (
      <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-3" role="status" data-testid="analysis-stopped">
        <p className="text-body text-text">
          {state.run === 'cancelled' ? STRINGS_DE.cancelled : state.run === 'failed' ? STRINGS_DE.analysisFailed : STRINGS_DE.notAnalysed}
        </p>
        <div>
          <Button size="sm" icon={<RotateCcw />} onClick={() => controller.analyse()}>
            {STRINGS_DE.startAnalysis}
          </Button>
        </div>
      </div>
    ) : null;

  const panel = (
    <div className="flex flex-col gap-4" data-testid="review-panel" data-run={state.run}>
      {duplicate && (
        <Banner tone="info" className="rounded-md">
          {STRINGS_DE.duplicateNotice}
        </Banner>
      )}
      {maxPly === 0 && <p className="text-body text-muted">{STRINGS_DE.noMoves}</p>}
      {statusArea}
      {retry.state && analysed ? (
        <RetryPanel state={retry.state} analysed={analysed} notation={notation} onHint={retry.hint} onReveal={retry.reveal} onBack={retry.stop} />
      ) : (
        <MoveDetail
          ply={ply}
          move={move}
          analysed={analysed}
          firstMove={analysis?.moves[0]}
          revealed={revealed.has(ply)}
          notation={notation}
          vote={votes[ply] ?? null}
          onVote={vote}
          onRetry={startRetry}
          onReveal={() => markRevealed(ply)}
          onExplore={explore}
        />
      )}
      {maxPly > 0 && <NavigationControls ply={nav.ply} maxPly={maxPly} onNavigate={goTo} className="justify-center" />}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'summary' | 'moves')} className="flex flex-col">
        <TabsList aria-label={STRINGS_DE.panelTabs}>
          <TabsTrigger value="summary">{STRINGS_DE.tabSummary}</TabsTrigger>
          <TabsTrigger value="moves">{STRINGS_DE.tabMoves}</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="pt-4">
          {analysis ? (
            <ReviewSummary analysis={analysis} moves={moves} players={players} ply={ply} onSelectPly={goTo} notation={notation} />
          ) : (
            <p className="text-body text-muted">{state.run === 'running' ? progressText : STRINGS_DE.notAnalysed}</p>
          )}
        </TabsContent>
        <TabsContent value="moves" className="pt-4">
          <MoveList moves={moves} currentPly={ply} onSelectPly={goTo} classifications={classifications} notation={notation} variant="list" />
        </TabsContent>
      </Tabs>
      <div>
        <Button variant="link" size="sm" icon={<Keyboard />} onClick={() => setShortcutsOpen(true)}>
          {STRINGS_DE.shortcutsButton}
        </Button>
      </div>
    </div>
  );

  const canRetryHere = !retrying && analysed !== undefined && canRetry(analysed) && !revealed.has(ply);
  const actions = (
    <>
      <IconButton label={STRINGS_DE.prevMove} icon={<ChevronLeft />} disabled={retrying || ply <= 0} onClick={() => goTo(ply - 1)} />
      <IconButton label={STRINGS_DE.nextMove} icon={<ChevronRight />} disabled={retrying || ply >= maxPly} onClick={() => goTo(ply + 1)} />
      {canRetryHere ? (
        <Button className="min-w-0 flex-1 lg:flex-none" icon={<RotateCcw />} onClick={startRetry}>
          {STRINGS_DE.retry}
        </Button>
      ) : (
        <Button variant="secondary" className="min-w-0 flex-1 lg:flex-none" onClick={explore}>
          {STRINGS_DE.explore}
        </Button>
      )}
      <FlipBoardButton onFlip={flip} className="ml-auto" />
    </>
  );

  return (
    <>
      <BoardLayout
        title={STRINGS_DE.analysisGame}
        backTo={paths.analysis()}
        menu={<BoardMenu onFlip={flip} />}
        panelHeader={
          <div className="min-w-0">
            <p aria-hidden="true" className="truncate text-h3 text-text">
              {title}
            </p>
            <p className="text-body-sm text-muted">
              {[date, resultLabel(game)].filter(Boolean).join(' · ')}
            </p>
          </div>
        }
        playerTop={<PlayerBar info={players[topColor]} color={topColor} testId="player-top" />}
        playerBottom={<PlayerBar info={players[bottomColor]} color={bottomColor} testId="player-bottom" />}
        evalBar={<EvalBar score={score} orientation={orientation} direction="vertical" />}
        evalBarHorizontal={<EvalBar score={score} orientation={orientation} direction="horizontal" />}
        board={
          <Board
            fen={fen}
            orientation={orientation}
            interactive={retry.state?.phase === 'thinking'}
            onMove={retry.attempt}
            lastMove={lastMove}
            arrows={arrows}
            marks={marks}
            annotations={annotations}
            feedback={feedback}
            onFlip={flip}
            label={
              retry.state && !retryDone(retry.state)
                ? STRINGS_DE.retryBoardLabel(retry.state.mover === 'w' ? STRINGS_DE.white : STRINGS_DE.black)
                : `${STRINGS_DE.analysisGame}: ${title}`
            }
          />
        }
        panelTabs={panel}
        actions={actions}
      />
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent title={STRINGS_DE.shortcutsTitle} variant="dialog">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            {STRINGS_DE.shortcuts.map(([keys, text]) => (
              <div key={keys} className="contents">
                <dt className="font-semibold text-text tabular-nums">{keys}</dt>
                <dd className="text-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Player bar of the review (DESIGN §4.7): colour dot, name and Elo. */
function PlayerBar({ info, color, testId }: { info: PlayerInfo; color: Color; testId: string }) {
  return (
    <div data-testid={testId} className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full border border-border-strong"
        style={{ backgroundColor: color === 'w' ? 'var(--zz-eval-white)' : 'var(--zz-eval-black)' }}
      />
      <span className="sr-only">{STRINGS_DE.playerLabel(info.name, color === 'w' ? STRINGS_DE.white : STRINGS_DE.black)}</span>
      <span aria-hidden="true" className="truncate text-body-sm font-semibold text-text">
        {info.name}
      </span>
      {info.elo && (
        <span aria-hidden="true" className="text-caption text-muted tabular-nums">
          {info.elo}
        </span>
      )}
    </div>
  );
}
