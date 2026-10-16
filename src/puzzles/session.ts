/**
 * Puzzle session state machine (PRD Puzzles "Ablauf" and "Hinweise", DESIGN §8.1/§8.2, D-11, D-12).
 *
 * Pure and immutable: every transition returns a new state. Timing (opponent move after ≤ 600 ms, reverting a wrong
 * move after 700 ms, solution playback) is done by the caller (`usePuzzleSession` in the feature); this module only
 * knows what may happen next.
 *
 * Phases: `intro` (start position, opponent's first move pending) → `user` (learner to move) → `wrong` (a wrong move is
 * shown until `revertWrongMove`) / `opponent` (correct move played, opponent reply pending) → … → `done`.
 * Hint stage 3 switches to `solution`: the remaining solution is played move by move with `playSolutionStep`.
 *
 * Rated mode (D-11): any wrong move, hint or shown solution fails the attempt for the rating; the first hint needs a
 * confirmation (`hintWarning`), after that the learner may keep trying. Learning, theme and demo mode allow everything.
 */
import type { Fen, MoveRecord, Square, Uci } from '@/core/chess';
import type { Puzzle } from '@/core/puzzles';
import { ChessGame } from '@/lib/chess';
import { checkPuzzleMove, isUserPly, type PuzzleMoveVerdict } from './check';

/** Modes with their own UI flow. Rated updates the rating; learning/theme are unrated; demo stores nothing. */
export type PuzzleSessionMode = 'rated' | 'learning' | 'theme' | 'demo';

/** Phase of a session (see file header). */
export type PuzzlePhase = 'intro' | 'user' | 'wrong' | 'opponent' | 'solution' | 'done';

/** Hint stage: 0 none, 1 piece, 2 target square, 3 solution. */
export type HintStage = 0 | 1 | 2 | 3;

/** Correct/wrong marker on the board. */
export interface PuzzleFeedback {
  square: Square;
  result: 'correct' | 'wrong';
}

/** Immutable state of one puzzle. */
export interface PuzzleSessionState {
  readonly puzzle: Puzzle;
  readonly mode: PuzzleSessionMode;
  readonly phase: PuzzlePhase;
  /** Number of moves of the line already played (index of the next solution move). */
  readonly ply: number;
  /** Moves on the board along the line, starting with the opponent's first move (may end with an alternative mate). */
  readonly line: readonly MoveRecord[];
  /** Position shown on the board (includes a wrong move while `phase === 'wrong'`). */
  readonly fen: Fen;
  /** Last move shown on the board. */
  readonly lastMove: { from: Square; to: Square } | null;
  readonly feedback: PuzzleFeedback | null;
  /** Wrong moves so far. */
  readonly wrongMoves: number;
  /** Hint stage of the current solver move (resets after each correct move). */
  readonly hintStage: HintStage;
  /** Highest hint stage used in this puzzle. */
  readonly hintsUsed: HintStage;
  /** Rated mode: the one-time warning "Ein Hinweis zählt das Puzzle als nicht gelöst." is showing. */
  readonly hintWarning: boolean;
  readonly solutionShown: boolean;
  /** The learner reached the end with their own moves (no solution playback). */
  readonly solvedByUser: boolean;
  /** Verdict of the latest user move (status line). */
  readonly lastVerdict: PuzzleMoveVerdict | null;
}

/** What the learner achieved – the fields `ProgressService.recordPuzzleAttempt` needs. */
export interface PuzzleOutcome {
  solved: boolean;
  firstTry: boolean;
  hintsUsed: HintStage;
  solutionShown: boolean;
}

function lineFen(puzzleFen: Fen, line: readonly MoveRecord[]): Fen {
  return line.length > 0 ? line[line.length - 1]!.fenAfter : puzzleFen;
}

function lastMoveOf(line: readonly MoveRecord[]): { from: Square; to: Square } | null {
  const m = line[line.length - 1];
  return m ? { from: m.from, to: m.to } : null;
}

