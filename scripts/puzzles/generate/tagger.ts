/**
 * Theme tagging of generated and lesson puzzles (Lichess theme keys, `PUZZLE_THEMES`).
 *
 * Sources of the tags:
 * - WP-02 motif detectors (`detectMotifs`, `detectPins`) on every solver move, confirmed by the rest of the line (a
 *   fork only counts when a forked piece is captured later, a pin when the pinned piece or the piece behind it falls …);
 * - the line itself: mate and engine-confirmed mate distance (`mateInN`), length (`oneMove` … `veryLong`), sacrifice
 *   (the solver is ≥ 2 pawns down after a later solver move), promotion, en passant, castling, quiet moves;
 * - pattern checks on the final mate position (back rank, smothered, Arabian, hook, Anastasia, Boden, double bishop,
 *   dovetail) and Lichess-style heuristics for attraction, deflection, x-ray, intermezzo, capturing the defender,
 *   king-side/queen-side attack, exposed king and f2/f7 – ported from the rules of lichess-puzzler `tagger/cook.py`
 *   (AGPL-3.0; the rules are re-implemented here on `@/lib/chess`, no code was copied);
 * - game phase (Lichess divider, `@/analysis`) and endgame type by material.
 * Every tag is decided by rules on positions that `@/lib/chess` replayed – nothing is guessed from text.
 */
import type { Color, Fen, MoveRecord, PieceSymbol, Square, Uci } from '@/core/chess';
import type { MotifInstance } from '@/core/explain';
import { PUZZLE_THEMES, type PuzzleThemeId } from '@/core/puzzles';
import { detectMotifs, detectPins } from '@/analysis';
import { attackersOf, boardPieces, ChessGame, kingSquare, materialBalance, PIECE_VALUES, type BoardPiece } from '@/lib/chess';
import { replayLine } from '../lib/puzzleChecks';

/** Game phase of the puzzle position. */
export type Phase = 'opening' | 'middlegame' | 'endgame';

/** Input of `tagPuzzle`. */
export interface TagInput {
  /** Puzzle FEN (before the opponent's move `moves[0]`). */
  fen: Fen;
  moves: readonly Uci[];
  /** Engine-confirmed forced-mate distance at the first solver ply (`null` = no forced mate). */
  mateIn: number | null;
  /** Solver-POV centipawns after the solution for non-mate lines (`crushing` ≥ 600, `advantage` ≥ 200). */
  finalCp?: number | null;
  /** Phase of the puzzle position in its game (endgame types override it). */
  phase: Phase;
}

// ------------------------------------------------------------------------------------------------ square geometry

const FILES = 'abcdefgh';

/** File index 0–7 (a = 0). */
export function fileOf(sq: Square): number {
  return sq.charCodeAt(0) - 97;
}

/** Rank index 0–7 (rank 1 = 0). */
export function rankOf(sq: Square): number {
  return Number(sq[1]) - 1;
}

