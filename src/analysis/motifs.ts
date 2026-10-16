/**
 * Rule-based motif detectors (PRD "Analyse-Pipeline" step 4, BACKLOG WP-02). Pure functions on `@/lib/chess` only:
 * attack maps via `attackersOf`/`isSquareAttacked` (pinned pieces included, D-44), legal moves via `ChessGame`,
 * pieces removed/placed via `boardPieces`/`buildFen` for x-ray and pin tests, material via `materialBalance`.
 *
 * Every detector returns `MotifInstance`s (`@/core`): `squares` lists the key square first (forking piece, pinning
 * piece, hanging piece …), `pieces` the pieces involved, `gain` the material in pawns where it is known.
 */
import type { Color, Fen, MoveRecord, PieceSymbol, Square, Uci } from '@/core/chess';
import type { EngineLine } from '@/core/engine';
import type { MotifInstance } from '@/core/explain';
import {
  attackersOf,
  ChessGame,
  isSquareAttacked,
  kingSquare,
  materialBalance,
  nullMoveFen,
  parseFen,
  parseUci,
  uciLineToSan,
  type BoardPiece,
} from '@/lib/chess';
import { captureGain, mapFen, otherColor, pieceMap, pieceValue, type PieceMap } from './see';

const SLIDERS: ReadonlySet<PieceSymbol> = new Set(['b', 'r', 'q']);

function pieceRef(p: BoardPiece): MotifInstance['pieces'][number] {
  return { square: p.square, piece: p.type, color: p.color };
}

function turnOf(fen: Fen): Color | null {
  return parseFen(fen)?.turn ?? null;
}

/** Loads a position, `null` if it is not a legal position. */
function load(fen: Fen): ChessGame | null {
  try {
    return ChessGame.fromFen(fen);
  } catch {
    return null;
  }
}

/** The position with `color` to move (null move if needed); `null` if that is impossible (the other side in check). */
function withTurn(fen: Fen, color: Color): Fen | null {
  return turnOf(fen) === color ? fen : nullMoveFen(fen);
}

// ---------------------------------------------------------------------------------------------------------------
// Hanging pieces
// ---------------------------------------------------------------------------------------------------------------

/**
 * Pieces of `color` (king excluded) that the opponent can win by capturing: attacked and SEE < 0 for their owner
 * (`captureGain` > 0). `minValue` filters small fry (default: pawns included).
 */
export function detectHangingPieces(fen: Fen, color: Color, opts: { minValue?: number } = {}): MotifInstance[] {
  const opp = otherColor(color);
  const out: MotifInstance[] = [];
  for (const p of pieceMap(fen).values()) {
    if (p.color !== color || p.type === 'k' || pieceValue(p.type) < (opts.minValue ?? 1)) continue;
    const gain = captureGain(fen, p.square, opp);
    if (gain <= 0) continue;
    out.push({ id: 'hanging_piece', squares: [p.square, ...attackersOf(fen, p.square, opp)], pieces: [pieceRef(p)], gain });
  }
  return out.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));
}

// ---------------------------------------------------------------------------------------------------------------
// Fork
// ---------------------------------------------------------------------------------------------------------------

/**
 * Fork by the piece on `square` (not a king): it cannot be won itself (`captureGain` ≤ 0) and attacks at least two
 * enemy non-pawn pieces that are either the king, worth more than the forking piece, or can be won by capturing.
 */
