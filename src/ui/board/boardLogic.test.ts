import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import {
  arrowPolygon,
  badgeBox,
  castlingByRook,
  CAPTURE_LAYER,
  describeMoveDe,
  DOT_LAYER,
  findMoveBetween,
  HINT_RINGS,
  moveCursor,
  shapeColorFromModifiers,
  squareGeometry,
  squareLabelDe,
  squareLayers,
  squareShade,
  toggleArrow,
  toggleMark,
} from './boardLogic';

function play(fen: string, ...moves: string[]) {
  const g = ChessGame.fromFen(fen);
  for (const m of moves) if (!g.move(m)) throw new Error(`illegal ${m}`);
  return g;
}

describe('geometry and cursor', () => {
  it('maps squares to screen columns/rows for both orientations', () => {
    expect(squareGeometry('a8', 'white')).toEqual({ col: 0, row: 0 });
    expect(squareGeometry('h1', 'white')).toEqual({ col: 7, row: 7 });
    expect(squareGeometry('h1', 'black')).toEqual({ col: 0, row: 0 });
    expect(squareGeometry('e4', 'black')).toEqual({ col: 3, row: 3 });
    expect(squareShade('a1')).toBe('dark');
    expect(squareShade('h1')).toBe('light');
  });

  it('moves the cursor in screen direction and clamps at the edges', () => {
    expect(moveCursor('e2', 'ArrowUp', 'white')).toBe('e3');
    expect(moveCursor('e2', 'ArrowUp', 'black')).toBe('e1');
    expect(moveCursor('e2', 'ArrowRight', 'white')).toBe('f2');
    expect(moveCursor('e2', 'ArrowRight', 'black')).toBe('d2');
    expect(moveCursor('a1', 'ArrowLeft', 'white')).toBe('a1');
    expect(moveCursor('a1', 'ArrowDown', 'white')).toBe('a1');
    expect(moveCursor('h8', 'ArrowDown', 'black')).toBe('h8');
  });
});

describe('user shapes', () => {
  it('picks the colour from the modifiers (Alt blue, Shift green, Ctrl yellow)', () => {
    expect(shapeColorFromModifiers({ altKey: false, shiftKey: false, ctrlKey: false })).toBe('default');
    expect(shapeColorFromModifiers({ altKey: false, shiftKey: true, ctrlKey: false })).toBe('green');
    expect(shapeColorFromModifiers({ altKey: true, shiftKey: true, ctrlKey: false })).toBe('blue');
    expect(shapeColorFromModifiers({ altKey: false, shiftKey: false, ctrlKey: true })).toBe('yellow');
  });

  it('toggles marks and arrows', () => {
    const m1 = toggleMark([], 'e4', 'default');
    expect(m1).toEqual([{ square: 'e4', color: 'default' }]);
    expect(toggleMark(m1, 'e4', 'green')).toEqual([]);
    const a1 = toggleArrow([], { from: 'e2', to: 'e4', color: 'default' });
    expect(toggleArrow(a1, { from: 'e2', to: 'e4', color: 'default' })).toEqual([]);
    expect(toggleArrow(a1, { from: 'e2', to: 'e4', color: 'green' })).toEqual([{ from: 'e2', to: 'e4', color: 'green' }]);
    expect(toggleArrow(a1, { from: 'g1', to: 'f3', color: 'default' })).toHaveLength(2);
  });
});

