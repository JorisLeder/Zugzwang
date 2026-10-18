/**
 * Rating estimate of a generated puzzle (no play statistics exist yet, so the rating is a documented heuristic; the
 * Glicko-2 deviation stays at the default 80 – ratings of puzzles never change, D-09).
 *
 * rating = base + depth + choice + firstMove + extras + jitter, clamped to 150–2400, where
 * - base by line type: mate in 1 → 250; one move that wins a hanging piece → 300; any other one-move win → 480;
 *   mate in n ≥ 2 → 250 + 330·(n − 1) (mate in 2 = 580 … mate in 5 = 1240 + 330 = 1570);
 *   advantage line of u ≥ 2 solver moves → 560 + 280·(u − 1);
 * - depth: + 30 per ply of the depth at which Stockfish first kept the solution move, beyond 3 (max + 360) – moves
 *   the engine finds late are harder for humans too;
 * - choice: + 3 per legal move beyond 25, − 3 per legal move below 25 (clamped to −45 … +75);
 * - firstMove: a checking first move − 50, a capture − 30 (forcing moves are found first), a quiet first move (no
 *   check, capture or promotion) + 150; a knight mate in one + 40;
 * - extras: sacrifice + 120, a quiet move later in the line + 80, underpromotion + 100;
 * - jitter: deterministic −30 … +30 from the puzzle id (spreads equal puzzles over the band).
 * Calibration: one-move mates and one-move hanging pieces are clamped to 200–600 (the main learner is at about
 * 200 Elo, so these are the core of the easy band).
 */
import type { Fen, Uci } from '@/core/chess';
import type { PuzzleThemeId } from '@/core/puzzles';
import { ChessGame } from '@/lib/chess';
import { replayLine } from '../lib/puzzleChecks';
import { hashSeed } from './rng';

/** Inputs of the rating heuristic. */
export interface RatingFeatures {
  /** Number of solver moves. */
  solverMoves: number;
  /** Forced mate distance (`null` = no mate). */
  mateIn: number | null;
  /** Depth from which Stockfish kept the first solver move. */
  findDepth: number;
  /** Legal moves of the solver at the puzzle start. */
  legalMoves: number;
  /** Kind of the first solver move. */
  firstMove: 'mate' | 'check' | 'capture' | 'promotion' | 'quiet';
  /** The first solver move is a knight move (for knight mates). */
  firstMoveByKnight: boolean;
  themes: readonly PuzzleThemeId[];
}

/** Rating limits. */
export const RATING_LIMITS = { min: 150, max: 2400, easyMin: 200, easyMax: 600 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Features of a puzzle line (Lichess format). Throws on an illegal line. */
export function ratingFeatures(fen: Fen, moves: readonly Uci[], mateIn: number | null, findDepth: number, themes: readonly PuzzleThemeId[]): RatingFeatures {
  const { records, illegalAt } = replayLine(fen, moves);
  if (illegalAt !== null || records.length < 2) throw new Error('ratingFeatures: illegal line');
  const first = records[1]!;
  const firstMove = first.isCheckmate ? 'mate' : first.isCheck ? 'check' : first.captured ? 'capture' : first.promotion ? 'promotion' : 'quiet';
  return {
    solverMoves: Math.floor(moves.length / 2),
    mateIn,
    findDepth,
    legalMoves: ChessGame.fromFen(first.fenBefore).legalMoves().length,
    firstMove,
    firstMoveByKnight: first.piece === 'n',
    themes,
  };
}

/** Whether the puzzle is a one-move mate or a one-move win of a hanging piece (the calibrated easy kinds). */
export function isEasyKind(f: RatingFeatures): boolean {
  return f.solverMoves === 1 && (f.mateIn === 1 || f.themes.includes('hangingPiece'));
}

/** The rating parts (for tests and statistics). */
export function ratingParts(f: RatingFeatures): Record<'base' | 'depth' | 'choice' | 'firstMove' | 'extras', number> {
  const u = f.solverMoves;
  let base: number;
  if (f.mateIn === 1 && u === 1) base = 250;
  else if (u === 1) base = f.themes.includes('hangingPiece') ? 300 : 480;
  else if (f.mateIn !== null) base = 250 + 330 * (f.mateIn - 1);
  else base = 560 + 280 * (u - 1);
  const depth = 30 * clamp(f.findDepth - 3, 0, 12);
  const choice = 3 * clamp(f.legalMoves - 25, -15, 25);
  let firstMove = f.firstMove === 'check' ? -50 : f.firstMove === 'capture' ? -30 : f.firstMove === 'quiet' ? 150 : 0;
  if (f.firstMove === 'mate' && f.firstMoveByKnight) firstMove += 40;
  let extras = 0;
  if (f.themes.includes('sacrifice')) extras += 120;
  if (f.themes.includes('quietMove')) extras += 80;
  if (f.themes.includes('underPromotion')) extras += 100;
  return { base, depth, choice, firstMove, extras };
}

/** Deterministic jitter −30 … +30 from a key. */
export function ratingJitter(key: string): number {
  return (hashSeed('rating', key) % 61) - 30;
}

/** Estimated rating (see the file header). `key` (the puzzle id) only feeds the jitter. */
export function estimateRating(f: RatingFeatures, key: string): number {
  const p = ratingParts(f);
  const raw = p.base + p.depth + p.choice + p.firstMove + p.extras + ratingJitter(key);
  if (isEasyKind(f)) return Math.round(clamp(raw, RATING_LIMITS.easyMin, RATING_LIMITS.easyMax));
  return Math.round(clamp(raw, RATING_LIMITS.min, RATING_LIMITS.max));
}
