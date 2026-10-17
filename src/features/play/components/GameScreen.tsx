import { EllipsisVertical, Flag, Handshake, Lightbulb, Undo2 } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices, useSettings } from '@/app/services';
import type { SquareMark } from '@/core/chess';
import { formatEval } from '@/i18n';
import { boardPieces, formatSan, parseUci, uciToSan } from '@/lib/chess';
import { Board, BoardMenu, FlipBoardButton } from '@/ui/board';
import { EvalBar, MoveList } from '@/ui/chess';
import { BoardLayout } from '@/ui/layout';
import { Badge, Banner, Button, CoachBubble, ErrorState, IconButton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives';
import { COACH_AVATAR } from '@/bots';
import type { GameController, GameView } from '../controller';
import { capturedBy, claimMessageDe, endMessageDe, materialLead, yourPieceAccusativeDe } from '../logic';
import { rematch } from '../startGame';
import { STRINGS_DE } from '../strings.de';
import { BotAvatar } from './BotAvatar';
import { ExplanationView } from './ExplanationView';
import { ConfirmMoveDialog, ResignDialog, ResultBody, ResultDialog, TakeoverDialog } from './GameDialogs';
import { PlayerBar } from './PlayerBar';

const menuItemClass =
  'flex h-11 cursor-pointer select-none items-center gap-3 rounded-sm px-3 text-body text-text outline-none data-[highlighted]:bg-surface-3 data-[disabled]:cursor-not-allowed data-[disabled]:text-disabled';

/** Props of `GameScreen`. */
export interface GameScreenProps {
  controller: GameController;
  view: GameView;
}

/**
 * The game screen (DESIGN §3.3–§3.5, §4.7, §5.3, §8.2): board with player bars, eval bar (Training/Coach), panel with
 * Coach/Züge tabs, action bar, coach warning, claims, resignation, result, takeover.
 */
export function GameScreen({ controller, view }: GameScreenProps) {
  const services = useServices();
  const notation = useSettings((s) => s.notation);
  const navigate = useNavigate();
  const bot = view.bot!;
  const game = view.game!;
  const level = game.assistance ?? 'competition';
  const helps = level !== 'competition';
  const [orientation, setOrientation] = useState<'white' | 'black'>(view.userColor === 'w' ? 'white' : 'black');
  const [tab, setTab] = useState<'coach' | 'moves'>(helps ? 'coach' : 'moves');
  const [resignOpen, setResignOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const wasActive = useRef(view.phase === 'active');
  const rethinkRef = useRef<HTMLButtonElement>(null);

  // Open the result dialog when the game ends while it is open here.
  useEffect(() => {
    if (view.phase === 'active') wasActive.current = true;
    if (view.phase === 'finished' && wasActive.current) {
      wasActive.current = false;
      setResultOpen(true);
    }
  }, [view.phase]);

  // Coach warning: focus "Nochmal überlegen", Esc = rethink (DESIGN §5.3).
  const warningActive = view.warning !== null;
  useEffect(() => {
    if (!warningActive) return undefined;
    rethinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controller.answerWarning(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warningActive, controller]);

  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'));
  const userColor = view.userColor;
  const botColor = userColor === 'w' ? 'b' : 'w';
  const status = view.status;
  const over = view.phase === 'finished' || status.isOver;
  const userTurn = !over && status.turn === userColor;
  const canMove =
    view.phase === 'active' && !view.readOnly && userTurn && !view.botThinking && !view.warning && !view.confirm && !view.ownClaim;
  const turnClaims = canMove && status.claimableDraws.length > 0 ? status.claimableDraws : null;
  const claimKinds = view.ownClaim ?? turnClaims;
  const last = view.history[view.history.length - 1];
  const captured = capturedBy(view.history);

  // Board decorations.
  const marks: SquareMark[] = [];
  const hintMove = view.hint.move ? parseUci(view.hint.move) : null;
  if (hintMove && view.hint.stage >= 1) marks.push({ square: hintMove.from, kind: 'hint-piece' });
  if (view.warning) marks.push({ square: view.warning.to, kind: 'danger' });
  const annotations =
    view.praise && view.history.length === view.praise.ply ? [{ square: view.praise.square, classification: view.praise.classification }] : [];

  const statusText = (() => {
    if (view.phase === 'finished' && view.outcome) return endMessageDe(view.outcome.reason, view.outcome.result, userColor, bot.name, view.outcome.claimant);
    if (view.botThinking) return STRINGS_DE.thinking(bot.name);
    if (status.turn === userColor) return status.inCheck ? STRINGS_DE.inCheck : STRINGS_DE.yourTurn;
    return STRINGS_DE.botTurn(bot.name);
  })();

  const hintText = (() => {
    if (view.hint.loading) return STRINGS_DE.hintLoading;
    if (view.hint.failed) return STRINGS_DE.hintFailed;
    if (!hintMove || view.hint.stage === 0) return null;
    const piece = boardPieces(view.fen).find((p) => p.square === hintMove.from)?.type ?? null;
    if (view.hint.stage === 1 && piece) return STRINGS_DE.hintPiece(yourPieceAccusativeDe(piece), hintMove.from);
    const san = uciToSan(view.fen, view.hint.move!);
    return san ? STRINGS_DE.hintMove(formatSan(san, notation)) : null;
  })();

  const botAvatar = <BotAvatar bot={bot} size="sm" />;
  const userAvatar = (
    <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent-text md:size-8">
      {STRINGS_DE.you.slice(0, 1)}
    </span>
  );
  const botBar = (
    <PlayerBar
      testId="player-bar-bot"
      name={bot.name}
      elo={bot.elo}
      avatar={botAvatar}
      color={botColor}
      captured={captured[botColor]}
      lead={materialLead(captured, botColor)}
      thinking={view.botThinking}
    />
  );
  const userBar = (
    <PlayerBar testId="player-bar-user" name={STRINGS_DE.you} avatar={userAvatar} color={userColor} captured={captured[userColor]} lead={materialLead(captured, userColor)} />
  );
  const bottomIsUser = (orientation === 'white') === (userColor === 'w');

  const result = view.outcome
    ? {
        outcome: view.outcome,
        userColor,
        bot,
        rated: level === 'competition',
        onAnalyse: () => void navigate(paths.analysisGame(game.id)),
        onRematch: () => {
          void rematch(services, game, bot).then((g) => navigate(paths.playGame(g.id)));
        },
        onNewGame: () => void navigate(paths.play()),
      }
    : null;

  const menu = <BoardMenu onFlip={flip} />;
  const evalText = view.evaluation ? formatEval(view.evaluation) : null;

  const movesPanel = view.history.length ? (
    <MoveList moves={view.history} currentPly={view.history.length} variant="list" />
  ) : (
    <p className="text-body text-muted">{STRINGS_DE.noMovesYet}</p>
  );

  const coachPanel = (
    <div className="flex flex-col gap-4" aria-live="polite">
      {view.botChat && (
        <CoachBubble name={bot.name} avatarSrc={bot.avatar}>
          {view.botChat}
        </CoachBubble>
      )}
      {hintText && (
        <CoachBubble name={STRINGS_DE.coachName} avatarSrc={COACH_AVATAR} tone="neutral">
          <span data-testid="hint-text">{hintText}</span>
        </CoachBubble>
      )}
      {view.notes.map((n, i) => (
        <CoachBubble
          key={n.id}
          name={STRINGS_DE.coachName}
          avatarSrc={COACH_AVATAR}
          tone={n.tone}
          className={i > 0 ? 'opacity-80' : undefined}
        >
          <span data-testid={`coach-note-${n.tone}`}>
            <strong className="font-semibold">{n.lead}</strong> {n.explanation ? <ExplanationView explanation={n.explanation} notation={notation} /> : n.text}
          </span>
        </CoachBubble>
      ))}
      <CoachBubble name={STRINGS_DE.coachName} avatarSrc={COACH_AVATAR}>
        {level === 'coach' ? STRINGS_DE.coachIntro : STRINGS_DE.trainingIntro}
      </CoachBubble>
    </div>
  );

  const panel = (
    <div className="flex flex-col gap-3" data-testid="game-panel" data-coach-ready={view.coachReady ? 'true' : 'false'}>
      <p role="status" data-testid="game-status" className="text-body text-text">
        {statusText}
        {helps && evalText && <span className="text-muted md:hidden"> · {STRINGS_DE.evalLabel(evalText)}</span>}
      </p>
      {view.history.length === 0 && view.phase === 'active' && (
        <p className="text-body-sm text-muted">{STRINGS_DE.gameStart(userColor, bot.name, bot.elo)}</p>
      )}
      {view.readOnly && view.phase === 'active' && (
        <Banner
          tone="warning"
          className="rounded-md"
          action={
            <Button size="sm" variant="secondary" onClick={() => void controller.takeOver()}>
              {STRINGS_DE.takeoverConfirm}
            </Button>
          }
        >
          {view.takenOver ? STRINGS_DE.takenOverBanner : STRINGS_DE.readOnlyBanner}
        </Banner>
      )}
      {view.actionError && <ErrorState message={view.actionError} onRetry={() => controller.retry()} retryLabel={STRINGS_DE.retry} />}
      {view.warning && (
        <CoachBubble
          name={STRINGS_DE.coachName}
          avatarSrc={COACH_AVATAR}
          tone="danger"
          details={
            view.warning.assessment.facts.bestLine.length > 0 ? (
              <p className="text-body-sm text-muted">
                {STRINGS_DE.bestLineLabel} {view.warning.assessment.facts.bestLine.slice(0, 4).map((san) => formatSan(san, notation)).join(' ')}
              </p>
            ) : undefined
          }
          actions={
            <>
              <Button ref={rethinkRef} onClick={() => controller.answerWarning(false)}>
                {STRINGS_DE.warningRethink}
              </Button>
              <Button variant="secondary" onClick={() => controller.answerWarning(true)}>
                {STRINGS_DE.warningPlayAnyway}
              </Button>
            </>
          }
        >
          <span data-testid="coach-warning">
            <strong className="font-semibold">{STRINGS_DE.warningLead}</strong> <ExplanationView explanation={view.warning.explanation} notation={notation} />
          </span>
        </CoachBubble>
      )}
      {claimKinds && (
        <div role="status" className="flex flex-col gap-2 rounded-md bg-info-subtle p-3" data-testid="claim-offer">
          <p className="text-body text-text">{claimMessageDe(claimKinds, view.ownClaim !== null)}</p>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Handshake />} onClick={() => controller.claimDraw()}>
              {STRINGS_DE.claimDraw}
            </Button>
            {view.ownClaim && (
              <Button variant="secondary" onClick={() => controller.declineClaim()}>
                {STRINGS_DE.claimContinue}
              </Button>
            )}
          </div>
        </div>
      )}
      {result && !resultOpen && (
        <section data-testid="result-panel" className="rounded-md border border-border p-3">
          <ResultBody {...result} />
        </section>
      )}
      {helps ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'coach' | 'moves')} className="flex flex-col">
          <TabsList aria-label={STRINGS_DE.panelTabs}>
            <TabsTrigger value="coach">{STRINGS_DE.tabCoach}</TabsTrigger>
            <TabsTrigger value="moves">{STRINGS_DE.tabMoves}</TabsTrigger>
          </TabsList>
          <TabsContent value="coach" className="pt-4">
            {coachPanel}
          </TabsContent>
          <TabsContent value="moves" className="pt-4">
            {movesPanel}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col gap-3">
          {view.botChat && (
            <CoachBubble name={bot.name} avatarSrc={bot.avatar}>
              {view.botChat}
            </CoachBubble>
          )}
          <h2 className="text-body-sm font-medium text-muted">{STRINGS_DE.tabMoves}</h2>
          {movesPanel}
        </div>
      )}
    </div>
  );

  const playing = view.phase === 'active' && !view.readOnly;
  const actions = !playing ? (
    result ? (
      <>
        <Button className="min-w-0 flex-1 lg:flex-none" onClick={result.onAnalyse}>
          {STRINGS_DE.analyse}
        </Button>
        <FlipBoardButton onFlip={flip} className="ml-auto" />
      </>
    ) : (
      <FlipBoardButton onFlip={flip} className="ml-auto" />
    )
  ) : helps ? (
    <>
      <IconButton label={STRINGS_DE.takeback} icon={<Undo2 />} disabled={!controller.canTakeback()} onClick={() => controller.takeback()} />
      <IconButton
        label={view.hint.stage === 1 ? STRINGS_DE.hintMore : STRINGS_DE.hint}
        icon={<Lightbulb />}
        disabled={!canMove || view.hint.stage === 2 || view.hint.loading}
        onClick={() => void controller.requestHint()}
      />
      <FlipBoardButton onFlip={flip} />
      <GameMenu canClaim={claimKinds !== null} onClaim={() => controller.claimDraw()} onResign={() => setResignOpen(true)} />
    </>
  ) : (
    <>
      <Button variant="secondary" icon={<Flag />} onClick={() => setResignOpen(true)}>
        {STRINGS_DE.resign}
      </Button>
      <FlipBoardButton onFlip={flip} />
      {claimKinds && (
        <Button className="ml-auto" icon={<Handshake />} onClick={() => controller.claimDraw()}>
          {STRINGS_DE.claimDraw}
        </Button>
      )}
    </>
  );

  return (
    <>
      <BoardLayout
        title={STRINGS_DE.gameTitle(bot.name)}
        backTo={paths.play()}
        menu={menu}
        panelHeader={
          <div className="flex items-center gap-3">
            <BotAvatar bot={bot} size="md" />
            <div className="min-w-0 flex-1">
              <p aria-hidden="true" className="truncate text-h3 text-text">
                {bot.name} <span className="text-body text-muted tabular-nums">{bot.elo}</span>
              </p>
              <Badge tone={level === 'competition' ? 'neutral' : 'accent'}>{STRINGS_DE.levelChip(STRINGS_DE.levels[level])}</Badge>
            </div>
            {menu}
          </div>
        }
        playerTop={bottomIsUser ? botBar : userBar}
        playerBottom={bottomIsUser ? userBar : botBar}
        evalBar={helps ? <EvalBar score={view.evaluation} orientation={orientation} direction="vertical" /> : undefined}
        evalBarHorizontal={helps ? <EvalBar score={view.evaluation} orientation={orientation} direction="horizontal" /> : undefined}
        board={
          <Board
            fen={view.fen}
            orientation={orientation}
            interactive={canMove}
            onMoveAttempt={(input) => controller.attemptMove(input)}
            onMove={(m) => controller.commitMove(m)}
            lastMove={last ? { from: last.from, to: last.to } : null}
            arrows={controller.arrows()}
            marks={marks}
            annotations={annotations}
            onFlip={flip}
            label={STRINGS_DE.gameTitle(bot.name)}
          />
        }
        panelTabs={panel}
        actions={actions}
      />
      <ResignDialog open={resignOpen} onOpenChange={setResignOpen} onResign={() => controller.resign()} />
      <TakeoverDialog open={view.takeoverPrompt} onTakeOver={() => void controller.takeOver()} onCancel={() => controller.dismissTakeover()} />
      <ConfirmMoveDialog san={view.confirm ? formatSan(view.confirm.san, notation) : null} onAnswer={(ok) => controller.answerConfirm(ok)} />
      {result && <ResultDialog open={resultOpen} onOpenChange={setResultOpen} {...result} />}
    </>
  );
}

function GameMenu({ canClaim, onClaim, onResign }: { canClaim: boolean; onClaim: () => void; onResign: () => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton label={STRINGS_DE.moreActions} icon={<EllipsisVertical />} tooltip={false} className="ml-auto" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" side="top" sideOffset={4} className="z-50 min-w-52 rounded-md bg-surface-2 p-1 shadow-2">
          <DropdownMenu.Item className={menuItemClass} disabled={!canClaim} onSelect={onClaim}>
            <Handshake aria-hidden="true" className="size-5 text-muted" />
            {STRINGS_DE.claimDraw}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass} onSelect={onResign}>
            <Flag aria-hidden="true" className="size-5 text-muted" />
            {STRINGS_DE.resign}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
