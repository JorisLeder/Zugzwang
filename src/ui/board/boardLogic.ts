/**
 * Pure helpers of the board: square geometry per orientation, keyboard cursor, square layers (highlights, marks,
 * legal-move dots), arrow and badge geometry, German screen-reader texts. No chess rules here – legality comes from
 * `@/lib/chess`.
 */
import type { Color, MoveRecord, PieceSymbol, Square, SquareMark } from '@/core/chess';
import { boardPieces, ChessGame, positionKey, type LegalMove } from '@/lib/chess';
import { BOARD_DE } from './strings.de';

/** Board orientation (side at the bottom). */
export type Orientation = 'white' | 'black';

/** Colours of user marks/arrows drawn with the right mouse button (DESIGN §2.2: plain, Shift, Alt, Ctrl/Strg). */
export type UserShapeColor = 'default' | 'green' | 'blue' | 'yellow';

/** A right-click square mark. */
export interface UserMark {
  square: Square;
  color: UserShapeColor;
}

/** A right-drag arrow. */
export interface UserArrow {
  from: Square;
  to: Square;
  color: UserShapeColor;
}

const FILES = 'abcdefgh';

/** File index 0–7 (a–h). */
export function fileIndex(square: Square): number {
  return FILES.indexOf(square[0]!);
}

/** Rank 1–8. */
export function rankOf(square: Square): number {
  return Number(square[1]);
}

/** Square from file index 0–7 and rank 1–8. */
export function toSquare(file: number, rank: number): Square {
  return `${FILES[file]}${rank}` as Square;
}

/** Column and row (0–7, from the top-left corner as seen by the user) of a square. */
export function squareGeometry(square: Square, orientation: Orientation): { col: number; row: number } {
  const f = fileIndex(square);
  const r = rankOf(square);
  return orientation === 'white' ? { col: f, row: 8 - r } : { col: 7 - f, row: r - 1 };
}

/** Light or dark square. */
export function squareShade(square: Square): 'light' | 'dark' {
  return (fileIndex(square) + rankOf(square)) % 2 === 1 ? 'dark' : 'light';
}

/** Keys that move the keyboard cursor. */
export type CursorKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** Moves the keyboard cursor one square in screen direction (orientation-aware), clamped to the board. */
export function moveCursor(square: Square, key: CursorKey, orientation: Orientation): Square {
  const { col, row } = squareGeometry(square, orientation);
  const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  const c = Math.max(0, Math.min(7, col + dc));
  const r = Math.max(0, Math.min(7, row + dr));
  return orientation === 'white' ? toSquare(c, 8 - r) : toSquare(7 - c, r + 1);
}

/** Colour of user shapes from the modifier keys (Alt > Shift > Ctrl, as react-chessboard does). */
export function shapeColorFromModifiers(e: { altKey: boolean; shiftKey: boolean; ctrlKey: boolean }): UserShapeColor {
  if (e.altKey) return 'blue';
  if (e.shiftKey) return 'green';
  if (e.ctrlKey) return 'yellow';
  return 'default';
}

/** Toggles a right-click mark: a marked square loses its mark (any colour, DESIGN §4.4), else it gets one. */
export function toggleMark(marks: readonly UserMark[], square: Square, color: UserShapeColor): UserMark[] {
  return marks.some((m) => m.square === square) ? marks.filter((m) => m.square !== square) : [...marks, { square, color }];
}

/** Toggles a right-drag arrow: the same from/to removes it, otherwise it is added (replacing another colour). */
export function toggleArrow(arrows: readonly UserArrow[], arrow: UserArrow): UserArrow[] {
  const same = arrows.find((a) => a.from === arrow.from && a.to === arrow.to);
  if (same && same.color === arrow.color) return arrows.filter((a) => a !== same);
  return [...arrows.filter((a) => a !== same), arrow];
}

/**
 * Castling by dropping/clicking the king on its own rook (react-chessboard allows it cleanly because we map it before
 * any position change): returns the legal castling move towards that rook, or `null`.
 */
export function castlingByRook(
  movesFromKing: readonly LegalMove[],
  from: Square,
  to: Square,
  pieceFrom: { type: PieceSymbol; color: Color } | undefined,
  pieceTo: { type: PieceSymbol; color: Color } | undefined,
): LegalMove | null {
  if (pieceFrom?.type !== 'k' || pieceTo?.type !== 'r' || pieceTo.color !== pieceFrom.color) return null;
  if (rankOf(from) !== rankOf(to)) return null;
  const targetFile = fileIndex(to) > fileIndex(from) ? 'g' : 'c';
  return movesFromKing.find((m) => m.isCastle && m.to[0] === targetFile) ?? null;
}

// ---- Square layers -------------------------------------------------------------------------------------------

const layer = (color: string) => `linear-gradient(${color}, ${color})`;

