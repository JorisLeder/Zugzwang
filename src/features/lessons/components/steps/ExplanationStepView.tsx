import { Swords } from 'lucide-react';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import type { ExplanationStep } from '@/lessons';
import { Board, FlipBoardButton } from '@/ui/board';
import { Button } from '@/ui/primitives';
import { STRINGS_DE } from '../../strings.de';
import { StepText } from './StepText';
import { useOrientation, type StepViewProps } from './stepTypes';

/** Erklärung: text with an optional board, arrows and marked squares. */
export function ExplanationStepView({ step, frame }: StepViewProps<ExplanationStep>) {
  const navigate = useNavigate();
  const fen = step.fen;
  const [orientation, flip] = useOrientation(step.orientation ?? 'w');
  const panel = (
    <div className="flex flex-col gap-4" data-testid="lesson-step" data-step-type="explanation" data-step-id={step.id}>
      <StepText text={step.textDe} />
      {fen && (
        <div>
          <Button variant="secondary" icon={<Swords />} onClick={() => void navigate(paths.playFromPosition(fen))}>
            {STRINGS_DE.playPosition}
          </Button>
        </div>
      )}
    </div>
  );
  if (!fen) return frame({ panel });
  return frame({
    board: <Board fen={fen} orientation={orientation} interactive={false} arrows={step.arrows} marks={step.marks} onFlip={flip} />,
    panel,
    actions: <FlipBoardButton onFlip={flip} />,
  });
}
