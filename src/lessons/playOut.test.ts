import { describe, expect, it } from 'vitest';
import { ChessGame } from '@/lib/chess';
import { judgePlayOut, movesLeft, type PlayOutPly } from './playOut';
import type { PlayOutStep } from './types';

type Goal = Pick<PlayOutStep, 'goal' | 'maxMoves' | 'userColor'>;

/** Plays `moves` from `fen` and returns the ply input for the last move. */
function ply(fen: string, moves: string[], mover: 'user' | 'bot', userMoves: number): PlayOutPly {
  const game = ChessGame.fromFen(fen);
  let last = null;
  for (const m of moves) {
    last = game.move(m);
    if (!last) throw new Error(`illegal ${m}`);
  }
  return { status: game.status(), mover, move: last, userMoves };
}

describe('judgePlayOut – checkmate goal', () => {
  const step: Goal = { goal: 'checkmate', maxMoves: 3, userColor: 'w' };
  const FEN = 'k7/8/2K5/8/8/8/8/7R w - - 0 1';

  it('succeeds when the learner mates within the moves (Kb6 Kb8 Rh8#)', () => {
    expect(judgePlayOut(step, ply(FEN, ['c6b6'], 'user', 1))).toBeNull();
    expect(judgePlayOut(step, ply(FEN, ['c6b6', 'a8b8'], 'bot', 1))).toBeNull();
    expect(judgePlayOut(step, ply(FEN, ['c6b6', 'a8b8', 'h1h8'], 'user', 2))).toEqual({ outcome: 'success', reason: 'user_mated' });
  });

  it('fails when the last allowed move does not mate', () => {
    expect(judgePlayOut({ ...step, maxMoves: 1 }, ply(FEN, ['c6b6'], 'user', 1))).toEqual({ outcome: 'fail', reason: 'moves_exhausted' });
  });

  it('fails on stalemate (stalemate is a draw, FIDE Art. 5.2.1)', () => {
    // 1.Qc7?? – Black's king on a8 has no legal move and is not in check.
    const fen = 'k7/8/3Q4/8/8/8/8/7K w - - 0 1';
    expect(judgePlayOut(step, ply(fen, ['d6c7'], 'user', 1))).toEqual({ outcome: 'fail', reason: 'stalemate' });
  });

  it('fails when the learner is checkmated', () => {
    // Black (bot) mates: White Kh1, pawns g2 h2; Black Ra8 plays Ra1#.
    const fen = 'r5k1/8/8/8/8/8/6PP/7K b - - 0 1';
    expect(judgePlayOut(step, ply(fen, ['a8a1'], 'bot', 1))).toEqual({ outcome: 'fail', reason: 'user_was_mated' });
  });
});

describe('judgePlayOut – promote goal', () => {
  const step: Goal = { goal: 'promote', maxMoves: 2, userColor: 'w' };

  it('succeeds with any promotion of the learner (Q, R, B or N – compulsory, own colour)', () => {
    const fen = '8/4P3/8/8/8/k7/8/K7 w - - 0 1';
    expect(judgePlayOut(step, ply(fen, ['e7e8n'], 'user', 1))).toEqual({ outcome: 'success', reason: 'promoted' });
    expect(judgePlayOut(step, ply(fen, ['e7e8q'], 'user', 1))).toEqual({ outcome: 'success', reason: 'promoted' });
  });

  it('a promotion that stalemates fails; one that mates or leaves a dead position succeeds', () => {
    // Black Ka8 has no square: a7 (pawn b6), b7/b8 (Kc7). h8=B and h8=N give no check → stalemate; h8=Q is mate.
    const fen = 'k7/2K4P/1P6/8/8/8/8/8 w - - 0 1';
    expect(judgePlayOut(step, ply(fen, ['h7h8b'], 'user', 1))).toEqual({ outcome: 'fail', reason: 'stalemate' });
    expect(judgePlayOut(step, ply(fen, ['h7h8n'], 'user', 1))).toEqual({ outcome: 'fail', reason: 'stalemate' });
    expect(judgePlayOut(step, ply(fen, ['h7h8q'], 'user', 1))).toEqual({ outcome: 'success', reason: 'user_mated' });
    // K+N vs K is a dead position (the game ends drawn), but the pawn was promoted.
    expect(judgePlayOut(step, ply('8/4P3/8/8/8/k7/8/K7 w - - 0 1', ['e7e8n'], 'user', 1))).toEqual({ outcome: 'success', reason: 'promoted' });
  });

  it('fails when the moves are used up without a promotion', () => {
    const fen = '8/8/4P3/8/8/k7/8/K7 w - - 0 1';
    expect(judgePlayOut({ ...step, maxMoves: 1 }, ply(fen, ['e6e7'], 'user', 1))).toEqual({ outcome: 'fail', reason: 'moves_exhausted' });
  });
});

describe('judgePlayOut – draw goal', () => {
  const step: Goal = { goal: 'draw', maxMoves: 2, userColor: 'b' };

  it('succeeds when the learner holds for maxMoves and the reply does not mate', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const line = ['e2e4', 'e8e7', 'e1e2', 'e7e6', 'e2e3'];
    expect(judgePlayOut(step, ply(fen, line.slice(0, 1), 'bot', 0))).toBeNull();
    expect(judgePlayOut(step, ply(fen, line.slice(0, 2), 'user', 1))).toBeNull();
    expect(judgePlayOut(step, ply(fen, line.slice(0, 3), 'bot', 1))).toBeNull();
    expect(judgePlayOut(step, ply(fen, line.slice(0, 4), 'user', 2))).toBeNull();
    expect(judgePlayOut(step, ply(fen, line, 'bot', 2))).toEqual({ outcome: 'success', reason: 'held' });
  });

  it('succeeds on stalemate and on insufficient material', () => {
    // White Kb6 stalemates the black king on a8 (the pawn on a7 is protected, b8 and b7 are covered).
    const stalemate = 'k7/P7/8/1K6/8/8/8/8 w - - 0 1';
    expect(judgePlayOut(step, ply(stalemate, ['b5b6'], 'bot', 0))).toEqual({ outcome: 'success', reason: 'stalemate' });
    // Black takes the last pawn: king against king can never checkmate.
    const bare = '8/8/8/8/8/4k3/3P4/7K b - - 0 1';
    expect(judgePlayOut(step, ply(bare, ['e3d2'], 'user', 1))).toEqual({ outcome: 'success', reason: 'drawn' });
  });

  it('counts a claimable draw (threefold repetition) as reached', () => {
    // Threefold repetition is a claim (FIDE Art. 9.2), not an automatic end – reaching it counts as holding.
    const fen = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    const line = ['a1a2', 'e8d8', 'a2a1', 'd8e8', 'a1a2', 'e8d8', 'a2a1', 'd8e8'];
    expect(judgePlayOut({ ...step, maxMoves: 10 }, ply(fen, line, 'user', 4))).toEqual({ outcome: 'success', reason: 'drawn' });
  });

  it('fails when the learner is checkmated', () => {
    const fen = 'k7/8/1K6/8/8/8/8/7R w - - 0 1';
    expect(judgePlayOut(step, ply(fen, ['h1h8'], 'bot', 0))).toEqual({ outcome: 'fail', reason: 'user_was_mated' });
  });
});

describe('movesLeft', () => {
  it('never goes below zero', () => {
    expect(movesLeft({ maxMoves: 3 }, 1)).toBe(2);
    expect(movesLeft({ maxMoves: 3 }, 5)).toBe(0);
  });
});
