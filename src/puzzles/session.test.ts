import { describe, expect, it } from 'vitest';
import type { Puzzle } from '@/core/puzzles';
import { FIXTURE_PUZZLES } from '@/core/testing';
import { checkPuzzleMove, puzzleMateLength, puzzleStartFen, solverColor, userMoveCount } from './check';
import {
  createPuzzleSession,
  hintSquares,
  isFailedForRating,
  playOpponentMove,
  playSolutionStep,
  requestHint,
  revealSolution,
  revertWrongMove,
  reviewPositions,
  sessionOutcome,
  submitUserMove,
  type PuzzleSessionMode,
  type PuzzleSessionState,
} from './session';

const fixture = (id: string): Puzzle => structuredClone(FIXTURE_PUZZLES.find((p) => p.id === id)!);
const fork = () => fixture('fixture-knight-fork'); // c7c6 | d5e7 g8f8 e7c6
const twoMates = () => fixture('fixture-two-mates'); // c6e5 | b1b8 (a1a8 mates too)

/** Starts a session and plays the opponent's first move. */
function started(p: Puzzle, mode: PuzzleSessionMode = 'learning'): PuzzleSessionState {
  return playOpponentMove(createPuzzleSession(p, mode)).state;
}

function play(state: PuzzleSessionState, uci: string): PuzzleSessionState {
  const r = submitUserMove(state, uci);
  return r.state.phase === 'opponent' ? playOpponentMove(r.state).state : r.state;
}

describe('check', () => {
  it('knows the solver, the task position and the number of user moves', () => {
    const p = fork();
    expect(solverColor(p)).toBe('w');
    expect(puzzleStartFen(p)).toBe('6k1/pp3ppp/2q5/3N4/8/8/PP3PPP/4R1K1 w - - 1 2');
    expect(userMoveCount(p)).toBe(2);
    expect(puzzleMateLength(p)).toBeNull();
    expect(puzzleMateLength(fixture('fixture-smothered-mate'))).toBe(2);
  });

  it('accepts the solution move and every checkmating move, rejects others and illegal input', () => {
    const p = twoMates();
    const fen = puzzleStartFen(p);
    expect(checkPuzzleMove(p, 1, fen, 'b1b8').verdict).toBe('correct');
    expect(checkPuzzleMove(p, 1, fen, 'a1a8').verdict).toBe('mate');
    expect(checkPuzzleMove(p, 1, fen, 'a1a7').verdict).toBe('wrong');
    expect(checkPuzzleMove(p, 1, fen, 'a1a9')).toEqual({ verdict: 'wrong', record: null });
    expect(checkPuzzleMove(p, 0, fen, 'b1b8').verdict).toBe('wrong'); // not a solver ply
  });
});

describe('session flow', () => {
  it('auto-plays the opponent move first, then accepts the correct sequence', () => {
    const p = fork();
    const s0 = createPuzzleSession(p, 'learning');
    expect(s0.phase).toBe('intro');
    expect(submitUserMove(s0, 'd5e7').verdict).toBeNull(); // not the learner's turn yet
    const { state: s1, record } = playOpponentMove(s0);
    expect(record?.uci).toBe('c7c6');
    expect(s1).toMatchObject({ phase: 'user', ply: 1, lastMove: { from: 'c7', to: 'c6' } });
    const r = submitUserMove(s1, 'd5e7');
    expect(r.verdict).toBe('correct');
    expect(r.state).toMatchObject({ phase: 'opponent', feedback: { square: 'e7', result: 'correct' } });
    const s3 = playOpponentMove(r.state).state;
    expect(s3).toMatchObject({ phase: 'user', ply: 3, feedback: null });
    const end = submitUserMove(s3, 'e7c6').state;
    expect(end.phase).toBe('done');
    expect(sessionOutcome(end)).toEqual({ solved: true, firstTry: true, hintsUsed: 0, solutionShown: false });
    expect(reviewPositions(end).map((x) => x.lastMove.to)).toEqual(['c6', 'e7', 'f8', 'c6']);
  });

  it('marks a wrong move immediately, shows it, and takes it back', () => {
    const s1 = started(fork());
    const r = submitUserMove(s1, 'e1e8');
    expect(r.verdict).toBe('wrong');
    expect(r.state).toMatchObject({ phase: 'wrong', wrongMoves: 1, feedback: { square: 'e8', result: 'wrong' }, lastVerdict: 'wrong' });
    expect(r.state.fen).not.toBe(s1.fen);
    const back = revertWrongMove(r.state);
    expect(back).toMatchObject({ phase: 'user', fen: s1.fen, feedback: null, lastMove: { from: 'c7', to: 'c6' } });
    const end = play(play(back, 'd5e7'), 'e7c6');
    expect(sessionOutcome(end)).toEqual({ solved: true, firstTry: false, hintsUsed: 0, solutionShown: false });
  });

  it('ends the puzzle on any checkmating move (two mates)', () => {
    for (const mate of ['b1b8', 'a1a8']) {
      const end = submitUserMove(started(twoMates()), mate);
      expect(end.state.phase).toBe('done');
      expect(sessionOutcome(end.state).solved).toBe(true);
    }
  });

  it('accepts an under-promotion that also mates', () => {
    const p: Puzzle = { ...fork(), id: 'promo', fen: '7k/1P4pp/8/p7/8/8/5PPP/6K1 b - - 0 1', moves: ['a5a4', 'b7b8q'], themes: ['mateIn1'] };
    const r = submitUserMove(started(p), 'b7b8r');
    expect(r.verdict).toBe('mate');
    expect(r.state.phase).toBe('done');
  });

  it('ignores moves outside the learner phase', () => {
    const end = submitUserMove(started(twoMates()), 'b1b8').state;
    expect(submitUserMove(end, 'a1a8').state).toBe(end);
    expect(playOpponentMove(end).state).toBe(end);
  });
});

