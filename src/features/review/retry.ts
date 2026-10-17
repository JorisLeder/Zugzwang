/**
 * "Nochmal versuchen" (PRD §3, DESIGN §8.1/§8.2/§8.4) as a pure state machine. For a mistake, miss or blunder the
 * board goes back to the position before the move and the learner tries to find a better move:
 * - the engine's best move succeeds at once; the move played in the game fails at once; any other move is assessed
 *   with `analysis.assessMove` and succeeds when it loses ≤ 0.02 expected points (`SUCCESS_LOSS`);
 * - hints on request (never automatic): stage 1 rings the piece of the best move, stage 2 also its target square;
 * - after `MAX_TRIES` wrong tries, or with "Besseren Zug zeigen", the better move is revealed.
 */
import type { AnalysedMove } from '@/core/analysis';
import type { Color, Fen, MoveRecord, PieceSymbol, San, Square, SquareMark, Uci } from '@/core/chess';
import { ChessGame, parseUci } from '@/lib/chess';

/** Loss (expected points) up to which another move counts as found (BACKLOG WP-05). */
export const SUCCESS_LOSS = 0.02;
/** Wrong tries before the better move is revealed. */
export const MAX_TRIES = 3;
/** How long a wrong move stays on the board before it is taken back (DESIGN §8.2). */
export const WRONG_MOVE_MS = 700;

/** Phase of a retry. */
export type RetryPhase = 'thinking' | 'checking' | 'wrong' | 'success' | 'revealed';

/** State of one retry. */
export interface RetryState {
  ply: number;
  fenBefore: Fen;
  mover: Color;
  bestMove: Uci;
  bestSan: San;
  playedMove: Uci;
  /** Piece and squares of the best move (hints). */
  hintPiece: PieceSymbol;
  hintFrom: Square;
  hintTo: Square;
  tries: number;
  hint: 0 | 1 | 2;
  phase: RetryPhase;
  /** The learner's last move (shown on the board while checking and as feedback). */
  attempt: { uci: Uci; san: San; to: Square; fenAfter: Fen } | null;
  /** Success with another move than the engine's best. */
  alternative: boolean;
  /** The last check failed (engine error) – the try did not count. */
  checkFailed: boolean;
}

/** Starts a retry for a move with a known better move; `null` if the move cannot be retried. */
export function startRetry(m: AnalysedMove): RetryState | null {
  if (!m.bestMove || m.bestMove === m.uci) return null;
  const best = parseUci(m.bestMove);
  if (!best) return null;
  let piece: PieceSymbol | undefined;
  try {
    piece = ChessGame.fromFen(m.fenBefore).pieceAt(best.from)?.type;
  } catch {
    return null;
  }
  if (!piece) return null;
  return {
    ply: m.ply,
    fenBefore: m.fenBefore,
    mover: m.color,
    bestMove: m.bestMove,
    bestSan: m.bestMoveSan ?? m.bestMove,
    playedMove: m.uci,
    hintPiece: piece,
    hintFrom: best.from,
    hintTo: best.to,
    tries: 0,
    hint: 0,
    phase: 'thinking',
    attempt: null,
    alternative: false,
    checkFailed: false,
  };
}

/** How an attempt is decided: at once (`best`, `played`) or by an engine assessment. */
export function attemptKind(state: RetryState, uci: Uci): 'best' | 'played' | 'assess' {
  if (uci === state.bestMove) return 'best';
  if (uci === state.playedMove) return 'played';
  return 'assess';
}

/** The learner made a move: show it and wait for the decision. */
export function beginAttempt(state: RetryState, rec: MoveRecord): RetryState {
  if (state.phase !== 'thinking') return state;
  return { ...state, phase: 'checking', checkFailed: false, attempt: { uci: rec.uci, san: rec.san, to: rec.to, fenAfter: rec.fenAfter } };
}

/** Decision of the current attempt (`loss` from `assessMove`, `null` when the check failed). */
export function resolveAttempt(state: RetryState, outcome: 'best' | 'played' | { loss: number } | null): RetryState {
  if (state.phase !== 'checking') return state;
  if (outcome === null) return { ...state, phase: 'thinking', attempt: null, checkFailed: true };
  if (outcome === 'best') return { ...state, phase: 'success', alternative: false };
  if (outcome !== 'played' && outcome.loss <= SUCCESS_LOSS) return { ...state, phase: 'success', alternative: true };
  return { ...state, phase: 'wrong', tries: state.tries + 1 };
}

/** After the wrong-move feedback: take the move back; reveal after `MAX_TRIES`. */
export function afterWrong(state: RetryState): RetryState {
  if (state.phase !== 'wrong') return state;
  if (state.tries >= MAX_TRIES) return { ...state, phase: 'revealed', attempt: null };
  return { ...state, phase: 'thinking', attempt: null };
}

/** Next hint stage (piece → target square); a third request reveals the move. */
export function nextHint(state: RetryState): RetryState {
  if (state.phase !== 'thinking') return state;
  if (state.hint === 0) return { ...state, hint: 1 };
  if (state.hint === 1) return { ...state, hint: 2 };
  return reveal(state);
}

/** "Besseren Zug zeigen". */
export function reveal(state: RetryState): RetryState {
  if (state.phase === 'success') return state;
  return { ...state, phase: 'revealed', attempt: null };
}

/** Whether the retry is over (the better move may be shown). */
export function retryDone(state: RetryState): boolean {
  return state.phase === 'success' || state.phase === 'revealed';
}

/** Position on the board during the retry. */
export function retryFen(state: RetryState): Fen {
  return state.attempt?.fenAfter ?? state.fenBefore;
}

/** Hint marks: stage 1 the piece, stage 2 also the target square (DESIGN §8.1). */
export function retryMarks(state: RetryState): SquareMark[] {
  if (retryDone(state) || state.hint === 0) return [];
  const marks: SquareMark[] = [{ square: state.hintFrom, kind: 'hint-piece' }];
  if (state.hint >= 2) marks.push({ square: state.hintTo, kind: 'hint-target' });
  return marks;
}

/** Wrong tries left before the reveal. */
export function triesLeft(state: RetryState): number {
  return Math.max(0, MAX_TRIES - state.tries);
}
