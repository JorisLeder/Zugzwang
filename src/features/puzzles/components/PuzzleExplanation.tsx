import { useState } from 'react';
import { useServices, useSettings } from '@/app/services';
import type { ExplanationText } from '@/core/explain';
import type { Puzzle } from '@/core/puzzles';
import { formatSan } from '@/lib/chess';
import { motifTags } from '@/puzzles';
import { CoachBubble, Tag } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

/** Props of `PuzzleExplanation`. */
export interface PuzzleExplanationProps {
  puzzle: Puzzle;
  explanation: ExplanationText | null;
  /** Thumbs up/down (stored via `progress.recordExplanationFeedback`); off in the demo. */
  feedback?: boolean;
}

/** Explanation text with moves in the user's notation (D-19, D-23). */
export function ExplanationSegments({ explanation }: { explanation: ExplanationText }) {
  const notation = useSettings((s) => s.notation);
  return (
    <>
      {explanation.segments.map((s, i) =>
        s.type === 'text' ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} className="font-semibold">
            {formatSan(s.san, notation)}
          </span>
        ),
      )}
    </>
  );
}

/** After the puzzle: motif tags plus the 1–3 sentence explanation (PRD "Erklärung nach dem Puzzle", P0-05). */
export function PuzzleExplanation({ puzzle, explanation, feedback = true }: PuzzleExplanationProps) {
  const { data } = useServices();
  const [vote, setVote] = useState<1 | -1 | null>(null);
  const tags = motifTags(puzzle);
  const onVote = (v: 1 | -1) => {
    setVote(v);
    data.progress.recordExplanationFeedback({ context: 'puzzle', ref: puzzle.id, vote: v }).catch((e: unknown) => console.warn('Feedback not saved', e));
  };
  return (
    <div className="flex flex-col gap-3" data-testid="puzzle-explanation">
      {tags.length > 0 && (
        <section aria-label={STRINGS_DE.motifs}>
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.id}>
                <Tag title={t.descriptionDe}>{t.labelDe}</Tag>
              </li>
            ))}
          </ul>
        </section>
      )}
      {explanation && (
        <CoachBubble name={STRINGS_DE.coachName} feedback={feedback ? { value: vote, onVote } : undefined}>
          <ExplanationSegments explanation={explanation} />
        </CoachBubble>
      )}
    </div>
  );
}
