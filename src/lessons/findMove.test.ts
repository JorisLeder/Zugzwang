import { describe, expect, it } from 'vitest';
import {
  canRequestHint,
  createFindMove,
  findMoveHint,
  maxHintStage,
  playFindMoveReply,
  requestFindMoveHint,
  revertFindMoveWrong,
  submitFindMove,
  type FindMoveState,
} from './findMove';
import type { FindMoveStep } from './types';

/** Mate in 2 with two solutions (1.Kg6 Kg8 2.Ra8#, 1.Kf7 Kh7 2.Rh1#), as in the fixture lesson. */
const MATE_IN_TWO: FindMoveStep = {
  id: 'm2',
  type: 'find_move',
  promptDe: 'Setze matt in zwei Zügen.',
  fen: '7k/8/5K2/8/8/8/8/R7 w - - 0 1',
  solution: [
    { move: 'f6g6', comment: 'Der König sperrt g7 und h7.', children: [{ move: 'h8g8', children: [{ move: 'a1a8', children: [] }] }] },
    { move: 'f6f7', children: [{ move: 'h8h7', comment: 'Nur noch h7.', children: [{ move: 'a1h1', children: [] }] }] },
  ],
  acceptAnyMate: true,
  claim: { kind: 'mate', mateIn: 2 },
  hintsDe: ['Erst der König.', 'Nimm ihm die Felder.'],
  explanationDe: 'Erklärung',
};

/** Back-rank mate in 1 where Rd8# is the solution; Re8# is not listed. */
const TWO_MATES: FindMoveStep = {
  id: 'm1',
  type: 'find_move',
  promptDe: 'Setze matt.',
  fen: '6k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1',
  solution: [{ move: 'd1d8', children: [] }],
  acceptAnyMate: true,
  claim: { kind: 'mate', mateIn: 1 },
  hintsDe: ['Achte Reihe.'],
  explanationDe: 'Erklärung',
};

function play(state: FindMoveState, uci: string): FindMoveState {
  return submitFindMove(state, uci).state;
}

describe('find_move – move tree', () => {
  it('accepts the main line, auto-plays the reply and finishes after the last user move', () => {
    let s = createFindMove(MATE_IN_TWO);
    const r = submitFindMove(s, 'f6g6');
    expect(r.verdict).toBe('correct');
    expect(r.state.phase).toBe('opponent');
    expect(r.state.comments).toEqual(['Der König sperrt g7 und h7.']);
    s = playFindMoveReply(r.state).state;
    expect(s.phase).toBe('user');
    expect(s.fen.startsWith('6k1/8/6K1/')).toBe(true);
    const last = submitFindMove(s, 'a1a8');
    expect(last.verdict).toBe('correct');
    expect(last.record?.isCheckmate).toBe(true);
    expect(last.state.phase).toBe('done');
    expect(last.state.line.map((m) => m.uci)).toEqual(['f6g6', 'h8g8', 'a1a8']);
  });

  it('accepts a variation (any accepted user move at a node) with its own reply', () => {
    let s = play(createFindMove(MATE_IN_TWO), 'f6f7');
    s = playFindMoveReply(s).state;
    expect(s.line.at(-1)?.uci).toBe('h8h7');
    expect(s.comments).toEqual(['Nur noch h7.']);
    s = play(s, 'a1h1');
    expect(s.phase).toBe('done');
  });

  it('a wrong move counts and is taken back', () => {
    const r = submitFindMove(createFindMove(MATE_IN_TWO), 'a1a8'); // Ta8+ Kh7 – no mate
    expect(r.verdict).toBe('wrong');
    expect(r.state).toMatchObject({ phase: 'wrong', wrongMoves: 1 });
    expect(r.state.wrongMove?.uci).toBe('a1a8');
    const back = revertFindMoveWrong(r.state);
    expect(back).toMatchObject({ phase: 'user', wrongMove: null, fen: MATE_IN_TWO.fen });
    // No move is accepted while the wrong move is shown.
    expect(submitFindMove(r.state, 'f6g6').verdict).toBeNull();
  });

  it('acceptAnyMate accepts every immediately mating move (D-12)', () => {
    const r = submitFindMove(createFindMove(TWO_MATES), 'e1e8');
    expect(r.verdict).toBe('mate');
    expect(r.state.phase).toBe('done');
    const strict = submitFindMove(createFindMove({ ...TWO_MATES, acceptAnyMate: false }), 'e1e8');
    expect(strict.verdict).toBe('wrong');
  });

  it('accepts a mate at a later ply that is not in the tree', () => {
    let s = play(createFindMove({ ...MATE_IN_TWO, solution: [{ move: 'f6g6', children: [{ move: 'h8g8', children: [{ move: 'a1b1', children: [] }] }] }] }), 'f6g6');
    s = playFindMoveReply(s).state;
    const r = submitFindMove(s, 'a1a8');
    expect(r.verdict).toBe('mate');
  });

  it('ignores illegal moves', () => {
    expect(submitFindMove(createFindMove(MATE_IN_TWO), 'a1h8').verdict).toBeNull();
  });

  it('compares moves by their canonical UCI (castling given as king takes rook)', () => {
    const step: FindMoveStep = {
      ...TWO_MATES,
      fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
      solution: [{ move: 'e1h1', children: [] }],
      acceptAnyMate: false,
      claim: { kind: 'rule' },
    };
    expect(submitFindMove(createFindMove(step), 'e1g1').verdict).toBe('correct');
  });
});

