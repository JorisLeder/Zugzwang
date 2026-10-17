import { Pause, Play, Swords } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useSettings } from '@/app/services';
import type { MoveRecord } from '@/core/chess';
import { ChessGame, formatSan } from '@/lib/chess';
import type { DemoStep } from '@/lessons';
import { Board, FlipBoardButton } from '@/ui/board';
import { NavigationControls, usePlyNavigation } from '@/ui/chess';
import { Button } from '@/ui/primitives';
import { playSound, soundForMove } from '@/ui/sound';
import { STRINGS_DE } from '../../strings.de';
import { StepText } from './StepText';
import { useOrientation, type StepViewProps } from './stepTypes';

/** The demo's moves played out (stops at the first illegal move – the loader rejects such files anyway). */
function demoRecords(step: DemoStep): MoveRecord[] {
  const game = ChessGame.fromFen(step.startFen);
  const records: MoveRecord[] = [];
  for (const m of step.moves) {
    const r = game.move(m.uci);
    if (!r) break;
    records.push(r);
  }
  return records;
}

/** Demo: a move sequence played step by step (Vor/Zurück, ←/→, autoplay) with a comment per move. */
export function DemoStepView({ step, frame, timings }: StepViewProps<DemoStep>) {
  const navigate = useNavigate();
  const notation = useSettings((s) => s.notation);
  const records = useMemo(() => demoRecords(step), [step]);
  const maxPly = records.length;
  const nav = usePlyNavigation({ maxPly, initialPly: 0 });
  const { ply, setPly, next } = nav;
  const [playing, setPlaying] = useState(false);
  const autoplaying = playing && ply < maxPly;
  const [orientation, flip] = useOrientation(step.orientation ?? 'w');

  useEffect(() => {
    if (!autoplaying) return undefined;
    const timer = setTimeout(next, timings.autoplayMs);
    return () => clearTimeout(timer);
  }, [autoplaying, ply, next, timings.autoplayMs]);

  // Sound of the move that just appeared (forward only).
  const previousPly = useRef(ply);
  useEffect(() => {
    const record = records[ply - 1];
    if (ply > previousPly.current && record) playSound(soundForMove(record));
    previousPly.current = ply;
  }, [ply, records]);

  const current = ply > 0 ? records[ply - 1]! : null;
  const meta = ply > 0 ? step.moves[ply - 1] : undefined;
  const fen = current ? current.fenAfter : step.startFen;
  const playFen = current && ChessGame.fromFen(fen).status().isOver ? step.startFen : fen;

  const toggle = () => {
    if (autoplaying) {
      setPlaying(false);
      return;
    }
    if (ply >= maxPly) setPly(0);
    else next();
    setPlaying(true);
  };

  const panel = (
    <div className="flex flex-col gap-4" data-testid="lesson-step" data-step-type="demo" data-step-id={step.id}>
      {step.introDe && <StepText text={step.introDe} />}
      <div className="rounded-lg bg-surface-2 p-4" aria-live="polite" data-testid="demo-comment">
        <p className="text-body font-semibold text-text">
          {current ? STRINGS_DE.demoMove(ply, maxPly, formatSan(current.san, notation)) : STRINGS_DE.demoStart}
        </p>
        {meta?.commentDe && <p className="mt-1 text-body text-text">{meta.commentDe}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NavigationControls
          ply={ply}
          maxPly={maxPly}
          onNavigate={(p) => {
            setPlaying(false);
            setPly(p);
          }}
        />
        <Button variant="secondary" icon={autoplaying ? <Pause /> : <Play />} onClick={toggle} aria-pressed={autoplaying} data-testid="demo-autoplay">
          {autoplaying ? STRINGS_DE.pause : STRINGS_DE.autoplay}
        </Button>
      </div>
      <div>
        <Button variant="link" icon={<Swords />} onClick={() => void navigate(paths.playFromPosition(playFen))}>
          {STRINGS_DE.playPosition}
        </Button>
      </div>
    </div>
  );

  return frame({
    board: (
      <Board
        fen={fen}
        orientation={orientation}
        interactive={false}
        lastMove={current ? { from: current.from, to: current.to } : null}
        arrows={meta?.arrows}
        marks={meta?.marks}
        sound={false}
        onFlip={flip}
      />
    ),
    panel,
    actions: <FlipBoardButton onFlip={flip} />,
  });
}
