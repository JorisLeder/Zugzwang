import { ArrowLeft, Eye, Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AnalysedMove } from '@/core/analysis';
import type { Notation } from '@/core/chess';
import { capitalize, explainRuleBased, pieceNp, piecePronoun } from '@/explain';
import { Button, CoachBubble, Spinner } from '@/ui/primitives';
import { triesLeft, type RetryState } from '../retry';
import { STRINGS_DE } from '../strings.de';
import { ExplanationText, MoveLine } from './ExplanationText';

/** Props of `RetryPanel`. */
export interface RetryPanelProps {
  state: RetryState;
  analysed: AnalysedMove;
  notation: Notation;
  onHint: () => void;
  onReveal: () => void;
  onBack: () => void;
  /** Thumbs up/down of the explanation shown after the retry. */
  vote: 1 | -1 | null;
  onVote: (vote: 1 | -1) => void;
}

/**
 * Panel of "Nochmal versuchen" (DESIGN §8.1/§8.2): task, hints on request (piece, then target square), feedback per
 * attempt, the remaining tries and – after success or the reveal – the better move with the explanation.
 */
export function RetryPanel({ state, analysed, notation, onHint, onReveal, onBack, vote, onVote }: RetryPanelProps) {
  const side = state.mover === 'w' ? STRINGS_DE.white : STRINGS_DE.black;
  const done = state.phase === 'success' || state.phase === 'revealed';
  const explanation = analysed.explanation ?? (analysed.facts ? explainRuleBased(analysed.facts) : null);

  let feedback: ReactNode = null;
  if (state.phase === 'checking') {
    feedback = (
      <span className="flex items-center gap-2">
        <Spinner size={16} />
        {STRINGS_DE.retryChecking}
      </span>
    );
  } else if (state.phase === 'wrong') {
    feedback = STRINGS_DE.retryWrong;
  } else if (state.phase === 'thinking' && state.tries > 0) {
    feedback = `${STRINGS_DE.retryWrong} ${STRINGS_DE.retryTriesLeft(triesLeft(state))}`;
  } else if (state.phase === 'thinking' && state.checkFailed) {
    feedback = STRINGS_DE.retryCheckFailed;
  }

  const hints: string[] = [];
  if (!done && state.hint >= 1) hints.push(STRINGS_DE.retryHintPiece(pieceNp({ piece: state.hintPiece, square: state.hintFrom }, 'acc', 'def')));
  if (!done && state.hint >= 2) hints.push(STRINGS_DE.retryHintTarget(capitalize(piecePronoun(state.hintPiece, 'nom')), state.hintTo));

  return (
    <section data-testid="retry-panel" data-phase={state.phase} data-played={state.playedMove} className="flex flex-col gap-3" aria-live="polite">
      <h2 className="text-h3 text-text">{STRINGS_DE.retry}</h2>
      {!done && (
        <CoachBubble
          actions={
            <>
              {state.hint < 2 && (
                <Button variant="secondary" icon={<Lightbulb />} disabled={state.phase !== 'thinking'} onClick={onHint}>
                  {state.hint === 0 ? STRINGS_DE.retryHint : STRINGS_DE.retryHintMore}
                </Button>
              )}
              <Button variant="secondary" icon={<Eye />} onClick={onReveal}>
                {STRINGS_DE.showBetter}
              </Button>
            </>
          }
        >
          <span className="flex flex-col gap-1">
            <span data-testid="retry-task">{STRINGS_DE.retryTitle(side)}</span>
            {hints.map((h) => (
              <span key={h} className="text-body-sm text-muted" data-testid="retry-hint">
                {h}
              </span>
            ))}
            {feedback && (
              <span role="status" className="text-body-sm" data-testid="retry-feedback">
                {feedback}
              </span>
            )}
          </span>
        </CoachBubble>
      )}
      {done && (
        <CoachBubble tone={state.phase === 'success' ? 'praise' : 'neutral'} feedback={explanation ? { value: vote, onVote } : undefined}>
          <span className="flex flex-col gap-2">
            <span role="status" data-testid="retry-result" className="font-semibold">
              {state.phase === 'success' ? (state.alternative ? STRINGS_DE.retryAlternative : STRINGS_DE.retryCorrect) : STRINGS_DE.retryRevealed}{' '}
              {state.phase === 'revealed' && <MoveLine sans={[state.bestSan]} notation={notation} />}
            </span>
            {state.phase === 'success' && state.alternative && (
              <span className="text-body-sm text-muted">
                {STRINGS_DE.retryEngineChoice} <MoveLine sans={[state.bestSan]} notation={notation} />
              </span>
            )}
            {explanation && <ExplanationText explanation={explanation} notation={notation} testId="explanation" />}
          </span>
        </CoachBubble>
      )}
      <div>
        <Button variant="link" size="sm" icon={<ArrowLeft />} onClick={onBack}>
          {STRINGS_DE.retryBack}
        </Button>
      </div>
    </section>
  );
}