describe('find_move – hints', () => {
  it('text hints first, then the piece, then the target square; each counts', () => {
    let s = createFindMove(MATE_IN_TWO);
    expect(maxHintStage(s)).toBe(4);
    expect(findMoveHint(s)).toEqual({ textDe: null, marks: [] });
    s = requestFindMoveHint(s).state;
    expect(findMoveHint(s)).toEqual({ textDe: 'Erst der König.', marks: [] });
    s = requestFindMoveHint(s).state;
    expect(findMoveHint(s).textDe).toBe('Nimm ihm die Felder.');
    s = requestFindMoveHint(s).state;
    expect(findMoveHint(s)).toEqual({ textDe: 'Schau dir deinen König auf f6 an.', marks: [{ square: 'f6', kind: 'hint-piece' }] });
    s = requestFindMoveHint(s).state;
    expect(findMoveHint(s)).toEqual({
      textDe: 'Er will nach g6.',
      marks: [
        { square: 'f6', kind: 'hint-piece' },
        { square: 'g6', kind: 'hint-target' },
      ],
    });
    expect(s.hintsUsed).toBe(4);
    expect(canRequestHint(s)).toBe(false);
    expect(requestFindMoveHint(s)).toMatchObject({ counted: false });
  });

  it('after the first user move only piece and target hints are left, and the stage resets', () => {
    let s = play(createFindMove(MATE_IN_TWO), 'f6g6');
    expect(canRequestHint(s)).toBe(false); // opponent to move
    s = playFindMoveReply(s).state;
    expect(s.hintStage).toBe(0);
    expect(maxHintStage(s)).toBe(2);
    s = requestFindMoveHint(s).state;
    expect(findMoveHint(s).textDe).toBe('Schau dir deinen Turm auf a1 an.');
  });

  it('uses "Sie" for the queen', () => {
    const step: FindMoveStep = {
      ...TWO_MATES,
      fen: '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1',
      solution: [{ move: 'd1d8', children: [] }],
      hintsDe: ['x'],
    };
    let s = createFindMove(step);
    s = requestFindMoveHint(requestFindMoveHint(requestFindMoveHint(s).state).state).state;
    expect(findMoveHint(s).textDe).toBe('Sie will nach d8.');
  });
});
