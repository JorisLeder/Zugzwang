/**
 * "Finde den Zug" as a pure state machine (PRD Lektionen §4, P2-04 move trees, D-12, DESIGN §8.1/§8.2).
 *
 * - `step.solution` holds the accepted user moves at the start position; each accepted node's `children` are the
 *   opponent replies (the first one is auto-played), each reply's `children` the accepted user moves, and so on.
 *   The exercise is solved when an accepted user move has no reply, a reply has no further user move, or the user
 *   mates.
 * - With `acceptAnyMate` every move that checkmates immediately is accepted at any user ply (D-12).
 * - Moves are compared by their canonical UCI after playing them with `@/lib/chess` (castling, promotion letters).
 * - Wrong move → phase `wrong` (the UI shows it for 700 ms, then `revertFindMoveWrong`), counts a mistake.
 * - Hints, each counted: first the step's text hints (only before the first user move), then the piece to move
 *   (`hint-piece` ring), then the target square (`hint-target` ring).
 */
import type { Fen, MoveRecord, PieceSymbol, Square, SquareMark } from '@/core/chess';
import type { MoveTreeNode } from '@/core/lessons';
import { ChessGame, parseUci } from '@/lib/chess';
import { LESSONS_DE } from './strings.de';
import type { FindMoveStep } from './types';

/** Phase of the exercise. */
export type FindMovePhase = 'user' | 'opponent' | 'wrong' | 'done';

/** Verdict on a user move. */
export type FindMoveVerdict = 'correct' | 'mate' | 'wrong';

/** State of one "Finde den Zug" step. */
export interface FindMoveState {
  step: FindMoveStep;
  /** Current position (after all accepted moves). */
  fen: Fen;
  /** Accepted moves so far (user and opponent). */
  line: MoveRecord[];
  /** Accepted user moves in the current position (phase `user`). */
  nodes: readonly MoveTreeNode[];
  /** Opponent reply to auto-play (phase `opponent`). */
  pendingReply: MoveTreeNode | null;
  phase: FindMovePhase;
  /** The wrong move on the board (phase `wrong`). */
  wrongMove: MoveRecord | null;
  lastVerdict: FindMoveVerdict | null;
  /** Comments of the accepted moves so far, oldest first. */
  comments: string[];
  /** Hint stage at the current user ply (0 = none). */
  hintStage: number;
  /** Accepted user moves so far. */
  userPly: number;
  /** Wrong moves in this exercise. */
  wrongMoves: number;
  /** Hints used in this exercise. */
  hintsUsed: number;
}

/** Plays a UCI move on a position; `null` if illegal or the FEN is invalid. */
export function playUci(fen: Fen, uci: string): MoveRecord | null {
  try {
    return ChessGame.fromFen(fen).move(uci);
  } catch {
    return null;
  }
}

/** Start state of the exercise. */
export function createFindMove(step: FindMoveStep): FindMoveState {
  return {
    step,
    fen: step.fen,
    line: [],
    nodes: step.solution,
    pendingReply: null,
    phase: 'user',
    wrongMove: null,
    lastVerdict: null,
    comments: [],
    hintStage: 0,
    userPly: 0,
    wrongMoves: 0,
    hintsUsed: 0,
  };
}

/** The accepted node matching a played move, if any. */
function matchNode(fen: Fen, nodes: readonly MoveTreeNode[], played: MoveRecord): MoveTreeNode | undefined {
  return nodes.find((n) => playUci(fen, n.move)?.uci === played.uci);
}

/** Result of `submitFindMove`. */
export interface FindMoveResult {
  state: FindMoveState;
  /** `null` when the move was ignored (not the user's turn or illegal). */
  verdict: FindMoveVerdict | null;
  record: MoveRecord | null;
}