/** Square from indices, `null` outside the board. */
export function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]!}${rank + 1}` as Square;
}

/** Chebyshev (king-move) distance. */
export function distance(a: Square, b: Square): number {
  return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
}

/** Squares strictly between `a` and `b` on a rank, file or diagonal (empty otherwise). */
export function between(a: Square, b: Square): Square[] {
  const df = fileOf(b) - fileOf(a);
  const dr = rankOf(b) - rankOf(a);
  if (!(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) || (df === 0 && dr === 0)) return [];
  const sf = Math.sign(df);
  const sr = Math.sign(dr);
  const out: Square[] = [];
  for (let f = fileOf(a) + sf, r = rankOf(a) + sr; f !== fileOf(b) || r !== rankOf(b); f += sf, r += sr) out.push(squareAt(f, r)!);
  return out;
}

/** Squares at distance 1. */
export function neighbours(sq: Square): Square[] {
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const s = squareAt(fileOf(sq) + df, rankOf(sq) + dr);
      if (s) out.push(s);
    }
  }
  return out;
}

function pieceMap(fen: Fen): Map<Square, BoardPiece> {
  return new Map(boardPieces(fen).map((p) => [p.square, p]));
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Lichess `king_values`: the king counts as 99. */
function kingValue(p: PieceSymbol): number {
  return p === 'k' ? 99 : PIECE_VALUES[p];
}

function solverMaterial(fen: Fen, solver: Color): number {
  const b = materialBalance(fen);
  return solver === 'w' ? b : -b;
}

// ------------------------------------------------------------------------------------------------ line context

/** A replayed puzzle line. */
export interface LineContext {
  records: MoveRecord[];
  solver: Color;
  opp: Color;
  /** Position after the opponent's first move (solver to move). */
  start: Fen;
  /** Indices of solver moves in `records` (1, 3, 5 …). */
  solverIdx: number[];
  /** Final position. */
  final: Fen;
  endsInMate: boolean;
  /** Motifs created by the solver move at a record index (lazy). */
  motifsAt(i: number): MotifInstance[];
}

/** Replays a puzzle; `null` if a move is illegal or the line is too short. */
export function lineContext(fen: Fen, moves: readonly Uci[]): LineContext | null {
  const { records, illegalAt } = replayLine(fen, moves);
  if (illegalAt !== null || records.length < 2) return null;
  const solver = records[1]!.color;
  const cache = new Map<number, MotifInstance[]>();
  return {
    records,
    solver,
    opp: other(solver),
    start: records[0]!.fenAfter,
    solverIdx: records.map((_, i) => i).filter((i) => i % 2 === 1),
    final: records[records.length - 1]!.fenAfter,
    endsInMate: records[records.length - 1]!.isCheckmate,
    motifsAt(i) {
      let m = cache.get(i);
      if (!m) {
        m = detectMotifs(records[i]!.fenBefore, records[i]!.uci);
        cache.set(i, m);
      }
      return m;
    },
  };
}

/** A solver move after record index `i` captures on one of `squares` (optionally only pieces of `type`). */
function laterSolverCapture(ctx: LineContext, i: number, squares: ReadonlySet<Square> | null, type?: PieceSymbol): boolean {
  return ctx.solverIdx.some((j) => {
    const r = ctx.records[j]!;
    if (j <= i || !r.captured) return false;
    if (squares && !squares.has(r.to)) return false;
    return type === undefined || r.captured === type;
  });
}

/**
 * The opponent piece standing on `square` after record index `i` is captured by a later solver move – also after it
 * moved on (e.g. a pinned queen that takes the pinning bishop and is recaptured).
 */
function pieceCapturedLater(ctx: LineContext, i: number, square: Square): boolean {
  let sq = square;
  for (let j = i + 1; j < ctx.records.length; j++) {
    const r = ctx.records[j]!;
    if (r.color === ctx.opp) {
      if (r.from === sq) sq = r.to;
    } else if (r.to === sq && r.captured) {
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ tactical motifs

/** The first solver move captures an undefended non-pawn piece (not a recapture); short, non-mate lines only. */
export function isHangingPiece(ctx: LineContext): boolean {
  const r = ctx.records[1]!;
  if (!r.captured || r.captured === 'p' || r.isEnPassant || ctx.endsInMate || ctx.solverIdx.length > 2) return false;
  if (attackersOf(r.fenBefore, r.to, ctx.opp).length > 0) return false;
  const op = ctx.records[0]!;
  return !(op.captured && op.to === r.to && PIECE_VALUES[op.captured] >= PIECE_VALUES[r.captured]);
}

/** A non-final solver move forks (WP-02 `detectFork`) and a forked piece is captured later. */
export function isFork(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(0, -1).some((i) => {
    const rec = ctx.records[i]!;
    const fork = ctx.motifsAt(i).find((m) => m.id === 'fork' && m.squares[0] === rec.to);
    return fork !== undefined && laterSolverCapture(ctx, i, new Set(fork.squares.slice(1)));
  });
}

/**
 * Pin: a solver move creates a pin and the pinned piece (wherever it moves) or the piece behind it is captured later;
 * or a piece pinned to its king at the start is attacked by the first solver move and captured later.
 */
export function isPin(ctx: LineContext): boolean {
  const created = ctx.solverIdx.slice(0, -1).some((i) =>
    ctx
      .motifsAt(i)
      .filter((m) => m.id === 'pin' && m.pieces[0]?.color === ctx.solver)
      .some((m) => pieceCapturedLater(ctx, i, m.squares[1]!) || pieceCapturedLater(ctx, i, m.squares[2]!)),
  );
  if (created) return true;
  if (ctx.solverIdx.length < 2) return false;
  const first = ctx.records[1]!;
  return detectPins(ctx.start, ctx.opp)
    .filter((m) => m.pieces[2]?.piece === 'k')
    .some((m) => {
      const pinned = m.squares[1]!;
      return attackersOf(first.fenAfter, pinned, ctx.solver).includes(first.to) && pieceCapturedLater(ctx, 1, pinned);
    });
}

/** A solver move skewers (WP-02 `detectSkewers`) and the piece behind is captured later. */
export function isSkewer(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(0, -1).some((i) =>
    ctx
      .motifsAt(i)
      .filter((m) => m.id === 'skewer' && m.pieces[0]?.color === ctx.solver)
      .some((m) => laterSolverCapture(ctx, i, new Set([m.squares[2]!]))),
  );
}

/** A solver move gives a discovered check, or discovers an attack on a piece that is captured later. */
export function isDiscoveredAttack(ctx: LineContext): boolean {
  return ctx.solverIdx.some((i) =>
    ctx
      .motifsAt(i)
      .filter((m) => m.id === 'discovered_attack' && m.pieces[0]?.color === ctx.solver)
      .some((m) => m.pieces[1]?.piece === 'k' || laterSolverCapture(ctx, i, new Set([m.squares[1]!]))),
  );
}

/** A solver move gives double check. */
export function isDoubleCheck(ctx: LineContext): boolean {
  return ctx.solverIdx.some((i) => ctx.motifsAt(i).some((m) => m.id === 'double_check'));
}

/** A solver move traps an enemy piece (WP-02 `detectTrappedPieces`) and a piece of that type is captured later. */
export function isTrappedPiece(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(0, -1).some((i) =>
    ctx
      .motifsAt(i)
      .filter((m) => m.id === 'trapped_piece' && m.pieces[0]?.color === ctx.opp)
      .some((m) => laterSolverCapture(ctx, i, null, m.pieces[0]!.piece)),
  );
}

/** A solver capture removes a defender; a piece it defended (and the solver attacked) is captured undefended later. */
export function isCapturingDefender(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(0, -1).some((i) => {
    const rec = ctx.records[i]!;
    if (!rec.captured || rec.isEnPassant) return false;
    const before = rec.fenBefore;
    const defended = boardPieces(before).filter(
      (p) =>
        p.color === ctx.opp &&
        p.type !== 'k' &&
        p.square !== rec.to &&
        attackersOf(before, p.square, ctx.opp).includes(rec.to) &&
        attackersOf(before, p.square, ctx.solver).length > 0,
    );
    return ctx.solverIdx.some((j) => {
      const r2 = ctx.records[j]!;
      if (j <= i || !r2.captured) return false;
      const d = defended.find((p) => p.square === r2.to && p.type === r2.captured);
      return d !== undefined && attackersOf(r2.fenBefore, r2.to, ctx.opp).length === 0;
    });
  });
}

/** After a later solver move the solver is ≥ 2 pawns down compared with the start (no opponent promotion). */
export function isSacrifice(ctx: LineContext): boolean {
  if (ctx.records.some((r, i) => i > 0 && i % 2 === 0 && r.promotion)) return false;
  const initial = solverMaterial(ctx.start, ctx.solver);
  return ctx.solverIdx.slice(1).some((i) => solverMaterial(ctx.records[i]!.fenAfter, ctx.solver) - initial <= -2);
}

function isAdvancedPawnMove(rec: MoveRecord, minRelRank: number): boolean {
  if (rec.promotion) return true;
  if (rec.piece !== 'p') return false;
  const rel = rec.color === 'w' ? rankOf(rec.to) : 7 - rankOf(rec.to);
  return rel >= minRelRank;
}

/**
 * Quiet move: a non-final solver move without check, capture or promotion, not escaping a check, not a king move or
 * an advanced pawn push, after which the moved piece attacks no enemy piece.
 */
export function isQuietMove(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(0, -1).some((i) => {
    const rec = ctx.records[i]!;
    if (rec.captured || rec.isCheck || rec.promotion || rec.piece === 'k' || isAdvancedPawnMove(rec, 4)) return false;
    if (ChessGame.fromFen(rec.fenBefore).status().inCheck) return false;
    return !boardPieces(rec.fenAfter).some((p) => p.color === ctx.opp && attackersOf(rec.fenAfter, p.square, ctx.solver).includes(rec.to));
  });
}

/** Attraction: a solver piece is captured by the king, queen or rook on its square, which the solver then attacks. */
export function isAttraction(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(0, -1).some((i) => {
    const s = ctx.records[i]!.to;
    const reply = ctx.records[i + 1];
    const next = ctx.records[i + 2];
    if (!reply || !next || reply.to !== s || !reply.captured || !['k', 'q', 'r'].includes(reply.piece)) return false;
    if (!attackersOf(next.fenAfter, s, ctx.solver).includes(next.to)) return false;
    if (reply.piece === 'k') return next.isCheck;
    const n3 = ctx.records[i + 4];
    return n3 !== undefined && n3.to === s && n3.captured !== undefined;
  });
}

/** Deflection (Lichess rule): a defender is lured away by a check or a bait, then the solver takes what it guarded. */
export function isDeflection(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(1).some((i) => {
    const node = ctx.records[i]!;
    if (!node.captured && !node.promotion) return false;
    if (node.captured && kingValue(node.captured) < kingValue(node.piece)) return false;
    const square = node.to;
    const prevOp = ctx.records[i - 1]!;
    const grandpa = ctx.records[i - 2]!;
    const baitOk = !grandpa.captured || PIECE_VALUES[grandpa.captured] < kingValue(grandpa.piece);
    if (!baitOk || square === prevOp.to || square === grandpa.to) return false;
    if (!(prevOp.to === grandpa.to || grandpa.isCheck)) return false;
    const guarded =
      attackersOf(grandpa.fenBefore, square, ctx.opp).includes(prevOp.from) ||
      (node.promotion !== undefined && fileOf(node.to) === fileOf(prevOp.from) && attackersOf(grandpa.fenBefore, node.from, ctx.opp).includes(prevOp.from));
    return guarded && !attackersOf(node.fenBefore, square, ctx.opp).includes(prevOp.to);
  });
}

/** X-ray: solver captures, the opponent recaptures, and the solver recaptures through the square the recapturer left. */
export function isXRay(ctx: LineContext): boolean {
  return ctx.solverIdx.some((i) => {
    if (i < 3) return false;
    const node = ctx.records[i]!;
    const prevOp = ctx.records[i - 1]!;
    const prevPl = ctx.records[i - 2]!;
    if (!node.captured || prevOp.to !== node.to || prevOp.piece === 'k' || prevPl.to !== prevOp.to) return false;
    return between(node.from, node.to).includes(prevOp.from);
  });
}

/** Intermezzo: the opponent captured, the solver first plays another move, then recaptures (already legal before). */
export function isIntermezzo(ctx: LineContext): boolean {
  return ctx.solverIdx.slice(1).some((i) => {
    const node = ctx.records[i]!;
    if (!node.captured) return false;
    const opNode = ctx.records[i - 1]!;
    const prevPov = ctx.records[i - 2]!;
    const prevOp = ctx.records[i - 3]!;
    if (attackersOf(prevPov.fenAfter, node.to, ctx.opp).includes(opNode.from) || prevPov.to === node.to) return false;
    if (prevOp.to !== node.to || !prevOp.captured) return false;
    return ChessGame.fromFen(prevOp.fenAfter)
      .legalMoves()
      .some((m) => m.uci === node.uci);
  });
}

/** Side attack (Lichess rule): the enemy king on its back rank in the corner region, checks and captures near it. */
function sideAttack(ctx: LineContext, cornerFile: number, kingFiles: readonly number[], minPieces: number): boolean {
  const backRank = ctx.solver === 'w' ? 7 : 0;
  const king = kingSquare(ctx.start, ctx.opp);
  if (!king || rankOf(king) !== backRank || !kingFiles.includes(fileOf(king)) || boardPieces(ctx.start).length < minPieces) return false;
  const solverMoves = ctx.solverIdx.map((i) => ctx.records[i]!);
  if (!solverMoves.some((r) => r.isCheck)) return false;
  const corner = squareAt(cornerFile, backRank)!;
  let score = 0;
  for (const r of solverMoves) {
    const d = distance(corner, r.to);
    if (r.isCheck) score += 1;
    if (r.captured && d <= 3) score += 1;
    else if (d >= 5) score -= 1;
  }
  return score >= 2;
}

/** Attack on the castled king's side (king on g/h-file, ≥ 20 pieces). */
export function isKingsideAttack(ctx: LineContext): boolean {
  return sideAttack(ctx, 7, [6, 7], 20);
}

/** Attack on the queen's side (king on a–c-file, ≥ 18 pieces). */
export function isQueensideAttack(ctx: LineContext): boolean {
  return sideAttack(ctx, 0, [0, 1, 2], 18);
}

/** Exposed king (Lichess rule): the enemy king on its own side without pawn cover, and a middle solver move checks. */
export function isExposedKing(ctx: LineContext): boolean {
  const king = kingSquare(ctx.start, ctx.opp);
  if (!king) return false;
  const rel = ctx.solver === 'w' ? rankOf(king) : 7 - rankOf(king);
  if (rel < 5) return false;
  const toward = ctx.solver === 'w' ? -1 : 1;
  const f = fileOf(king);
  const r = rankOf(king);
  const cover = [squareAt(f, r + toward), squareAt(f - 1, r), squareAt(f - 1, r + toward), squareAt(f + 1, r), squareAt(f + 1, r + toward)];
  const map = pieceMap(ctx.start);
  if (cover.some((s) => s !== null && map.get(s)?.type === 'p' && map.get(s)?.color === ctx.opp)) return false;
  return ctx.solverIdx.slice(1, -1).some((i) => ctx.records[i]!.isCheck);
}

/** A solver move captures the pawn on f7 (White solves) or f2 (Black solves) next to the enemy king. */
export function isAttackingF2F7(ctx: LineContext): boolean {
  const target: Square = ctx.solver === 'w' ? 'f7' : 'f2';
  return ctx.solverIdx.some((i) => {
    const r = ctx.records[i]!;
    if (r.to !== target || r.captured !== 'p') return false;
    const king = kingSquare(r.fenBefore, ctx.opp);
    return king !== null && distance(king, target) <= 1;
  });
}

// ------------------------------------------------------------------------------------------------ mate patterns

function finalKing(ctx: LineContext): Square | null {
  return ctx.endsInMate ? kingSquare(ctx.final, ctx.opp) : null;
}

function checkers(ctx: LineContext, king: Square): BoardPiece[] {
  const map = pieceMap(ctx.final);
  return attackersOf(ctx.final, king, ctx.solver)
    .map((s) => map.get(s))
    .filter((p): p is BoardPiece => p !== undefined);
}

/** Back-rank mate: the king on its back rank, the squares in front blocked by its own unattacked pieces. */
export function isBackRankMate(ctx: LineContext): boolean {
  const king = finalKing(ctx);
  if (!king) return false;
  const backRank = ctx.opp === 'b' ? 7 : 0;
  if (rankOf(king) !== backRank) return false;
  const front = backRank === 7 ? 6 : 1;
  const map = pieceMap(ctx.final);
  for (const df of [-1, 0, 1]) {
    const s = squareAt(fileOf(king) + df, front);
    if (!s) continue;
    const p = map.get(s);
    if (!p || p.color === ctx.solver || attackersOf(ctx.final, s, ctx.solver).length > 0) return false;
  }
  return checkers(ctx, king).some((c) => rankOf(c.square) === backRank);
}

/** Smothered mate: a knight mates and every neighbour square of the king holds one of its own pieces. */
export function isSmotheredMate(ctx: LineContext): boolean {
  const king = finalKing(ctx);
  if (!king || !checkers(ctx, king).some((c) => c.type === 'n')) return false;
  const map = pieceMap(ctx.final);
  return neighbours(king).every((s) => map.get(s)?.color === ctx.opp);
}

/** Arabian mate: king in the corner, the mating rook next to it, protected by a knight two files and ranks away. */
export function isArabianMate(ctx: LineContext): boolean {
  const king = finalKing(ctx);
  const last = ctx.records[ctx.records.length - 1]!;
  if (!king || ![0, 7].includes(fileOf(king)) || ![0, 7].includes(rankOf(king)) || last.piece !== 'r' || distance(last.to, king) !== 1) return false;
  const map = pieceMap(ctx.final);
  return attackersOf(ctx.final, last.to, ctx.solver).some((s) => {
    const p = map.get(s);
    return p?.type === 'n' && Math.abs(rankOf(s) - rankOf(king)) === 2 && Math.abs(fileOf(s) - fileOf(king)) === 2;
  });
}

/** Hook mate: rook next to the king, protected by a knight next to the king, which a pawn protects. */
export function isHookMate(ctx: LineContext): boolean {
  const king = finalKing(ctx);
  const last = ctx.records[ctx.records.length - 1]!;
  if (!king || last.piece !== 'r' || distance(last.to, king) !== 1) return false;
  const map = pieceMap(ctx.final);
  return attackersOf(ctx.final, last.to, ctx.solver).some((s) => {
    if (map.get(s)?.type !== 'n' || distance(s, king) !== 1) return false;
    return attackersOf(ctx.final, s, ctx.solver).some((t) => map.get(t)?.type === 'p');
  });
}

/** Anastasia's mate: king on the edge file, the queen/rook mates on that file, a knight three files in, own blocker beside. */
export function isAnastasiaMate(ctx: LineContext): boolean {
  const king = finalKing(ctx);
  const last = ctx.records[ctx.records.length - 1]!;
  if (!king || ![0, 7].includes(fileOf(king)) || [0, 7].includes(rankOf(king))) return false;
  if (fileOf(last.to) !== fileOf(king) || !['q', 'r'].includes(last.promotion ?? last.piece)) return false;
  const dir = fileOf(king) === 0 ? 1 : -1;
  const map = pieceMap(ctx.final);
  const knight = squareAt(fileOf(king) + 3 * dir, rankOf(king));
  const blocker = squareAt(fileOf(king) + dir, rankOf(king));
  const n = knight ? map.get(knight) : undefined;
  const b = blocker ? map.get(blocker) : undefined;
  return n?.type === 'n' && n.color === ctx.solver && b !== undefined && b.color === ctx.opp;
}

/** Boden's mate (bishops from both sides) or double-bishop mate (same side): only bishops control the king's field. */
export function bishopMate(ctx: LineContext): 'bodenMate' | 'doubleBishopMate' | null {
  const king = finalKing(ctx);
  if (!king) return null;
  const map = pieceMap(ctx.final);
  // Only bishops that attack the king's square or one of its neighbours take part (a far-away bishop does not count).
  const involved: Square[] = [];
  for (const s of [king, ...neighbours(king)]) {
    const attackers = attackersOf(ctx.final, s, ctx.solver);
    if (!attackers.every((a) => map.get(a)?.type === 'b')) return null;
    for (const a of attackers) if (!involved.includes(a)) involved.push(a);
  }
  if (involved.length < 2) return null;
  const [s0, s1] = involved as [Square, Square];
  return (fileOf(s0) < fileOf(king)) === (fileOf(s1) > fileOf(king)) ? 'bodenMate' : 'doubleBishopMate';
}

/** Dovetail mate: the queen mates diagonally adjacent; every escape square is covered only by her or blocked. */
export function isDovetailMate(ctx: LineContext): boolean {
  const king = finalKing(ctx);
  const last = ctx.records[ctx.records.length - 1]!;
  if (!king || [0, 7].includes(fileOf(king)) || [0, 7].includes(rankOf(king))) return false;
  const q = last.to;
  if ((last.promotion ?? last.piece) !== 'q' || fileOf(q) === fileOf(king) || rankOf(q) === rankOf(king) || distance(q, king) > 1) return false;
  const map = pieceMap(ctx.final);
  for (const s of neighbours(king)) {
    if (s === q) continue;
    const attackers = attackersOf(ctx.final, s, ctx.solver);
    if (attackers.length === 1 && attackers[0] === q) {
      if (map.has(s)) return false;
    } else if (attackers.length > 0) {
      return false;
    }
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ material, phase

/** Endgame type by material (Lichess: only kings, pawns and the named pieces, at the start and after move 1). */
export function endgameType(ctx: LineContext): PuzzleThemeId | null {
  const boards = [ctx.start, ctx.records[1]!.fenAfter];
  const kinds = boards.map((fen) => {
    const pieces = boardPieces(fen).filter((p) => p.type !== 'k' && p.type !== 'p');
    const types = new Set(pieces.map((p) => p.type));
    if (types.size === 0) return 'pawnEndgame';
    if (types.size === 1) {
      const t = [...types][0]!;
      return ({ r: 'rookEndgame', q: 'queenEndgame', b: 'bishopEndgame', n: 'knightEndgame' } as Record<string, string>)[t] ?? null;
    }
    if (types.size === 2 && types.has('q') && types.has('r') && pieces.filter((p) => p.type === 'q').length === 1) return 'queenRookEndgame';
    return null;
  });
  return kinds[0] !== null && kinds[0] === kinds[1] ? kinds[0] : null;
}

/** Lichess-style opening tags from a book name: `Sicilian Defense: Dragon Variation, Yugoslav Attack` →
 * `Sicilian_Defense`, `Sicilian_Defense_Dragon_Variation`. */
export function openingTagsFromName(name: string | null | undefined): string[] {
  if (!name) return [];
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’.]/g, '')
      .replace(/[^A-Za-z0-9-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const [familyRaw, rest] = name.split(':', 2);
  const family = clean(familyRaw ?? '');
  if (!family) return [];
  const variation = rest ? clean(rest.split(',')[0] ?? '') : '';
  return variation ? [family, `${family}_${variation}`] : [family];
}

// ------------------------------------------------------------------------------------------------ public

const THEME_ORDER = new Map(PUZZLE_THEMES.map((t, i) => [t.id, i]));

/** Sorts theme ids in `PUZZLE_THEMES` order and removes duplicates. */
export function sortThemes(themes: Iterable<PuzzleThemeId>): PuzzleThemeId[] {
  return [...new Set(themes)].sort((a, b) => (THEME_ORDER.get(a) ?? 999) - (THEME_ORDER.get(b) ?? 999) || a.localeCompare(b));
}

/** All themes of a puzzle (see the file header). Throws on an illegal line. */
export function tagPuzzle(input: TagInput): PuzzleThemeId[] {
  const ctx = lineContext(input.fen, input.moves);
  if (!ctx) throw new Error('tagPuzzle: illegal or too short line');
  const t: PuzzleThemeId[] = [];
  const u = ctx.solverIdx.length;
  // Mate and length
  if (ctx.endsInMate) {
    t.push('mate');
    if (input.mateIn !== null && input.mateIn === u) t.push(`mateIn${Math.min(u, 5)}`);
  } else if (input.finalCp !== undefined && input.finalCp !== null) {
    if (input.finalCp >= 600) t.push('crushing');
    else if (input.finalCp >= 200) t.push('advantage');
  }
  t.push(u === 1 ? 'oneMove' : u === 2 ? 'short' : u === 3 ? 'long' : 'veryLong');
  // Phase and endgame type
  const eg = endgameType(ctx);
  t.push(eg ? 'endgame' : input.phase);
  if (eg) t.push(eg);
  // Motifs
  if (isHangingPiece(ctx)) t.push('hangingPiece');
  if (isFork(ctx)) t.push('fork');
  if (isPin(ctx)) t.push('pin');
  if (isSkewer(ctx)) t.push('skewer');
  if (isDiscoveredAttack(ctx)) t.push('discoveredAttack');
  if (isDoubleCheck(ctx)) t.push('doubleCheck');
  if (isTrappedPiece(ctx)) t.push('trappedPiece');
  if (isCapturingDefender(ctx)) t.push('capturingDefender');
  if (isSacrifice(ctx)) t.push('sacrifice');
  if (isQuietMove(ctx)) t.push('quietMove');
  if (isAttraction(ctx)) t.push('attraction');
  if (isDeflection(ctx)) t.push('deflection');
  if (isXRay(ctx)) t.push('xRayAttack');
  if (isIntermezzo(ctx)) t.push('intermezzo');
  if (input.phase !== 'endgame' && !eg) {
    if (isKingsideAttack(ctx)) t.push('kingsideAttack');
    if (isQueensideAttack(ctx)) t.push('queensideAttack');
    if (isExposedKing(ctx)) t.push('exposedKing');
  }
  if (isAttackingF2F7(ctx)) t.push('attackingF2F7');
  // Special moves
  const solverMoves = ctx.solverIdx.map((i) => ctx.records[i]!);
  if (solverMoves.some((r) => r.promotion)) t.push('promotion');
  if (solverMoves.some((r) => r.promotion && r.promotion !== 'q')) t.push('underPromotion');
  if (solverMoves.some((r) => isAdvancedPawnMove(r, 6))) t.push('advancedPawn');
  if (solverMoves.some((r) => r.isEnPassant)) t.push('enPassant');
  if (solverMoves.some((r) => r.isCastle)) t.push('castling');
  // Mate patterns
  if (isBackRankMate(ctx)) t.push('backRankMate');
  if (isSmotheredMate(ctx)) t.push('smotheredMate');
  if (isArabianMate(ctx)) t.push('arabianMate');
  if (isHookMate(ctx)) t.push('hookMate');
  if (isAnastasiaMate(ctx)) t.push('anastasiaMate');
  const bm = bishopMate(ctx);
  if (bm) t.push(bm);
  if (isDovetailMate(ctx)) t.push('dovetailMate');
  return sortThemes(t);
}
