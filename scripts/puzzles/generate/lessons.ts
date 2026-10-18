/**
 * Lesson exercises as puzzles (PRD P0-04): every "Finde den Zug" step with a `puzzle` flag becomes a bank puzzle
 * with source `lesson`, id `lesson-<lessonId>-<stepId>`, the rating of the flag and the flag's themes plus the
 * tagger's themes.
 *
 * Lichess format needs the opponent's move before the solver's first move, but an exercise only has the position
 * with the learner to move. `retroMove` therefore constructs a legal predecessor: one opponent piece is moved back to
 * a square it could have come from (no capture is undone, castling rights and the en-passant square stay
 * consistent), and the forward move must reproduce the exercise position exactly (placement, side to move, castling,
 * en passant). Preferred is the piece the solution captures first ("it just moved into the attack"), then other
 * pieces, pawns, and the king last.
 *
 * The solution line follows the first accepted move and the first (auto-played) reply at every level of the move
 * tree. Exercises with alternative non-mating first moves are skipped (a puzzle has one solution), and every lesson
 * puzzle has to pass the validator's engine check before it is exported.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Color, Fen, PieceSymbol, Square, Uci } from '@/core/chess';
import type { Lesson, LessonStep, MoveTreeNode } from '@/core/lessons';
import type { Puzzle } from '@/core/puzzles';
import { RATING_DEFAULTS } from '@/core/rating';
import { lessonSchema } from '@/core/schemas';
import { divideGame, gamePhase } from '@/analysis';
import { buildFen, ChessGame, normalizeFen, parseFen, positionKey, validateFen, type BoardPiece } from '@/lib/chess';
import { explainPuzzle } from './assemble';
import { fileOf, rankOf, sortThemes, squareAt, tagPuzzle, type Phase } from './tagger';

/** Repo-relative lesson folder. */
export const LESSONS_DIR = 'content/lessons';

type FindMoveStep = Extract<LessonStep, { type: 'find_move' }>;

/** A flagged exercise. */
export interface LessonExercise {
  lessonId: string;
  step: FindMoveStep & { puzzle: NonNullable<FindMoveStep['puzzle']> };
}

/** Reads every lesson file below `rootDir/content/lessons/<course>/` and returns the flagged exercises (sorted). */
export function readLessonExercises(rootDir: string): LessonExercise[] {
  const base = join(rootDir, LESSONS_DIR);
  const out: LessonExercise[] = [];
  for (const course of readdirSync(base).sort()) {
    const dir = join(base, course);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.json')) continue;
      const parsed = lessonSchema.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown);
      if (!parsed.success) continue;
      out.push(...flaggedExercises(parsed.data as Lesson));
    }
  }
  return out;
}

/** The flagged find_move steps of a lesson. */
export function flaggedExercises(lesson: Lesson): LessonExercise[] {
  return lesson.steps.flatMap((step) => (step.type === 'find_move' && step.puzzle ? [{ lessonId: lesson.id, step: step as LessonExercise['step'] }] : []));
}

/** Main line of a move tree: first accepted move, first reply, … (starts and ends with a learner move). */
export function mainLine(tree: readonly MoveTreeNode[]): Uci[] {
  const line: Uci[] = [];
  let level = tree;
  while (level.length > 0) {
    const node = level[0]!;
    line.push(node.move);
    level = node.children;
  }
  return line.length % 2 === 0 ? line.slice(0, -1) : line;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] as const;
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
const ROOK_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const BISHOP_DIRS = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const;

/** Squares from which a piece of `type`/`color` could have moved to `to` without capturing (board `occupied`). */
function originSquares(type: PieceSymbol, color: Color, to: Square, occupied: ReadonlySet<Square>, epTarget: Square | '-'): Square[] {
  const f = fileOf(to);
  const r = rankOf(to);
  const free = (s: Square | null): s is Square => s !== null && !occupied.has(s);
  const out: Square[] = [];
  if (type === 'p') {
    const dir = color === 'w' ? 1 : -1;
    const one = squareAt(f, r - dir);
    const startRank = color === 'w' ? 1 : 6;
    const two = squareAt(f, r - 2 * dir);
    if (epTarget !== '-') {
      // The last move was the double step that created the e.p. square.
      if (one === epTarget && free(one) && two && rankOf(two) === startRank && free(two)) out.push(two);
      return out;
    }
    if (free(one) && rankOf(one) !== (color === 'w' ? 0 : 7)) out.push(one);
    if (free(one) && free(two) && rankOf(two) === startRank) out.push(two);
    return out;
  }
  if (epTarget !== '-') return out;
  if (type === 'n' || type === 'k') {
    for (const [df, dr] of type === 'n' ? KNIGHT : KING) {
      const s = squareAt(f + df, r + dr);
      if (free(s)) out.push(s);
    }
    return out;
  }
  const dirs = type === 'r' ? ROOK_DIRS : type === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
  for (const [df, dr] of dirs) {
    for (let k = 1; k < 8; k++) {
      const s = squareAt(f + df * k, r + dr * k);
      if (!free(s)) break;
      out.push(s);
    }
  }
  return out;
}

