import { Compass, Eye, RotateCcw } from 'lucide-react';
import { CLASSIFICATION_META, type AnalysedMove } from '@/core/analysis';
import type { MoveRecord, Notation } from '@/core/chess';
import { explainRuleBased, explanationTeaser } from '@/explain';
import { formatSan } from '@/lib/chess';
import { Button, ClassificationBadge, CoachBubble } from '@/ui/primitives';
import { canRetry, isBadMove, lineSan, moveNumberText } from '../review';
import { STRINGS_DE } from '../strings.de';
import { ExplanationText, MoveLine } from './ExplanationText';

/** Props of `MoveDetail`. */
export interface MoveDetailProps {
  /** Current ply (0 = start position). */
  ply: number;
  /** Move record of the current ply (`undefined` at ply 0). */
  move: MoveRecord | undefined;
  /** Analysed move of the current ply (`undefined` before the analysis is done). */
  analysed: AnalysedMove | undefined;
  /** First analysed move (best move of the start position). */
  firstMove: AnalysedMove | undefined;
  /** The better move of a mistake was shown (retry finished or "Besseren Zug zeigen"). */
  revealed: boolean;
  notation: Notation;
  vote: 1 | -1 | null;
  onVote: (vote: 1 | -1) => void;
  onRetry: () => void;
  onReveal: () => void;
  onExplore: () => void;
}

/**
 * The current move (PRD §3): classification symbol and label, the best move of the position (SAN) and – for every
 * mistake, miss and blunder – a short German explanation. Until the better move is revealed only the teaser (the
 * consequence of the move, never the better move) is shown with "Nochmal versuchen" / "Besseren Zug zeigen"; then the
 * full explanation, the better move and its follow-up line, with thumbs up/down.
 */
export function MoveDetail({ ply, move, analysed, firstMove, revealed, notation, vote, onVote, onRetry, onReveal, onExplore }: MoveDetailProps) {
  const explore = (
    <Button variant="link" size="sm" icon={<Compass />} onClick={onExplore}>
      {STRINGS_DE.explore}
    </Button>
  );

  if (ply === 0 || !move) {
    return (
      <section aria-live="polite" data-testid="move-detail" data-ply={0} className="flex flex-col gap-2">
        <h2 className="text-h3 text-text">{STRINGS_DE.startPosition}</h2>
        {firstMove?.bestMoveSan && (
          <p className="text-body text-text" data-testid="best-move">
            {STRINGS_DE.bestHere} <MoveLine sans={[firstMove.bestMoveSan]} notation={notation} />
          </p>
        )}
        <p className="text-body-sm text-muted">{STRINGS_DE.startPositionHint}</p>
        <div>{explore}</div>
      </section>
    );
  }

  const heading = moveNumberText(move, formatSan(move.san, notation));
  if (!analysed) {
    return (
      <section aria-live="polite" data-testid="move-detail" data-ply={ply} className="flex flex-col gap-2">
        <h2 className="text-h3 text-text tabular-nums">{heading}</h2>
        <div>{explore}</div>
      </section>
    );
  }

  const meta = CLASSIFICATION_META[analysed.classification];
  const bad = isBadMove(analysed.classification);
  const best = analysed.bestMoveSan;
  const wasBest = !best || analysed.bestMove === analysed.uci;
  const bestLine = lineSan(analysed.fenBefore, analysed.bestLine);
  const playedLine = lineSan(analysed.fenBefore, analysed.playedLine).slice(1);
  const retryable = canRetry(analysed);

  return (
    <section aria-live="polite" data-testid="move-detail" data-ply={ply} data-classification={analysed.classification} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <ClassificationBadge classification={analysed.classification} size={28} />
        <div className="min-w-0">
          <h2 className="text-h3 text-text tabular-nums">{heading}</h2>
          <p className="text-body-sm text-muted">
            {meta.labelDe} – {meta.plainDe}
          </p>
        </div>
      </div>

      {!bad &&
        (wasBest ? (
          <p className="text-body text-text" data-testid="best-move">
            {STRINGS_DE.wasBest}
          </p>
        ) : (
          <p className="text-body text-text" data-testid="best-move">
            {STRINGS_DE.bestWas} <MoveLine sans={[best!]} notation={notation} />
          </p>
        ))}

      {bad && analysed.facts && !revealed && (
        <CoachBubble
          tone="warning"
          actions={
            retryable ? (
              <>
                <Button icon={<RotateCcw />} onClick={onRetry}>
                  {STRINGS_DE.retry}
                </Button>
                <Button variant="secondary" icon={<Eye />} onClick={onReveal}>
                  {STRINGS_DE.showBetter}
                </Button>
              </>
            ) : undefined
          }
        >
          <ExplanationText explanation={explanationTeaser(analysed.facts)} notation={notation} testId="explanation-teaser" />
        </CoachBubble>
      )}

      {bad && (revealed || !analysed.facts) && (
        <CoachBubble
          tone="warning"
          feedback={analysed.facts ? { value: vote, onVote } : undefined}
          details={
            playedLine.length > 0 ? (
              <p className="text-body-sm text-muted">
                {STRINGS_DE.playedLine} <MoveLine sans={playedLine} notation={notation} />
              </p>
            ) : undefined
          }
        >
          <span className="flex flex-col gap-2">
            {analysed.facts && (
              <ExplanationText explanation={analysed.explanation ?? explainRuleBased(analysed.facts)} notation={notation} testId="explanation" />
            )}
            {!wasBest && (
              <span className="text-body-sm text-muted" data-testid="best-move">
                {STRINGS_DE.betterWas} <MoveLine sans={[best!]} notation={notation} />
              </span>
            )}
            {bestLine.length > 1 && (
              <span className="text-body-sm text-muted" data-testid="follow-up">
                {STRINGS_DE.followUp} <MoveLine sans={bestLine} notation={notation} />
              </span>
            )}
          </span>
        </CoachBubble>
      )}

      <div className="flex flex-wrap gap-2">{explore}</div>
    </section>
  );
}