export function detectFork(fen: Fen, square: Square): MotifInstance | null {
  const map = pieceMap(fen);
  const forker = map.get(square);
  if (!forker || forker.type === 'k') return null;
  const opp = otherColor(forker.color);
  if (captureGain(fen, square, opp) > 0) return null;
  const targets: BoardPiece[] = [];
  for (const t of map.values()) {
    if (t.color !== opp || t.type === 'p') continue;
    if (!attackersOf(fen, t.square, forker.color).includes(square)) continue;
    const valuable = t.type === 'k' || pieceValue(t.type) > pieceValue(forker.type);
    if (valuable || captureGain(fen, t.square, forker.color) > 0) targets.push(t);
  }
  if (targets.length < 2) return null;
  return {
    id: 'fork',
    squares: [square, ...targets.map((t) => t.square)],
    pieces: [pieceRef(forker), ...targets.map(pieceRef)],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Pins and skewers (x-ray through one piece)
// ---------------------------------------------------------------------------------------------------------------

interface XRay {
  attacker: BoardPiece;
  front: BoardPiece;
  behind: BoardPiece;
}

/** Enemy sliders that attack a piece of `color` and would attack another piece of `color` behind it. */
function xRays(fen: Fen, color: Color): XRay[] {
  const map = pieceMap(fen);
  const opp = otherColor(color);
  const own = [...map.values()].filter((p) => p.color === color);
  const out: XRay[] = [];
  for (const front of own) {
    if (front.type === 'k') continue;
    const sliders = attackersOf(fen, front.square, opp)
      .map((sq) => map.get(sq))
      .filter((p): p is BoardPiece => p !== undefined && SLIDERS.has(p.type));
    if (sliders.length === 0) continue;
    const without: PieceMap = new Map(map);
    without.delete(front.square);
    const fenWithout = mapFen(without);
    for (const behind of own) {
      if (behind.square === front.square) continue;
      const revealed = attackersOf(fenWithout, behind.square, opp);
      if (revealed.length === 0) continue;
      const before = attackersOf(fen, behind.square, opp);
      for (const attacker of sliders) {
        if (revealed.includes(attacker.square) && !before.includes(attacker.square)) out.push({ attacker, front, behind });
      }
    }
  }
  // A king in front (skewer) is excluded above; add skewers through the king separately.
  const king = own.find((p) => p.type === 'k');
  if (king) {
    const sliders = attackersOf(fen, king.square, opp)
      .map((sq) => map.get(sq))
      .filter((p): p is BoardPiece => p !== undefined && SLIDERS.has(p.type));
    if (sliders.length > 0) {
      const without: PieceMap = new Map(map);
      without.delete(king.square);
      const fenWithout = mapFen(without);
      for (const behind of own) {
        if (behind.type === 'k') continue;
        const revealed = attackersOf(fenWithout, behind.square, opp);
        const before = attackersOf(fen, behind.square, opp);
        for (const attacker of sliders) {
          if (revealed.includes(attacker.square) && !before.includes(attacker.square)) {
            out.push({ attacker, front: king, behind });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Pins against `color`: an enemy bishop, rook or queen attacks a piece of `color` that shields its king (absolute
 * pin) or a more valuable piece (relative pin, the piece behind worth ≥ 3). Squares: pinning piece, pinned piece,
 * piece behind.
 */
export function detectPins(fen: Fen, color: Color): MotifInstance[] {
  return xRays(fen, color)
    .filter(({ front, behind }) => {
      if (front.type === 'k') return false;
      if (behind.type === 'k') return true;
      return pieceValue(behind.type) >= 3 && pieceValue(behind.type) > pieceValue(front.type);
    })
    .map(({ attacker, front, behind }) => ({
      id: 'pin' as const,
      squares: [attacker.square, front.square, behind.square],
      pieces: [pieceRef(attacker), pieceRef(front), pieceRef(behind)],
    }));
}

/**
 * Skewers against `color`: an enemy bishop, rook or queen that cannot be won itself attacks the king or a piece that
 * is worth more than the piece (knight or better) behind it on the same line. Squares: attacker, front, behind.
 */
export function detectSkewers(fen: Fen, color: Color): MotifInstance[] {
  return xRays(fen, color)
    .filter(({ attacker, front, behind }) => {
      if (behind.type === 'k' || behind.type === 'p') return false;
      if (front.type !== 'k' && pieceValue(front.type) <= pieceValue(behind.type)) return false;
      return captureGain(fen, attacker.square, color) <= 0;
    })
    .map(({ attacker, front, behind }) => ({
      id: 'skewer' as const,
      squares: [attacker.square, front.square, behind.square],
      pieces: [pieceRef(attacker), pieceRef(front), pieceRef(behind)],
      gain: pieceValue(behind.type),
    }));
}

// ---------------------------------------------------------------------------------------------------------------
// Discovered attack / check, double check
// ---------------------------------------------------------------------------------------------------------------

/**
 * Discovered attacks of `move` (played in `fenBefore`): a bishop, rook or queen of the mover that did not move now
 * attacks an enemy king (discovered check) or an enemy piece (not a pawn) that is worth more than itself or that the
 * mover can now win (more) by capturing, because the moved piece left the line. Castling is ignored.
 * Squares: discovering piece, target, square the moved piece left.
 */
export function detectDiscoveredAttacks(fenBefore: Fen, move: Uci): MotifInstance[] {
  const game = load(fenBefore);
  const rec = game?.move(move);
  if (!rec || rec.isCastle) return [];
  const before = pieceMap(fenBefore);
  const after = pieceMap(rec.fenAfter);
  const mover = rec.color;
  const out: MotifInstance[] = [];
  for (const d of after.values()) {
    if (d.color !== mover || !SLIDERS.has(d.type) || d.square === rec.to) continue;
    const same = before.get(d.square);
    if (!same || same.type !== d.type || same.color !== d.color) continue;
    for (const t of after.values()) {
      if (t.color === mover || t.type === 'p') continue;
      if (!attackersOf(rec.fenAfter, t.square, mover).includes(d.square)) continue;
      if (attackersOf(fenBefore, t.square, mover).includes(d.square)) continue;
      const valuable =
        t.type === 'k' ||
        pieceValue(t.type) > pieceValue(d.type) ||
        captureGain(rec.fenAfter, t.square, mover) > captureGain(fenBefore, t.square, mover);
      if (!valuable) continue;
      out.push({ id: 'discovered_attack', squares: [d.square, t.square, rec.from], pieces: [pieceRef(d), pieceRef(t)] });
    }
  }
  return out;
}

/** Double check: the side to move in `fen` is in check from two pieces. Squares: king, then the checking pieces. */
export function detectDoubleCheck(fen: Fen): MotifInstance | null {
  const turn = turnOf(fen);
  if (!turn) return null;
  const king = kingSquare(fen, turn);
  if (!king) return null;
  const checkers = attackersOf(fen, king, otherColor(turn));
  if (checkers.length < 2) return null;
  const map = pieceMap(fen);
  return {
    id: 'double_check',
    squares: [king, ...checkers],
    pieces: [king, ...checkers].map((sq) => map.get(sq)).filter((p): p is BoardPiece => !!p).map(pieceRef),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Mate threat, back rank
// ---------------------------------------------------------------------------------------------------------------

/**
 * Mate threat against `threatened`: the opponent (if it were its turn – null move when needed) has a forced mate.
 * - With an engine `line` (searched from the position with the opponent to move, White-POV score, D-08): a mate score
 *   for the opponent whose PV is legal there.
 * - Without a line: a mate in one found by trying every legal move.
 * Squares: from/to of the mating (first) move. `null` if there is no threat or the threatened side is in check
 * (then the opponent cannot "pass").
 */
export function detectMateThreat(fen: Fen, threatened: Color, line?: EngineLine): MotifInstance | null {
  const threatener = otherColor(threatened);
  const pos = withTurn(fen, threatener);
  if (!pos) return null;
  const game = load(pos);
  if (!game || game.status().isOver) return null;
  const instance = (uci: Uci): MotifInstance | null => {
    const m = parseUci(uci);
    const p = m ? game.pieceAt(m.from) : null;
    if (!m || !p) return null;
    return { id: 'mate_threat', squares: [m.from, m.to], pieces: [{ square: m.from, piece: p.type, color: p.color }] };
  };
  if (line) {
    const mates = line.score.type === 'mate' && line.score.value !== 0 && (line.score.value > 0) === (threatener === 'w');
    if (mates && line.pv.length > 0 && uciLineToSan(pos, line.pv).length === line.pv.length) return instance(line.pv[0]!);
    return null;
  }
  for (const m of game.legalMoves()) {
    const rec = game.move(m.uci);
    game.undo();
    if (rec?.isCheckmate) return instance(m.uci);
  }
  return null;
}

/**
 * Back-rank weakness of `color`: its king stands on its first rank, every square directly in front of it is blocked
 * by its own pieces or controlled by the opponent, and the opponent has a rook or queen. Squares: king, then the
 * blocked flight squares.
 */
export function detectBackRankWeakness(fen: Fen, color: Color): MotifInstance | null {
  const king = kingSquare(fen, color);
  const backRank = color === 'w' ? '1' : '8';
  if (!king || king[1] !== backRank) return null;
  const map = pieceMap(fen);
  const opp = otherColor(color);
  const heavy = [...map.values()].some((p) => p.color === opp && (p.type === 'r' || p.type === 'q'));
  if (!heavy) return null;
  const forward = color === 'w' ? '2' : '7';
  const file = king.charCodeAt(0);
  const flights: Square[] = [];
  for (let f = file - 1; f <= file + 1; f += 1) {
    if (f < 97 || f > 104) continue;
    flights.push(`${String.fromCharCode(f)}${forward}` as Square);
  }
  for (const sq of flights) {
    const p = map.get(sq);
    const blocked = p?.color === color || isSquareAttacked(fen, sq, opp);
    if (!blocked) return null;
  }
  return { id: 'back_rank', squares: [king, ...flights], pieces: [pieceRef(map.get(king)!)] };
}

// ---------------------------------------------------------------------------------------------------------------
// Trapped pieces
// ---------------------------------------------------------------------------------------------------------------

/**
 * Trapped pieces of `color` (knight, bishop, rook or queen): the opponent can win the piece (`captureGain` > 0) and
 * every legal move of it (with `color` to move) lands where the opponent wins more than the move captured.
 * Not reported while `color` is in check. Squares: the piece, then its attackers.
 */
export function detectTrappedPieces(fen: Fen, color: Color): MotifInstance[] {
  const pos = withTurn(fen, color);
  if (!pos) return [];
  const game = load(pos);
  if (!game || game.status().isOver || game.status().inCheck) return [];
  const opp = otherColor(color);
  const out: MotifInstance[] = [];
  for (const p of pieceMap(pos).values()) {
    if (p.color !== color || p.type === 'k' || p.type === 'p') continue;
    const gain = captureGain(pos, p.square, opp);
    if (gain <= 0) continue;
    const escapes = game.legalMoves(p.square).some((m) => {
      const rec = game.move(m.uci);
      if (!rec) return false;
      const lost = captureGain(rec.fenAfter, rec.to, opp);
      game.undo();
      return lost <= (rec.captured ? pieceValue(rec.captured) : 0);
    });
    if (escapes) continue;
    out.push({ id: 'trapped_piece', squares: [p.square, ...attackersOf(pos, p.square, opp)], pieces: [pieceRef(p)], gain });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Material along a line
// ---------------------------------------------------------------------------------------------------------------

/**
 * Material change in pawns for `pov` along `line` (UCI from `fen`; the line stops at the first illegal move).
 * If the last move of the line is a capture, a pending recapture on that square is resolved by SEE, so a line that
 * ends in the middle of an exchange is not over-counted.
 */
export function materialSwing(fen: Fen, line: readonly Uci[], pov: Color): number {
  const game = load(fen);
  if (!game) return 0;
  const start = materialBalance(fen);
  let last: MoveRecord | null = null;
  for (const uci of line) {
    const rec = game.move(uci);
    if (!rec) break;
    last = rec;
  }
  const end = game.fen();
  let balance = materialBalance(end);
  if (last?.captured && !game.status().isOver) {
    const toMove = game.turn();
    const pending = captureGain(end, last.to, toMove);
    balance += toMove === 'w' ? pending : -pending;
  }
  const swing = balance - start;
  return pov === 'w' ? swing : -swing;
}

/**
 * Material loss of `pov` along `line` (≥ `threshold` pawns, default 2). Squares: where `pov`'s pieces were captured.
 * `gain` = pawns the opponent wins.
 */
export function detectMaterialLoss(fen: Fen, line: readonly Uci[], pov: Color, threshold = 2): MotifInstance | null {
  const swing = materialSwing(fen, line, pov);
  if (swing > -threshold) return null;
  const game = load(fen);
  const lost: MotifInstance['pieces'] = [];
  if (game) {
    for (const uci of line) {
      const rec = game.move(uci);
      if (!rec) break;
      if (rec.captured && rec.color !== pov) lost.push({ square: rec.to, piece: rec.captured, color: pov });
    }
  }
  return { id: 'material_loss', squares: lost.map((p) => p.square), pieces: lost, gain: -swing };
}

// ---------------------------------------------------------------------------------------------------------------
// Motifs created by a move
// ---------------------------------------------------------------------------------------------------------------

function motifKey(m: MotifInstance): string {
  return `${m.id}:${m.squares.join(',')}`;
}

/**
 * Motifs **created by** `move` for the side that plays it: checkmate, double check, fork by the moved piece,
 * discovered attacks, new pins and skewers against the opponent, promotion, capture of a hanging piece, newly
 * trapped enemy pieces and a mate-in-one threat. Returns `[]` for an illegal move.
 */
export function detectMotifs(fenBefore: Fen, move: Uci): MotifInstance[] {
  const game = load(fenBefore);
  const rec = game?.move(move);
  if (!rec) return [];
  const mover = rec.color;
  const opp = otherColor(mover);
  const fenAfter = rec.fenAfter;
  const out: MotifInstance[] = [];
  const map = pieceMap(fenAfter);
  const moved = map.get(rec.to);

  if (rec.isCheckmate) {
    const king = kingSquare(fenAfter, opp);
    out.push({ id: 'mate', squares: king ? [rec.from, rec.to, king] : [rec.from, rec.to], pieces: moved ? [pieceRef(moved)] : [] });
  }
  const double = detectDoubleCheck(fenAfter);
  if (double) out.push(double);
  const fork = detectFork(fenAfter, rec.to);
  if (fork) out.push(fork);
  out.push(...detectDiscoveredAttacks(fenBefore, move));

  const pinsBefore = new Set(detectPins(fenBefore, opp).map(motifKey));
  out.push(...detectPins(fenAfter, opp).filter((m) => !pinsBefore.has(motifKey(m))));
  const skewersBefore = new Set(detectSkewers(fenBefore, opp).map(motifKey));
  out.push(...detectSkewers(fenAfter, opp).filter((m) => !skewersBefore.has(motifKey(m))));

  if (rec.promotion) {
    out.push({ id: 'promotion', squares: [rec.from, rec.to], pieces: moved ? [pieceRef(moved)] : [] });
  }
  if (rec.captured && !rec.isEnPassant) {
    const gain = captureGain(fenBefore, rec.to, mover);
    if (gain > 0) {
      out.push({ id: 'hanging_piece', squares: [rec.to, rec.from], pieces: [{ square: rec.to, piece: rec.captured, color: opp }], gain });
    }
  }
  if (!rec.isCheckmate) {
    const trappedBefore = new Set(detectTrappedPieces(fenBefore, opp).map((m) => m.squares[0]));
    out.push(...detectTrappedPieces(fenAfter, opp).filter((m) => !trappedBefore.has(m.squares[0])));
    const threat = detectMateThreat(fenAfter, opp);
    if (threat) out.push(threat);
  }
  return out;
}
