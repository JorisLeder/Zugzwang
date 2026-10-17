/**
 * Quiz: single choice with per-option feedback. A wrong answer shows its feedback, counts a mistake and the learner
 * tries again; the correct answer completes the step.
 */
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { QuizStep } from '@/lessons';
import { Board, FlipBoardButton } from '@/ui/board';
import { playSound } from '@/ui/sound';
import { STRINGS_DE } from '../../strings.de';
import { StepText } from './StepText';
import { useOrientation, type StepViewProps } from './stepTypes';

/** Quiz. */
export function QuizStepView({ step, frame, onComplete, onMistake }: StepViewProps<QuizStep>) {
  const [tried, setTried] = useState<ReadonlySet<string>>(() => new Set());
  const [lastId, setLastId] = useState<string | null>(null);
  const solved = step.options.some((o) => o.correct && tried.has(o.id));
  const [orientation, flip] = useOrientation('w');
  const last = step.options.find((o) => o.id === lastId) ?? null;

  const choose = (id: string) => {
    if (solved) return;
    const option = step.options.find((o) => o.id === id);
    if (!option) return;
    setLastId(id);
    if (tried.has(id)) return;
    setTried((t) => new Set([...t, id]));
    if (option.correct) {
      playSound('success');
      onComplete();
    } else {
      playSound('error');
      onMistake();
    }
  };

  const panel = (
    <div className="flex flex-col gap-4" data-testid="lesson-step" data-step-type="quiz" data-step-id={step.id} data-solved={solved || undefined}>
      <StepText text={step.questionDe} />
      <ul aria-label={STRINGS_DE.quizLabel} className="flex flex-col gap-2">
        {step.options.map((o) => {
          const wasTried = tried.has(o.id);
          const right = wasTried && o.correct;
          const wrong = wasTried && !o.correct;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => choose(o.id)}
                disabled={solved && !o.correct}
                aria-pressed={wasTried}
                data-option-id={o.id}
                data-result={right ? 'correct' : wrong ? 'wrong' : undefined}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-body text-text',
                  'transition-colors duration-[var(--zz-dur-fast)] focus-visible:outline-2 focus-visible:outline-focus',
                  right && 'border-accent bg-accent-subtle',
                  wrong && 'border-danger bg-danger-subtle',
                  !wasTried && 'border-border bg-surface-2 hover:bg-surface-3',
                  solved && !o.correct && 'opacity-70',
                )}
              >
                <span className="min-w-0 flex-1">{o.textDe}</span>
                {right && <Check aria-hidden="true" className="size-5 shrink-0 text-accent-text" />}
                {wrong && <X aria-hidden="true" className="size-5 shrink-0 text-danger-text" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div role="status" aria-live="polite" data-testid="quiz-feedback" className="flex flex-col gap-1">
        {last && (
          <>
            <p className={cn('text-body-lg font-semibold', last.correct ? 'text-accent-text' : 'text-danger-text')}>
              {last.correct ? STRINGS_DE.quizCorrect : STRINGS_DE.quizWrong}
            </p>
            {last.feedbackDe && <p className="text-body text-text">{last.feedbackDe}</p>}
          </>
        )}
      </div>
    </div>
  );

  if (!step.fen) return frame({ panel });
  return frame({
    board: <Board fen={step.fen} orientation={orientation} interactive={false} onFlip={flip} />,
    panel,
    actions: <FlipBoardButton onFlip={flip} />,
  });
}