/** Starts a session in phase `intro` on the position before the opponent's first move. Throws on an illegal puzzle FEN. */
export function createPuzzleSession(puzzle: Puzzle, mode: PuzzleSessionMode): PuzzleSessionState {
  const fen = ChessGame.fromFen(puzzle.fen).fen();
  return {
    puzzle,
    mode,
    phase: 'intro',
    ply: 0,
    line: [],
    fen,
    lastMove: null,
    feedback: null,
    wrongMoves: 0,
    hintStage: 0,
    hintsUsed: 0,
    hintWarning: false,
    solutionShown: false,
    solvedByUser: false,
    lastVerdict: null,
  };
}

function playLineMove(state: PuzzleSessionState): { state: PuzzleSessionState; record: MoveRecord | null } {
  const uci = state.puzzle.moves[state.ply];
  if (uci === undefined) return { state: { ...state, phase: 'done' }, record: null };
  const record = ChessGame.fromFen(lineFen(state.fen, state.line)).move(uci);
  if (!record) throw new Error(`Puzzle ${state.puzzle.id}: move ${state.ply + 1} (${uci}) is illegal`);
  const line = [...state.line, record];
  const ply = state.ply + 1;
  return {
    state: { ...state, line, ply, fen: record.fenAfter, lastMove: { from: record.from, to: record.to }, feedback: null },
    record,
  };
}

/** Plays the opponent's move (`intro` → first move, `opponent` → reply). Afterwards it is the learner's turn. */
export function playOpponentMove(state: PuzzleSessionState): { state: PuzzleSessionState; record: MoveRecord | null } {
  if (state.phase !== 'intro' && state.phase !== 'opponent') return { state, record: null };
  const { state: next, record } = playLineMove(state);
  if (!record) return { state: next, record };
  const done = next.ply >= next.puzzle.moves.length || record.isCheckmate;
  return { state: { ...next, phase: done ? 'done' : 'user', hintStage: 0 }, record };
}

/** The learner plays `uci`. Correct → `opponent` (or `done`); another mate → `done`; wrong → `wrong`. */
export function submitUserMove(
  state: PuzzleSessionState,
  uci: Uci,
): { state: PuzzleSessionState; verdict: PuzzleMoveVerdict | null; record: MoveRecord | null } {
  if (state.phase !== 'user') return { state, verdict: null, record: null };
  const { verdict, record } = checkPuzzleMove(state.puzzle, state.ply, state.fen, uci);
  if (verdict === 'wrong') {
    return {
      state: {
        ...state,
        phase: 'wrong',
        fen: record ? record.fenAfter : state.fen,
        lastMove: record ? { from: record.from, to: record.to } : state.lastMove,
        feedback: record ? { square: record.to, result: 'wrong' } : null,
        wrongMoves: state.wrongMoves + 1,
        hintWarning: false,
        lastVerdict: 'wrong',
      },
      verdict,
      record,
    };
  }
  const played = record!;
  const line = [...state.line, played];
  const ply = state.ply + 1;
  const done = verdict === 'mate' || played.isCheckmate || ply >= state.puzzle.moves.length;
  return {
    state: {
      ...state,
      phase: done ? 'done' : 'opponent',
      line,
      ply,
      fen: played.fenAfter,
      lastMove: { from: played.from, to: played.to },
      feedback: { square: played.to, result: 'correct' },
      hintStage: 0,
      hintWarning: false,
      solvedByUser: done ? !state.solutionShown : state.solvedByUser,
      lastVerdict: verdict,
    },
    verdict,
    record: played,
  };
}

/** Takes the wrong move back (after the 700 ms display). */
export function revertWrongMove(state: PuzzleSessionState): PuzzleSessionState {
  if (state.phase !== 'wrong') return state;
  return { ...state, phase: 'user', fen: lineFen(state.fen, state.line), lastMove: lastMoveOf(state.line), feedback: null };
}