/** Judges a user move (UCI). */
export function submitFindMove(state: FindMoveState, uci: string): FindMoveResult {
  if (state.phase !== 'user') return { state, verdict: null, record: null };
  const record = playUci(state.fen, uci);
  if (!record) return { state, verdict: null, record: null };
  const match = matchNode(state.fen, state.nodes, record);
  if (!match && !(state.step.acceptAnyMate && record.isCheckmate)) {
    return {
      state: { ...state, phase: 'wrong', wrongMove: record, lastVerdict: 'wrong', wrongMoves: state.wrongMoves + 1 },
      verdict: 'wrong',
      record,
    };
  }
  const verdict: FindMoveVerdict = match ? 'correct' : 'mate';
  const reply = match && !record.isCheckmate ? match.children[0] ?? null : null;
  return {
    state: {
      ...state,
      fen: record.fenAfter,
      line: [...state.line, record],
      nodes: [],
      pendingReply: reply,
      phase: reply ? 'opponent' : 'done',
      wrongMove: null,
      lastVerdict: verdict,
      comments: match?.comment ? [...state.comments, match.comment] : state.comments,
      hintStage: 0,
      userPly: state.userPly + 1,
    },
    verdict,
    record,
  };
}

/** Auto-plays the opponent's reply (phase `opponent`). */
export function playFindMoveReply(state: FindMoveState): { state: FindMoveState; record: MoveRecord | null } {
  if (state.phase !== 'opponent' || !state.pendingReply) return { state, record: null };
  const reply = state.pendingReply;
  const record = playUci(state.fen, reply.move);
  if (!record) return { state: { ...state, phase: 'done', pendingReply: null }, record: null };
  const nodes = record.isCheckmate ? [] : reply.children;
  return {
    state: {
      ...state,
      fen: record.fenAfter,
      line: [...state.line, record],
      nodes,
      pendingReply: null,
      phase: nodes.length > 0 ? 'user' : 'done',
      comments: reply.comment ? [...state.comments, reply.comment] : state.comments,
    },
    record,
  };
}

/** Takes the wrong move back (after the 700 ms feedback). */
export function revertFindMoveWrong(state: FindMoveState): FindMoveState {
  return state.phase === 'wrong' ? { ...state, phase: 'user', wrongMove: null } : state;
}

/** Number of text hints available at the current ply (text hints only before the first user move). */
function textHintCount(state: FindMoveState): number {
  return state.userPly === 0 ? state.step.hintsDe.length : 0;
}

/** Highest hint stage at the current ply: text hints + piece + target. */
export function maxHintStage(state: FindMoveState): number {
  return textHintCount(state) + 2;
}

/** Whether another hint is available. */
export function canRequestHint(state: FindMoveState): boolean {
  return (state.phase === 'user' || state.phase === 'wrong') && state.nodes.length > 0 && state.hintStage < maxHintStage(state);
}

/** Next hint stage (counts one hint); unchanged when no hint is available. */
export function requestFindMoveHint(state: FindMoveState): { state: FindMoveState; counted: boolean } {
  if (!canRequestHint(state)) return { state, counted: false };
  return { state: { ...state, hintStage: state.hintStage + 1, hintsUsed: state.hintsUsed + 1 }, counted: true };
}

/** What the current hint stage shows. */
export interface FindMoveHint {
  textDe: string | null;
  marks: SquareMark[];
}

/** Text and board marks of the current hint stage (main line = first accepted move). */
export function findMoveHint(state: FindMoveState): FindMoveHint {
  const stage = state.hintStage;
  const expected = state.nodes[0];
  if (stage <= 0 || !expected) return { textDe: null, marks: [] };
  const texts = textHintCount(state);
  if (stage <= texts) return { textDe: state.step.hintsDe[stage - 1] ?? null, marks: [] };
  const input = parseUci(expected.move);
  if (!input) return { textDe: null, marks: [] };
  let piece: PieceSymbol = 'p';
  try {
    piece = ChessGame.fromFen(state.fen).pieceAt(input.from)?.type ?? 'p';
  } catch {
    // keep the default
  }
  const pieceMark: SquareMark = { square: input.from as Square, kind: 'hint-piece' };
  if (stage === texts + 1) return { textDe: LESSONS_DE.pieceHint(piece, input.from), marks: [pieceMark] };
  return {
    textDe: LESSONS_DE.targetHint(piece, input.to),
    marks: [pieceMark, { square: input.to as Square, kind: 'hint-target' }],
  };
}