/** Pieces whose retro move would contradict the castling rights (unmoved king and rooks). */
function castlingLocked(castling: string, color: Color): Set<Square> {
  const locked = new Set<Square>();
  const [k, q, king, kRook, qRook] = color === 'w' ? ['K', 'Q', 'e1', 'h1', 'a1'] : ['k', 'q', 'e8', 'h8', 'a8'];
  if (castling.includes(k!) || castling.includes(q!)) locked.add(king as Square);
  if (castling.includes(k!)) locked.add(kRook as Square);
  if (castling.includes(q!)) locked.add(qRook as Square);
  return locked;
}

/**
 * A legal opponent move leading to `fen` (see the file header), or `null` if none was found.
 * Candidates are tried in this order: the `preferred` piece (e.g. the piece the solution captures), non-king pieces
 * before the king, forward moves before sideways and backward ones (a developing move looks natural), then by square.
 */
export function retroMove(fen: Fen, preferred?: Square): { fen: Fen; move: Uci } | null {
  const parts = parseFen(fen);
  if (!parts) return null;
  const mover = other(parts.turn);
  const target = positionKey(normalizeFen(fen));
  const occupied = new Set(parts.pieces.map((p) => p.square));
  const locked = castlingLocked(parts.castling, mover);
  const forwardSign = mover === 'w' ? 1 : -1;
  const candidates: Array<{ piece: BoardPiece; from: Square; key: [number, number, number] }> = [];
  for (const piece of parts.pieces) {
    if (piece.color !== mover || locked.has(piece.square)) continue;
    for (const from of originSquares(piece.type, piece.color, piece.square, occupied, parts.enPassant)) {
      const forward = (rankOf(piece.square) - rankOf(from)) * forwardSign;
      candidates.push({ piece, from, key: [piece.square === preferred ? 0 : 1, piece.type === 'k' ? 1 : 0, -forward] });
    }
  }
  candidates.sort(
    (a, b) =>
      a.key[0] - b.key[0] ||
      a.key[1] - b.key[1] ||
      a.key[2] - b.key[2] ||
      a.piece.square.localeCompare(b.piece.square) ||
      a.from.localeCompare(b.from),
  );
  for (const { piece, from } of candidates) {
    const pieces = parts.pieces.map((p) => (p.square === piece.square ? { ...p, square: from } : p));
    const before = buildFen({
      pieces,
      turn: mover,
      castling: parts.castling,
      enPassant: '-',
      halfmove: 0,
      fullmove: Math.max(1, mover === 'b' ? parts.fullmove - 1 : parts.fullmove),
    });
    if (!validateFen(before).ok) continue;
    let game: ChessGame;
    try {
      game = ChessGame.fromFen(before);
    } catch {
      continue;
    }
    if (game.status().isOver) continue;
    const rec = game.move(`${from}${piece.square}`);
    if (!rec || positionKey(normalizeFen(game.fen())) !== target) continue;
    return { fen: before, move: rec.uci };
  }
  return null;
}

/** Phase of a single position (Lichess divider thresholds on that position alone). */
export function positionPhase(fen: Fen): Phase {
  return gamePhase(1, divideGame([fen]));
}

/** Why an exercise was not exported. */
export type LessonSkip = { id: string; reason: string };

/**
 * Builds the lesson puzzle of an exercise (without the engine check) or explains why not.
 * The explanation is the rule-based one (like generated puzzles), the rating is the flag's.
 */
export function lessonPuzzle(ex: LessonExercise): Puzzle | LessonSkip {
  const { step, lessonId } = ex;
  const id = `lesson-${lessonId}-${step.id}`;
  if (step.claim.kind === 'rule') return { id, reason: 'rule exercise' };
  const line = mainLine(step.solution);
  if (line.length === 0) return { id, reason: 'empty solution' };
  const firstGame = ChessGame.fromFen(step.fen);
  const first = firstGame.move(line[0]!);
  if (!first) return { id, reason: `illegal move ${line[0]!}` };
  if (step.solution.length > 1 && !(line.length === 1 && first.isCheckmate)) return { id, reason: 'alternative first moves' };
  const retro = retroMove(step.fen, first.captured ? first.to : undefined);
  if (!retro) return { id, reason: 'no retro move' };
  const moves = [retro.move, ...line];
  const mateIn = step.claim.kind === 'mate' ? step.claim.mateIn : null;
  let themes;
  try {
    themes = tagPuzzle({ fen: retro.fen, moves, mateIn, phase: positionPhase(step.fen) });
  } catch (e) {
    return { id, reason: e instanceof Error ? e.message : String(e) };
  }
  const allThemes = sortThemes([...step.puzzle.themes, ...themes]);
  return {
    id,
    fen: retro.fen,
    moves,
    rating: step.puzzle.rating,
    ratingDeviation: RATING_DEFAULTS.puzzleRd,
    themes: allThemes,
    openingTags: [],
    source: 'lesson',
    explanation: explainPuzzle(retro.fen, moves, allThemes, mateIn),
  };
}

/** Type guard for skips. */
export function isSkip(r: Puzzle | LessonSkip): r is LessonSkip {
  return 'reason' in r;
}