/** The attempt no longer counts as solved for the rating (wrong move, hint or solution). */
export function isFailedForRating(state: PuzzleSessionState): boolean {
  return state.wrongMoves > 0 || state.hintsUsed > 0 || state.solutionShown;
}

/** Effect of a hint request. */
export type HintEffect = 'warning' | 'hint' | 'solution' | 'none';

/**
 * "Hinweis" pressed. Rated and not yet failed: the first press only shows the warning line, the second press
 * confirms. Then stage 1 (piece) → 2 (target square) → 3 (play the solution, phase `solution`).
 */
export function requestHint(state: PuzzleSessionState): { state: PuzzleSessionState; effect: HintEffect } {
  if (state.phase !== 'user') return { state, effect: 'none' };
  if (state.mode === 'rated' && !isFailedForRating(state) && !state.hintWarning) {
    return { state: { ...state, hintWarning: true }, effect: 'warning' };
  }
  const stage = Math.min(3, state.hintStage + 1) as HintStage;
  const hintsUsed = Math.max(state.hintsUsed, stage) as HintStage;
  if (stage === 3) {
    return {
      state: { ...state, hintStage: 3, hintsUsed, hintWarning: false, solutionShown: true, phase: 'solution', feedback: null },
      effect: 'solution',
    };
  }
  return { state: { ...state, hintStage: stage, hintsUsed, hintWarning: false }, effect: 'hint' };
}

/** "Lösung zeigen": jumps to hint stage 3 directly (offered after a failed rated attempt and by the hint button). */
export function revealSolution(state: PuzzleSessionState): PuzzleSessionState {
  if (state.phase !== 'user' && state.phase !== 'wrong') return state;
  const base = state.phase === 'wrong' ? revertWrongMove(state) : state;
  return { ...base, hintStage: 3, hintsUsed: 3, hintWarning: false, solutionShown: true, phase: 'solution', feedback: null };
}

/** Plays the next move of the solution during playback; `done` after the last move. */
export function playSolutionStep(state: PuzzleSessionState): { state: PuzzleSessionState; record: MoveRecord | null } {
  if (state.phase !== 'solution') return { state, record: null };
  const { state: next, record } = playLineMove(state);
  const done = next.ply >= next.puzzle.moves.length || (record?.isCheckmate ?? true);
  return { state: done ? { ...next, phase: 'done' } : next, record };
}

/** Squares to highlight for the current hint stage (stage 1: piece; stage 2: piece and target). */
export function hintSquares(state: PuzzleSessionState): { piece: Square | null; target: Square | null } {
  if ((state.phase !== 'user' && state.phase !== 'wrong') || state.hintStage === 0) return { piece: null, target: null };
  const uci = state.puzzle.moves[state.ply];
  if (!uci || !isUserPly(state.ply)) return { piece: null, target: null };
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  return { piece: from, target: state.hintStage >= 2 ? to : null };
}

/**
 * Outcome for `recordPuzzleAttempt`. Solved = finished with the learner's own moves (no solution playback); in rated
 * mode additionally without a wrong move or hint (D-11 – the attempt is recorded as failed at the first one).
 * First try = solved without any wrong move (contract `PuzzleAttempt.firstTry`); hints are reported in `hintsUsed`.
 */
export function sessionOutcome(state: PuzzleSessionState): PuzzleOutcome {
  const finished = state.phase === 'done' && state.solvedByUser && !state.solutionShown;
  const solved = finished && (state.mode !== 'rated' || !isFailedForRating(state));
  return {
    solved,
    firstTry: solved && state.wrongMoves === 0,
    hintsUsed: state.hintsUsed,
    solutionShown: state.solutionShown,
  };
}

/**
 * Positions for stepping through the played line after the end ("Lösung abspielbar", Vor/Zurück):
 * index 0 = task position (after the opponent's first move), last index = final position.
 */
export function reviewPositions(state: PuzzleSessionState): Array<{ fen: Fen; lastMove: { from: Square; to: Square } }> {
  return state.line.map((m) => ({ fen: m.fenAfter, lastMove: { from: m.from, to: m.to } }));
}