describe('hints', () => {
  it('goes piece → target square → solution playback (learning mode)', () => {
    const s1 = started(fork());
    expect(hintSquares(s1)).toEqual({ piece: null, target: null });
    const h1 = requestHint(s1);
    expect(h1.effect).toBe('hint');
    expect(hintSquares(h1.state)).toEqual({ piece: 'd5', target: null });
    const h2 = requestHint(h1.state);
    expect(hintSquares(h2.state)).toEqual({ piece: 'd5', target: 'e7' });
    const h3 = requestHint(h2.state);
    expect(h3.effect).toBe('solution');
    expect(h3.state).toMatchObject({ phase: 'solution', hintsUsed: 3, solutionShown: true });
    let s = h3.state;
    const played: string[] = [];
    while (s.phase === 'solution') {
      const step = playSolutionStep(s);
      played.push(step.record!.uci);
      s = step.state;
    }
    expect(played).toEqual(['d5e7', 'g8f8', 'e7c6']);
    expect(s.phase).toBe('done');
    expect(sessionOutcome(s)).toEqual({ solved: false, firstTry: false, hintsUsed: 3, solutionShown: true });
  });

  it('resets the hint stage after a correct move but remembers the highest stage used', () => {
    const s = play(requestHint(started(fork())).state, 'd5e7');
    expect(s).toMatchObject({ hintStage: 0, hintsUsed: 1 });
    const end = play(s, 'e7c6');
    expect(sessionOutcome(end)).toEqual({ solved: true, firstTry: true, hintsUsed: 1, solutionShown: false });
  });

  it('rated: the first press only warns, the second fails the attempt (D-11)', () => {
    const s1 = started(fork(), 'rated');
    const warn = requestHint(s1);
    expect(warn.effect).toBe('warning');
    expect(warn.state.hintWarning).toBe(true);
    expect(isFailedForRating(warn.state)).toBe(false);
    const hint = requestHint(warn.state);
    expect(hint.effect).toBe('hint');
    expect(hint.state.hintWarning).toBe(false);
    expect(isFailedForRating(hint.state)).toBe(true);
    const end = play(play(hint.state, 'd5e7'), 'e7c6');
    expect(sessionOutcome(end)).toMatchObject({ solved: false, hintsUsed: 1 });
  });

  it('rated: a wrong move fails the attempt; afterwards hints need no warning', () => {
    const wrong = submitUserMove(started(fork(), 'rated'), 'e1e8').state;
    expect(isFailedForRating(wrong)).toBe(true);
    expect(sessionOutcome(wrong).solved).toBe(false);
    const back = revertWrongMove(wrong);
    expect(requestHint(back).effect).toBe('hint');
    const end = play(play(back, 'd5e7'), 'e7c6');
    expect(sessionOutcome(end)).toEqual({ solved: false, firstTry: false, hintsUsed: 0, solutionShown: false });
  });

  it('a move after the warning withdraws it', () => {
    const warn = requestHint(started(fork(), 'rated')).state;
    expect(submitUserMove(warn, 'd5e7').state.hintWarning).toBe(false);
  });

  it('"Lösung zeigen" works from a wrong move as well', () => {
    const wrong = submitUserMove(started(fork(), 'rated'), 'e1e8').state;
    const sol = revealSolution(wrong);
    expect(sol).toMatchObject({ phase: 'solution', solutionShown: true, hintsUsed: 3, feedback: null });
    expect(sol.fen).toBe(started(fork()).fen);
  });
});
