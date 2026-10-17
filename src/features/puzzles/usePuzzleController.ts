/**
 * React wrapper around the pure puzzle session (`@/puzzles`): timings of DESIGN §8.2 and sounds of §6.2.
 *
 * - The opponent's first move is played 500 ms after the puzzle appears (≤ 600 ms, BACKLOG WP-03), every opponent
 *   reply 500 ms after the learner's correct move ("so the learner sees their move land").
 * - A wrong move stays on the board for 700 ms with the red mark, then it is taken back.
 * - Solution playback (hint stage 3, "Lösung zeigen"): one move every 750 ms (150 ms animation + 600 ms pause).
 * - Sounds: opponent and solution moves → Zug/Schlag/Schach; wrong move → Fehler; solved → Erfolg. The board plays
 *   the sound of the learner's own move.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MoveRecord } from '@/core/chess';
import type { Puzzle } from '@/core/puzzles';
import {
  createPuzzleSession,
  playOpponentMove,
  playSolutionStep,
  requestHint,
  revealSolution,
  revertWrongMove,
  sessionOutcome,
  submitUserMove,
  type HintEffect,
  type PuzzleSessionMode,
  type PuzzleSessionState,
} from '@/puzzles';
import { playSound, soundForMove } from '@/ui/sound';

/** Delays in ms (tests may shorten them). */
export interface PuzzleTimings {
  /** Opponent's first move and every reply. */
  opponentMs: number;
  /** How long a wrong move stays on the board. */
  wrongMs: number;
  /** Before the first move of the solution playback. */
  solutionFirstMs: number;
  /** Between solution moves. */
  solutionStepMs: number;
}

/** DESIGN §8.2 / §6.1 timings. */
export const PUZZLE_TIMINGS: PuzzleTimings = { opponentMs: 500, wrongMs: 700, solutionFirstMs: 400, solutionStepMs: 750 };

/** What the trainer needs from a running puzzle. */
export interface PuzzleController {
  state: PuzzleSessionState;
  /** Milliseconds since the learner's first turn began (0 before). */
  elapsedMs(): number;
  /** A move the learner made on the board. */
  userMove(record: MoveRecord): void;
  /** "Hinweis" pressed. */
  hint(): HintEffect;
  /** "Lösung zeigen" (direct jump to stage 3). */
  showSolution(): void;
}

/** Runs one puzzle. Remount (React `key`) for the next puzzle. */
export function usePuzzleController(puzzle: Puzzle, mode: PuzzleSessionMode, timings: PuzzleTimings = PUZZLE_TIMINGS): PuzzleController {
  const [state, setState] = useState<PuzzleSessionState>(() => createPuzzleSession(puzzle, mode));
  const startedAt = useRef<number | null>(null);
  const solutionSteps = useRef(0);

  useEffect(() => {
    if (state.phase === 'user' && startedAt.current === null) startedAt.current = Date.now();
  }, [state.phase]);

  useEffect(() => {
    let delay: number | null = null;
    let step: (() => PuzzleSessionState) | null = null;
    if (state.phase === 'intro' || state.phase === 'opponent') {
      delay = timings.opponentMs;
      step = () => {
        const r = playOpponentMove(state);
        if (r.record) playSound(soundForMove(r.record));
        return r.state;
      };
    } else if (state.phase === 'wrong') {
      delay = timings.wrongMs;
      step = () => revertWrongMove(state);
    } else if (state.phase === 'solution') {
      delay = solutionSteps.current === 0 ? timings.solutionFirstMs : timings.solutionStepMs;
      step = () => {
        solutionSteps.current++;
        const r = playSolutionStep(state);
        if (r.record) playSound(soundForMove(r.record));
        return r.state;
      };
    }
    if (delay === null || step === null) return undefined;
    const run = step;
    const timer = setTimeout(() => setState(run()), delay);
    return () => clearTimeout(timer);
  }, [state, timings]);

  const userMove = useCallback(
    (record: MoveRecord) => {
      const r = submitUserMove(state, record.uci);
      if (r.verdict === 'wrong') playSound('error');
      else if (r.state.phase === 'done' && (mode === 'rated' ? sessionOutcome(r.state).solved : r.state.solvedByUser)) playSound('success');
      setState(r.state);
    },
    [state, mode],
  );

  const hint = useCallback((): HintEffect => {
    const r = requestHint(state);
    setState(r.state);
    return r.effect;
  }, [state]);

  const showSolution = useCallback(() => setState(revealSolution(state)), [state]);

  const elapsedMs = useCallback(() => (startedAt.current === null ? 0 : Date.now() - startedAt.current), []);

  return { state, elapsedMs, userMove, hint, showSolution };
}
