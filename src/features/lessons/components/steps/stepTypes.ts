/** Contract between the lesson player and the five step views. */
import { useCallback, useState, type ReactElement, type ReactNode } from 'react';
import type { Color } from '@/core/chess';
import type { Orientation } from '@/ui/board';

/** Parts a step view hands to the player's frame. */
export interface FrameParts {
  /** Board element; omitted → text layout. */
  board?: ReactNode | ((size: number) => ReactNode);
  /** Step content (text, feedback, controls). */
  panel: ReactNode;
  /** Step actions placed between "Zurück" and "Weiter" (e.g. "Hinweis", "Brett drehen"). */
  actions?: ReactNode;
  /** ⋮ menu in the phone top bar. */
  menu?: ReactNode;
}

/** Delays of the step views in ms (component tests shorten them). */
export interface LessonTimings {
  /** Opponent reply in "Finde den Zug" after a correct move. */
  opponentMs: number;
  /** How long a wrong move stays on the board. */
  wrongMs: number;
  /** Demo autoplay: one move every … */
  autoplayMs: number;
  /** Minimum pause before a bot move in "Ausspielen" (outside e2e runs). */
  botMinMs: number;
}

/** Defaults (puzzle timings of DESIGN §8.2, a calm demo pace). */
export const LESSON_TIMINGS: LessonTimings = { opponentMs: 500, wrongMs: 700, autoplayMs: 1600, botMinMs: 400 };

/** Props of every step view. */
export interface StepViewProps<S> {
  step: S;
  /** Whether this step is the current task (mistakes and hints count). */
  active: boolean;
  /** The step was completed before (review). */
  completed: boolean;
  /** The step is done (exercise solved). */
  onComplete: () => void;
  onMistake: () => void;
  onHint: () => void;
  /** Wraps the parts into the lesson frame (header, nav actions). */
  frame: (parts: FrameParts) => ReactElement;
  timings: LessonTimings;
}

/** Board orientation from a colour. */
export function orientationOf(color: Color): Orientation {
  return color === 'w' ? 'white' : 'black';
}

/** Orientation state with a flip action. */
export function useOrientation(initial: Color): [Orientation, () => void] {
  const [orientation, setOrientation] = useState<Orientation>(() => orientationOf(initial));
  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), []);
  return [orientation, flip];
}