/** Legal-move dot: diameter 26 % of the square, 2 px ring (DESIGN §4.3). */
export const DOT_LAYER =
  'radial-gradient(circle closest-side, var(--zz-dot-core) 0 26%, var(--zz-dot-ring) 26% calc(26% + 2px), transparent calc(26% + 2px))';
/** Capture target: ring touching the edge, 9 % of the square thick, 1.5 px light line inside (DESIGN §4.3). */
export const CAPTURE_LAYER =
  'radial-gradient(circle closest-side, transparent 0 calc(82% - 1.5px), var(--zz-dot-ring) calc(82% - 1.5px) 82%, var(--zz-dot-core) 82% 100%, transparent 100%)';
/** Hint rings (stage 1 piece / stage 2 target, DESIGN §4.4). */
export const HINT_RINGS = 'inset 0 0 0 4px var(--zz-hint-ring-dark), inset 0 0 0 6px var(--zz-hint-ring-light)';

/** CSS variable per user-shape colour for marks (plain right click = red). */
export const USER_MARK_VARS: Record<UserShapeColor, string> = {
  default: '--zz-mark-red',
  green: '--zz-mark-green',
  blue: '--zz-mark-blue',
  yellow: '--zz-mark-yellow',
};

/** CSS variable per user-shape colour for arrows (plain right drag = orange). */
export const USER_ARROW_VARS: Record<UserShapeColor, string> = {
  default: '--zz-arrow-user',
  green: '--zz-mark-green',
  blue: '--zz-mark-blue',
  yellow: '--zz-mark-yellow',
};

const MARK_LAYERS: Record<SquareMark['kind'], string> = {
  user: layer('var(--zz-mark-red)'),
  'hint-piece': layer('var(--zz-hl-hint-fill)'),
  'hint-target': layer('var(--zz-hl-hint-fill)'),
  danger: layer('var(--zz-hl-wrong)'),
  selected: layer('var(--zz-hl-selected)'),
  'last-move': layer('var(--zz-hl-lastmove)'),
  check: 'var(--zz-hl-check)',
};

/** Feedback after a puzzle/lesson move (DESIGN §4.4). */
export interface BoardFeedback {
  square: Square;
  result: 'correct' | 'wrong';
}

/** Inputs of `squareLayers`. */
export interface SquareLayerInput {
  lastMove?: { from: Square; to: Square } | null;
  /** King in check (already filtered by `highlightCheck`). */
  checkSquare?: Square | null;
  marks?: readonly SquareMark[];
  userMarks?: readonly UserMark[];
  feedback?: BoardFeedback | null;
  selected?: Square | null;
  /** Legal targets of the selected piece (shown only when `showDots`). */
  targets?: ReadonlyArray<{ to: Square; isCapture: boolean }>;
  showDots?: boolean;
}

/** Visual state of one square: `tokens` (for tests and `data-highlights`), CSS background layers and box shadow. */
export interface SquareVisual {
  tokens: string[];
  backgroundImage?: string;
  boxShadow?: string;
}

/**
 * Builds the layers of every highlighted square. Painting order (bottom → top): last move, check, programmatic marks,
 * feedback, user marks, selection, legal-move dots/capture rings. Hint marks add the inset rings.
 */
export function squareLayers(input: SquareLayerInput): Map<Square, SquareVisual> {
  const acc = new Map<Square, { tokens: string[]; layers: string[]; rings: boolean }>();
  const add = (sq: Square, token: string, value?: string) => {
    const entry = acc.get(sq) ?? { tokens: [], layers: [], rings: false };
    entry.tokens.push(token);
    if (value) entry.layers.push(value);
    acc.set(sq, entry);
  };
  if (input.lastMove) {
    add(input.lastMove.from, 'last-move', MARK_LAYERS['last-move']);
    add(input.lastMove.to, 'last-move', MARK_LAYERS['last-move']);
  }
  if (input.checkSquare) add(input.checkSquare, 'check', MARK_LAYERS.check);
  for (const m of input.marks ?? []) {
    add(m.square, m.kind === 'user' ? 'mark' : m.kind, MARK_LAYERS[m.kind]);
    if (m.kind === 'hint-piece' || m.kind === 'hint-target') acc.get(m.square)!.rings = true;
  }
  if (input.feedback) {
    add(input.feedback.square, input.feedback.result, layer(`var(${input.feedback.result === 'correct' ? '--zz-hl-correct' : '--zz-hl-wrong'})`));
  }
  for (const m of input.userMarks ?? []) add(m.square, `user-mark-${m.color}`, layer(`var(${USER_MARK_VARS[m.color]})`));
  if (input.selected) add(input.selected, 'selected', MARK_LAYERS.selected);
  if (input.showDots) for (const t of input.targets ?? []) add(t.to, t.isCapture ? 'capture-target' : 'move-target', t.isCapture ? CAPTURE_LAYER : DOT_LAYER);

  const out = new Map<Square, SquareVisual>();
  for (const [sq, e] of acc) {
    const visual: SquareVisual = { tokens: e.tokens };
    // CSS paints the first background layer on top.
    if (e.layers.length) visual.backgroundImage = [...e.layers].reverse().join(', ');
    if (e.rings) visual.boxShadow = HINT_RINGS;
    out.set(sq, visual);
  }
  return out;
}

