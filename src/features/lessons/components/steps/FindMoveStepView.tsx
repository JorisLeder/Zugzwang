/**
 * Finde den Zug (P0-12, P2-04): the learner plays on the board; any accepted move of the move tree at a node is
 * correct, the opponent's reply is auto-played after 500 ms; with `acceptAnyMate` every mating move counts (D-12).
 * A wrong move stays 700 ms with the red mark, is taken back and counts a mistake. Hints: the step's text hints,
 * then the piece, then the target square – each counts.
 */
import { Lightbulb } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { MoveRecord } from '@/core/chess';
import { fenTurn } from '@/lib/chess';
import {
  canRequestHint,
  createFindMove,
  findMoveHint,
  playFindMoveReply,
  requestFindMoveHint,
  revertFindMoveWrong,
  submitFindMove,
  type FindMoveState,
  type FindMoveStep,
} from '@/lessons';
import { Board, FlipBoardButton, type BoardFeedback } from '@/ui/board';
import { Button, CoachBubble } from '@/ui/primitives';
import { playSound, soundForMove } from '@/ui/sound';
import { STRINGS_DE } from '../../strings.de';
import { useShortcut } from '../../useShortcut';
import { StepText } from './StepText';
import { useOrientation, type StepViewProps } from './stepTypes';

function statusText(state: FindMoveState): string {
  switch (state.phase) {
    case 'wrong':
      return STRINGS_DE.wrong;
    case 'opponent':
      return STRINGS_DE.opponentThinking;
    case 'done':
      return state.lastVerdict === 'mate' ? STRINGS_DE.mate : STRINGS_DE.solved;
    default:
      if (state.lastVerdict === 'correct') return STRINGS_DE.correct;
      if (state.lastVerdict === 'wrong') return STRINGS_DE.wrong;
      return '';
  }
}

/** Finde den Zug. */
export function FindMoveStepView({ step, frame, timings, onComplete, onMistake, onHint }: StepViewProps<FindMoveStep>) {
  const [state, setState] = useState<FindMoveState>(() => createFindMove(step));
  const [feedback, setFeedback] = useState<BoardFeedback | null>(null);
  const [orientation, flip] = useOrientation(step.orientation ?? fenTurn(step.fen));
  const done = state.phase === 'done';

  // Wrong move: shown for `wrongMs`, then taken back.
  useEffect(() => {
    if (state.phase !== 'wrong') return undefined;
    const timer = setTimeout(() => {
      setState((s) => revertFindMoveWrong(s));
      setFeedback(null);
    }, timings.wrongMs);
    return () => clearTimeout(timer);
  }, [state.phase, timings.wrongMs]);

  // Opponent reply after `opponentMs`.
  useEffect(() => {
    if (state.phase !== 'opponent') return undefined;
    const timer = setTimeout(() => {
      const r = playFindMoveReply(state);
      if (r.record) playSound(soundForMove(r.record));
      setFeedback(null);
      setState(r.state);
      if (r.state.phase === 'done') {
        playSound('success');
        onComplete();
      }
    }, timings.opponentMs);
    return () => clearTimeout(timer);
  }, [state, timings.opponentMs, onComplete]);

  const userMove = useCallback(
    (record: MoveRecord) => {
      const r = submitFindMove(state, record.uci);
      if (!r.verdict) return;
      setState(r.state);
      if (r.verdict === 'wrong') {
        playSound('error');
        setFeedback({ square: record.to, result: 'wrong' });
        onMistake();
        return;
      }
      setFeedback({ square: record.to, result: 'correct' });
      if (r.state.phase === 'done') {
        playSound('success');
        onComplete();
      }
    },
    [state, onMistake, onComplete],
  );

  const hint = useCallback(() => {
    const r = requestFindMoveHint(state);
    if (!r.counted) return;
    setState(r.state);
    onHint();
  }, [state, onHint]);

  const shownHint = findMoveHint(state);
  const lastComment = state.comments.at(-1);
  const last = state.wrongMove ?? state.line.at(-1) ?? null;
  const boardFen = state.wrongMove ? state.wrongMove.fenAfter : state.fen;
  const hintAvailable = canRequestHint(state);
  useShortcut('h', hintAvailable ? hint : undefined, { overControls: true });

  const panel = (
    <div className="flex flex-col gap-4" data-testid="lesson-step" data-step-type="find_move" data-step-id={step.id} data-phase={state.phase}>
      <StepText text={step.promptDe} />
      <p role="status" aria-live="polite" data-testid="find-move-status" className="text-body-lg font-semibold text-text">
        {statusText(state)}
      </p>
      {lastComment && !done && <p className="text-body text-text">{lastComment}</p>}
      {shownHint.textDe && !done && (
        <p data-testid="find-move-hint" className="flex items-start gap-2 text-body text-text">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" />
          <span>{shownHint.textDe}</span>
        </p>
      )}
      {done && (
        <CoachBubble tone="praise">
          {lastComment ? `${lastComment} ` : ''}
          {step.explanationDe}
        </CoachBubble>
      )}
    </div>
  );

  return frame({
    board: (
      <Board
        fen={boardFen}
        orientation={orientation}
        interactive={state.phase === 'user'}
        onMove={userMove}
        lastMove={last ? { from: last.from, to: last.to } : null}
        marks={done ? [] : shownHint.marks}
        feedback={feedback}
        onFlip={flip}
      />
    ),
    panel,
    actions: (
      <>
        {!done && (
          <Button
            variant="secondary"
            icon={<Lightbulb />}
            onClick={hint}
            disabled={!hintAvailable}
            aria-keyshortcuts="H"
            data-testid="hint-button"
            className="max-md:w-11 max-md:px-0"
          >
            {/* Phones: icon only (action bar: one primary and at most three icon buttons). */}
            <span className="max-md:sr-only">{state.hintStage === 0 ? STRINGS_DE.hint : hintAvailable ? STRINGS_DE.hintMore : STRINGS_DE.noMoreHints}</span>
          </Button>
        )}
        <FlipBoardButton onFlip={flip} />
      </>
    ),
  });
}