describe('castlingByRook', () => {
  const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  const g = ChessGame.fromFen(fen);
  const king = { type: 'k' as const, color: 'w' as const };
  const rook = { type: 'r' as const, color: 'w' as const };
  it('maps the king onto its own rook to the castling move', () => {
    expect(castlingByRook(g.legalMoves('e1'), 'e1', 'h1', king, rook)?.to).toBe('g1');
    expect(castlingByRook(g.legalMoves('e1'), 'e1', 'a1', king, rook)?.to).toBe('c1');
  });
  it('does nothing for other pieces or when castling is illegal', () => {
    expect(castlingByRook(g.legalMoves('e1'), 'e1', 'h8', king, { type: 'r', color: 'b' })).toBeNull();
    const noRights = ChessGame.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1');
    expect(castlingByRook(noRights.legalMoves('e1'), 'e1', 'h1', king, rook)).toBeNull();
    // Rook on f8 attacks f1: the king may not cross an attacked square (FIDE 3.8.2.2).
    const attacked = ChessGame.fromFen('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(castlingByRook(attacked.legalMoves('e1'), 'e1', 'h1', king, rook)).toBeNull();
    expect(castlingByRook(attacked.legalMoves('e1'), 'e1', 'a1', king, rook)?.to).toBe('c1');
  });
});

describe('squareLayers', () => {
  it('paints last move, check, marks, selection and dots with the DESIGN tokens', () => {
    const v = squareLayers({
      lastMove: { from: 'e2', to: 'e4' },
      checkSquare: 'e8',
      marks: [{ square: 'f3', kind: 'hint-piece' }, { square: 'd4', kind: 'danger' }],
      userMarks: [{ square: 'a1', color: 'green' }],
      feedback: { square: 'c3', result: 'correct' },
      selected: 'g1',
      targets: [
        { to: 'f3', isCapture: false },
        { to: 'h3', isCapture: true },
      ],
      showDots: true,
    });
    expect(v.get('e2')?.tokens).toEqual(['last-move']);
    expect(v.get('e2')?.backgroundImage).toContain('--zz-hl-lastmove');
    expect(v.get('e8')?.backgroundImage).toBe('var(--zz-hl-check)');
    expect(v.get('f3')?.tokens).toEqual(['hint-piece', 'move-target']);
    expect(v.get('f3')?.boxShadow).toBe(HINT_RINGS);
    // The dot is painted on top: it is the first CSS background layer.
    expect(v.get('f3')?.backgroundImage?.startsWith(DOT_LAYER)).toBe(true);
    expect(v.get('h3')?.backgroundImage).toBe(CAPTURE_LAYER);
    expect(v.get('d4')?.backgroundImage).toContain('--zz-hl-wrong');
    expect(v.get('a1')?.backgroundImage).toContain('--zz-mark-green');
    expect(v.get('c3')?.backgroundImage).toContain('--zz-hl-correct');
    expect(v.get('g1')?.backgroundImage).toContain('--zz-hl-selected');
  });

  it('hides dots when "Mögliche Züge anzeigen" is off', () => {
    const v = squareLayers({ selected: 'g1', targets: [{ to: 'f3', isCapture: false }], showDots: false });
    expect(v.has('f3')).toBe(false);
    expect(v.get('g1')?.tokens).toEqual(['selected']);
  });
});

describe('arrowPolygon and badgeBox', () => {
  it('starts at the square centre and ends 30 % of a square before the target centre', () => {
    const pts = arrowPolygon('e2', 'e4', 'white')!.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    expect(pts).toHaveLength(7);
    // e2 centre = (450, 650), e4 centre = (450, 450): tip at y = 450 + 30.
    expect(pts[3]).toEqual([450, 480]);
    // Shaft 16 units wide (16 % of a square).
    expect(Math.abs(pts[0]![0] - pts[6]![0])).toBeCloseTo(16);
    // Head 2.2 × shaft.
    expect(Math.abs(pts[2]![0] - pts[4]![0])).toBeCloseTo(35.2);
    expect(arrowPolygon('e2', 'e2', 'white')).toBeNull();
  });

  it('mirrors arrows for black orientation', () => {
    const tip = arrowPolygon('e2', 'e4', 'black')!.split(' ')[3];
    // e2 for black: col 3, row 1 → (350, 150); e4: (350, 350) → tip y = 320.
    expect(tip).toBe('350,320');
  });

  it('sizes badges 38 % of a square within 18–30 px and keeps them on the board', () => {
    expect(badgeBox('e4', 'white', 400).size).toBe(19);
    expect(badgeBox('e4', 'white', 960).size).toBe(30);
    expect(badgeBox('e4', 'white', 320).size).toBe(18);
    const corner = badgeBox('h8', 'white', 480);
    expect(corner.left + corner.size).toBeLessThanOrEqual(480);
    expect(corner.top).toBeGreaterThanOrEqual(0);
    const inner = badgeBox('e4', 'white', 480);
    // Top-right corner of e4 (col 4, row 4; square 60 px) overhung by 30 % of the badge.
    expect(inner.left).toBeCloseTo(300 + 0.3 * inner.size - inner.size, 0);
    expect(inner.top).toBeCloseTo(240 - 0.3 * inner.size, 0);
  });
});

describe('German texts', () => {
  it('labels squares for screen readers', () => {
    expect(squareLabelDe('e4', { type: 'p', color: 'w' })).toBe('e4, weißer Bauer');
    expect(squareLabelDe('d8', { type: 'q', color: 'b' })).toBe('d8, schwarze Dame');
    expect(squareLabelDe('d5', undefined)).toBe('d5, leer');
    expect(squareLabelDe('g1', { type: 'n', color: 'w' }, { selected: true })).toBe('g1, weißer Springer, ausgewählt');
    expect(squareLabelDe('f3', undefined, { target: true })).toBe('f3, leer, Zug möglich');
  });

  it('describes moves in words (DESIGN §7.5)', () => {
    const g = play(START_FEN, 'g1f3');
    expect(describeMoveDe(g.lastMove()!)).toBe('Weiß: Springer nach f3.');
    const check = play('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'h1h8');
    expect(describeMoveDe(check.lastMove()!)).toBe('Weiß: Turm nach h8. Schach.');
    const castle = play('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'e1g1');
    expect(describeMoveDe(castle.lastMove()!)).toBe('Weiß: kurze Rochade.');
    const ep = play('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'e5d6');
    expect(describeMoveDe(ep.lastMove()!)).toBe('Weiß: Bauer schlägt en passant auf d6.');
    const promo = play('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8n');
    expect(describeMoveDe(promo.lastMove()!)).toBe('Weiß: Bauer nach a8, Umwandlung in einen Springer.');
    const mate = play('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8');
    expect(describeMoveDe(mate.lastMove()!)).toBe('Weiß: Turm nach d8. Schachmatt.');
    const capture = play(START_FEN, 'e2e4', 'd7d5', 'e4d5');
    expect(describeMoveDe(capture.lastMove()!)).toBe('Weiß: Bauer schlägt auf d5.');
  });

  it('finds the single move between two positions', () => {
    const after = play(START_FEN, 'e2e4').fen();
    expect(findMoveBetween(START_FEN, after)?.uci).toBe('e2e4');
    const two = play(START_FEN, 'e2e4', 'e7e5').fen();
    expect(findMoveBetween(START_FEN, two)).toBeNull();
    expect(findMoveBetween(after, START_FEN)).toBeNull();
    expect(findMoveBetween('not a fen', after)).toBeNull();
    const promo = play('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8r').fen();
    expect(findMoveBetween('8/P6k/8/8/8/8/8/K7 w - - 0 1', promo)?.promotion).toBe('r');
  });
});

