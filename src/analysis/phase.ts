/**
 * Game phases per ply – a port of the Lichess "Divider" (scalachess `chess.Divider`, MIT, see `SOURCES.md`).
 *
 * The divider looks at the positions **before** every move (index i = position after i plies):
 * - middlegame starts at the first position with ≤ 10 minor/major pieces (both sides, kings and pawns excluded), or a
 *   sparse back rank (fewer than 4 White pieces on rank 1 or fewer than 4 Black pieces on rank 8), or a "mixedness"
 *   score > 150 (how much White and Black pieces are interlocked in 2×2 regions);
 * - endgame starts (only if a middlegame was found) at the first position with ≤ 6 minor/major pieces;
 * - the middlegame index is dropped when it is not before the endgame index.
 * A move (ply p, 1-based) is classified by the position it creates, as Lichess does for phase accuracy:
 * endgame if `end ≤ p`, middlegame if `middle ≤ p`, otherwise opening.
 */
import type { Color, Fen } from '@/core/chess';
import type { GamePhase } from '@/core/analysis';
import { boardPieces } from '@/lib/chess';

/** Result of `divideGame` – indices into the list of positions (= plies played before that position). */
export interface Division {
  /** First middlegame position, `null` if none (or if it coincides with the endgame start). */
  middle: number | null;
  /** First endgame position, `null` if none. */
  end: number | null;
  /** Number of positions examined (= number of moves). */
  plies: number;
}

type Grid = Array<Array<Color | null>>;

function grid(fen: Fen): { grid: Grid; majorsAndMinors: number } {
  const g: Grid = Array.from({ length: 8 }, () => Array<Color | null>(8).fill(null));
  let majorsAndMinors = 0;
  for (const p of boardPieces(fen)) {
    const file = p.square.charCodeAt(0) - 97;
    const rank = Number(p.square[1]) - 1;
    g[rank]![file] = p.color;
    if (p.type !== 'k' && p.type !== 'p') majorsAndMinors += 1;
  }
  return { grid: g, majorsAndMinors };
}

function backRankSparse(g: Grid): boolean {
  const white = g[0]!.filter((c) => c === 'w').length;
  const black = g[7]!.filter((c) => c === 'b').length;
  return white < 4 || black < 4;
}

/** Score of one 2×2 region with `white`/`black` pieces; `y` = 1-based rank of the region's lower edge. */
function regionScore(y: number, white: number, black: number): number {
  switch (white) {
    case 0:
      if (black === 1) return 1 + y;
      if (black === 2) return y < 6 ? 2 + (6 - y) : 0;
      if (black === 3 || black === 4) return y < 7 ? 3 + (7 - y) : 0;
      return 0;
    case 1:
      if (black === 0) return 1 + (8 - y);
      if (black === 1) return 5 + Math.abs(4 - y);
      if (black === 2) return 4 + (7 - y);
      if (black === 3) return 5 + (7 - y);
      return 0;
    case 2:
      if (black === 0) return y > 2 ? 2 + (y - 2) : 0;
      if (black === 1) return 4 + (y - 1);
      if (black === 2) return 7;
      return 0;
    case 3:
      if (black === 0) return y > 1 ? 3 + (y - 1) : 0;
      if (black === 1) return 5 + (y - 1);
      return 0;
    case 4:
      if (black === 0) return y > 1 ? 3 + (y - 1) : 0;
      return 0;
    default:
      return 0;
  }
}

/** Sum of `regionScore` over the 49 overlapping 2×2 regions of the board. */
function mixedness(g: Grid): number {
  let acc = 0;
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      let white = 0;
      let black = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const c = g[y + dy]![x + dx];
        if (c === 'w') white += 1;
        else if (c === 'b') black += 1;
      }
      acc += regionScore(y + 1, white, black);
    }
  }
  return acc;
}

/**
 * Splits a game into opening, middlegame and endgame (Lichess Divider).
 * @param positionsBeforeMoves The position before every move: index 0 = start position, index i = after i plies.
 */
export function divideGame(positionsBeforeMoves: readonly Fen[]): Division {
  let middle: number | null = null;
  let end: number | null = null;
  for (let i = 0; i < positionsBeforeMoves.length; i += 1) {
    const { grid: g, majorsAndMinors } = grid(positionsBeforeMoves[i]!);
    if (middle === null && (majorsAndMinors <= 10 || backRankSparse(g) || mixedness(g) > 150)) middle = i;
    if (middle !== null && majorsAndMinors <= 6) {
      end = i;
      break;
    }
  }
  return {
    middle: middle !== null && (end === null || middle < end) ? middle : null,
    end,
    plies: positionsBeforeMoves.length,
  };
}

/** Phase of the move with 1-based `ply` (the position it creates decides, see file header). */
export function gamePhase(ply: number, division: Division): GamePhase {
  if (division.end !== null && division.end <= ply) return 'endgame';
  if (division.middle !== null && division.middle <= ply) return 'middlegame';
  return 'opening';
}

/**
 * Phase of every ply of a game.
 * @param positions Positions of the game: index 0 = start, index i = after ply i (length = plies + 1).
 * @returns `phases[i]` = phase of ply i + 1.
 */
export function gamePhases(positions: readonly Fen[]): GamePhase[] {
  const division = divideGame(positions.slice(0, Math.max(0, positions.length - 1)));
  return positions.slice(1).map((_, i) => gamePhase(i + 1, division));
}