// ---- Arrows and badges ---------------------------------------------------------------------------------------

/** Arrow geometry in a 0–800 view box (one square = 100): shaft 16 % of a square, head 2.2 × shaft (DESIGN §2.2). */
export const ARROW_VIEWBOX = 800;
const SHAFT = 16;
const HEAD_WIDTH = 2.2 * SHAFT;
const HEAD_LENGTH = 0.8 * HEAD_WIDTH;
/** The tip ends 30 % of a square before the target centre. */
const END_GAP = 30;

/**
 * Polygon points of an arrow from the centre of `from` towards `to` (straight, also for knight moves), ending 30 % of a
 * square before the target centre. Returns `null` for `from === to`.
 */
export function arrowPolygon(from: Square, to: Square, orientation: Orientation): string | null {
  if (from === to) return null;
  const a = squareGeometry(from, orientation);
  const b = squareGeometry(to, orientation);
  const x1 = a.col * 100 + 50;
  const y1 = a.row * 100 + 50;
  const dx = b.col * 100 + 50 - x1;
  const dy = b.row * 100 + 50 - y1;
  const len = Math.hypot(dx, dy);
  const tip = Math.max(HEAD_LENGTH, len - END_GAP);
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular unit vector.
  const px = -uy;
  const py = ux;
  const neck = tip - HEAD_LENGTH;
  const pt = (along: number, side: number) =>
    `${round(x1 + ux * along + px * side)},${round(y1 + uy * along + py * side)}`;
  return [
    pt(0, SHAFT / 2),
    pt(neck, SHAFT / 2),
    pt(neck, HEAD_WIDTH / 2),
    pt(tip, 0),
    pt(neck, -HEAD_WIDTH / 2),
    pt(neck, -SHAFT / 2),
    pt(0, -SHAFT / 2),
  ].join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Classification badge box in px (DESIGN §4.5): diameter 38 % of the square (18–30 px), at the top-right corner of the
 * square, overhanging the corner by 30 % of its size, clamped inside the board.
 */
export function badgeBox(square: Square, orientation: Orientation, boardPx: number): { left: number; top: number; size: number } {
  const sq = boardPx / 8;
  const size = Math.round(Math.max(18, Math.min(30, sq * 0.38)));
  const { col, row } = squareGeometry(square, orientation);
  const right = (col + 1) * sq + 0.3 * size;
  const top = row * sq - 0.3 * size;
  const left = Math.min(boardPx - size, right - size);
  return { left: Math.max(0, left), top: Math.max(0, Math.min(boardPx - size, top)), size };
}

// ---- German texts ----------------------------------------------------------------------------------------------

/** "e4, weißer Bauer" / "d5, leer" (+ ", ausgewählt" / ", Zug möglich"). */
export function squareLabelDe(
  square: Square,
  piece: { type: PieceSymbol; color: Color } | undefined,
  state: { selected?: boolean; target?: boolean } = {},
): string {
  const parts = [square, piece ? BOARD_DE.pieceWithColor(piece.type, piece.color) : BOARD_DE.empty];
  if (state.selected) parts.push(BOARD_DE.selected);
  if (state.target) parts.push(BOARD_DE.target);
  return parts.join(', ');
}

/** Screen-reader sentence for a move: "Weiß: Springer nach f3. Schach." (DESIGN §7.5). */
export function describeMoveDe(move: MoveRecord): string {
  return BOARD_DE.moveSentence(move);
}

/**
 * The single legal move that leads from `before` to `after` (same position key), or `null` (navigation jumps,
 * new positions, invalid FENs). Used to announce opponent and user moves.
 */
export function findMoveBetween(before: string, after: string): MoveRecord | null {
  let game: ChessGame;
  try {
    game = ChessGame.fromFen(before);
  } catch {
    return null;
  }
  const target = positionKey(after);
  // Cheap pre-filters: the side to move must have changed, and the moving piece must have left its square.
  if (positionKey(before).split(' ')[1] === target.split(' ')[1]) return null;
  const placement = (fen: string) => new Map(boardPieces(fen).map((p) => [p.square, `${p.color}${p.type}`]));
  const was = placement(before);
  const now = placement(after);
  const candidates = game.legalMoves().filter((m) => was.get(m.from) !== now.get(m.from));
  for (const m of candidates) {
    const probe = ChessGame.fromFen(before);
    const record = probe.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
    if (record && positionKey(record.fenAfter) === target) return record;
  }
  return null;
}
