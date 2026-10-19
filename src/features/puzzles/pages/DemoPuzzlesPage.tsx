/**
 * Demo `/puzzles/demo` (P0-01): exactly 5 fixed easy puzzles without login. Nothing is persisted – no attempts, no
 * activity, no settings (the ⋮ menu with its sound toggle is hidden). After the fifth puzzle: call to action
 * "Anmelden, um Fortschritt zu speichern".
 */
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { DEMO_PUZZLES } from '@/puzzles';
import { usePageTitle } from '@/ui/layout';
import { Badge, Button } from '@/ui/primitives';
import { PuzzleTrainer } from '../components/PuzzleTrainer';
import { STRINGS_DE } from '../strings.de';
import { PERF, perfMark } from '../usePuzzleData';

/** Demo-Puzzles (lazy route module, public). */
export function Component() {
  usePageTitle(STRINGS_DE.puzzlesDemo);
  const [index, setIndex] = useState(0);
  const puzzle = DEMO_PUZZLES[index]!;
  const last = index === DEMO_PUZZLES.length - 1;
  const cta = (
    <Button asChild variant="primary" className="ml-auto min-w-0 flex-1 whitespace-normal lg:flex-none">
      <Link to={paths.login()} data-testid="demo-cta">
        <LogIn aria-hidden="true" />
        {STRINGS_DE.demoCta}
      </Link>
    </Button>
  );
  return (
    <PuzzleTrainer
      key={puzzle.id}
      puzzle={puzzle}
      mode="demo"
      modeTitle={STRINGS_DE.puzzlesDemo}
      backTo={paths.puzzles()}
      headerMeta={<Badge tone="neutral" data-testid="demo-progress">{STRINGS_DE.demoProgress(index + 1)}</Badge>}
      notice={
        <>
          {STRINGS_DE.demoNotice}{' '}
          <Link
            to={paths.login()}
            className="font-medium text-accent-text underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
          >
            {STRINGS_DE.demoCta}
          </Link>
        </>
      }
      onNext={
        last
          ? undefined
          : () => {
              perfMark(PERF.next);
              setIndex((i) => Math.min(i + 1, DEMO_PUZZLES.length - 1));
            }
      }
      endAction={last ? cta : undefined}
      endContent={
        last ? (
          <p data-testid="demo-done" className="text-body text-text">
            {STRINGS_DE.demoDone}
          </p>
        ) : undefined
      }
      playVsBot={false}
      explanationFeedback={false}
      showMenu={false}
    />
  );
}
