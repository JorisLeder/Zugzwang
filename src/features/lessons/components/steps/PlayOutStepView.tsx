/**
 * Ausspielen: the learner plays the position against a bot (`botElo`, or full strength for `max`). The goal
 * (checkmate / promote / draw within `maxMoves` own moves) is judged with `ChessGame.status()` after every ply. A
 * failed attempt counts a mistake; "Nochmal versuchen" starts again from the step's FEN.
 */
import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '@/app/services';
import type { MoveRecord } from '@/core/chess';
import { ChessGame, fenTurn } from '@/lib/chess';
import { judgePlayOut, LESSONS_DE, movesLeft, playOutBot, type PlayOutReason, type PlayOutStep, type PlayOutVerdict } from '@/lessons';
import { Board, FlipBoardButton } from '@/ui/board';
import { Button, CoachBubble } from '@/ui/primitives';
import { playSound, soundForMove } from '@/ui/sound';
import { STRINGS_DE } from '../../strings.de';
import { StepText } from './StepText';
import { orientationOf, type StepViewProps } from './stepTypes';

/** Longest pause before a bot move (outside e2e runs). */
const BOT_MAX_WAIT_MS = 1500;

interface PlayState {
  moves: MoveRecord[];
  verdict: PlayOutVerdict;
  error: boolean;
  attempt: number;
}

const INITIAL: PlayState = { moves: [], verdict: null, error: false, attempt: 0 };

function reasonText(reason: PlayOutReason, maxMoves: number): string {
  const R = LESSONS_DE.playOutReason;
  switch (reason) {
    case 'user_mated':
      return R.userMated;
    case 'user_was_mated':
      return R.userWasMated;
    case 'promoted':
      return R.promoted;
    case 'held':
      return R.held;
    case 'drawn':
      return R.drawn;
    case 'stalemate':
      return R.stalemate;
    case 'moves_exhausted':
      return R.movesExhausted(maxMoves);
  }
}

/** Ausspielen. */
export function PlayOutStepView({ step, frame, timings, onComplete, onMistake }: StepViewProps<PlayOutStep>) {
  const { bots, botRoster, config } = useServices();
  const [state, setState] = useState<PlayState>(INITIAL);
  const [orientation, setOrientation] = useState(() => orientationOf(step.userColor));
  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), []);
  const retryRef = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onComplete, onMistake });
  useEffect(() => {
    callbacks.current = { onComplete, onMistake };
  });

  const fen = state.moves.at(-1)?.fenAfter ?? step.fen;
  const userMoves = state.moves.filter((m) => m.color === step.userColor).length;
  const botTurn = !state.verdict && !state.error && fenTurn(fen) !== step.userColor;

  const finish = useCallback((verdict: PlayOutVerdict) => {
    if (!verdict) return;
    if (verdict.outcome === 'success') {
      playSound('success');
      callbacks.current.onComplete();
    } else {
      playSound('error');
      callbacks.current.onMistake();
    }
  }, []);

  // Bot move whenever it is the bot's turn.
  const moves = state.moves;
  useEffect(() => {
    if (!botTurn) return undefined;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bot = playOutBot(botRoster, step.botElo);
    const fail = (err: unknown) => {
      if (ctrl.signal.aborted) return;
      console.warn('Ausspielen: bot move failed', err);
      setState((s) => ({ ...s, error: true }));
    };
    if (!bot) {
      timer = setTimeout(() => fail(new Error('empty bot roster')), 0);
      return () => clearTimeout(timer);
    }
    const t0 = Date.now();
    bots.chooseMove({ bot, startFen: step.fen, moves: moves.map((m) => m.uci), signal: ctrl.signal }).then((move) => {
      if (ctrl.signal.aborted) return;
      const wait = config.e2e ? 0 : Math.max(timings.botMinMs, Math.min(move.thinkTimeMs, BOT_MAX_WAIT_MS) - (Date.now() - t0));
      timer = setTimeout(() => {
        const game = ChessGame.fromMoves(
          step.fen,
          moves.map((m) => m.uci),
        );
        const record = game.move(move.uci);
        if (!record) {
          fail(new Error(`illegal bot move ${move.uci}`));
          return;
        }
        playSound(soundForMove(record));
        const verdict = judgePlayOut(step, {
          status: game.status(),
          mover: 'bot',
          move: record,
          userMoves: moves.filter((m) => m.color === step.userColor).length,
        });
        setState((s) => ({ ...s, moves: [...s.moves, record], verdict }));
        finish(verdict);
      }, wait);
    }, fail);
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [botTurn, moves, bots, botRoster, config.e2e, step, timings.botMinMs, finish]);

  useEffect(() => {
    if (state.verdict?.outcome === 'fail') retryRef.current?.focus();
  }, [state.verdict]);

  const userMove = useCallback(
    (played: MoveRecord) => {
      if (state.verdict || state.error) return;
      const game = ChessGame.fromMoves(
        step.fen,
        state.moves.map((m) => m.uci),
      );
      const record = game.move(played.uci);
      if (!record) return;
      const verdict = judgePlayOut(step, { status: game.status(), mover: 'user', move: record, userMoves: userMoves + 1 });
      setState((s) => ({ ...s, moves: [...s.moves, record], verdict }));
      finish(verdict);
    },
    [state, step, userMoves, finish],
  );

  const retry = () => setState((s) => ({ ...INITIAL, attempt: s.attempt + 1 }));
  const retryBot = () => setState((s) => ({ ...s, error: false }));
  const last = state.moves.at(-1) ?? null;
  const verdict = state.verdict;

  const panel = (
    <div
      className="flex flex-col gap-4"
      data-testid="lesson-step"
      data-step-type="play_out"
      data-step-id={step.id}
      data-outcome={verdict?.outcome}
      data-attempt={state.attempt}
    >
      <StepText text={step.promptDe} />
      <p className="text-body-sm text-muted">
        {STRINGS_DE.goal[step.goal]} · <span data-testid="moves-left">{STRINGS_DE.movesLeft(movesLeft(step, userMoves))}</span>
      </p>
      <p role="status" aria-live="polite" data-testid="play-out-status" className="text-body-lg font-semibold text-text">
        {verdict ? reasonText(verdict.reason, step.maxMoves) : state.error ? STRINGS_DE.botError : botTurn ? STRINGS_DE.botThinking : STRINGS_DE.playOutYourTurn}
      </p>
      {verdict && <CoachBubble tone={verdict.outcome === 'success' ? 'praise' : 'warning'}>{verdict.outcome === 'success' ? step.successDe : step.failDe}</CoachBubble>}
      {verdict?.outcome === 'fail' && (
        <div>
          <Button ref={retryRef} variant="secondary" icon={<RotateCcw />} onClick={retry} data-testid="play-out-retry">
            {STRINGS_DE.retry}
          </Button>
        </div>
      )}
      {state.error && (
        <div>
          <Button variant="secondary" icon={<RotateCcw />} onClick={retryBot}>
            {STRINGS_DE.retry}
          </Button>
        </div>
      )}
    </div>
  );

  return frame({
    board: (
      <Board
        key={state.attempt}
        fen={fen}
        orientation={orientation}
        interactive={!verdict && !state.error && !botTurn}
        onMove={userMove}
        lastMove={last ? { from: last.from, to: last.to } : null}
        onFlip={flip}
      />
    ),
    panel,
    actions: <FlipBoardButton onFlip={flip} />,
  });
}
