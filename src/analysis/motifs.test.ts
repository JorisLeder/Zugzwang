import { describe, expect, it } from 'vitest';
import { validateFen } from '@/lib/chess';
import {
  detectBackRankWeakness,
  detectDiscoveredAttacks,
  detectDoubleCheck,
  detectFork,
  detectHangingPieces,
  detectMateThreat,
  detectMaterialLoss,
  detectMotifs,
  detectPins,
  detectSkewers,
  detectTrappedPieces,
  materialSwing,
} from './motifs';

/** Every position used here must be a legal position (CONVENTIONS §5, `validateFen`). */
function legal(fen: string): string {
  const v = validateFen(fen);
  if (!v.ok) throw new Error(`invalid test FEN ${fen}: ${v.errorDe}`);
  return fen;
}

describe('detectHangingPieces (attacked, SEE < 0 for the owner)', () => {
  it('undefended knight attacked by a pawn', () => {
    const m = detectHangingPieces(legal('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'b');
    expect(m).toEqual([expect.objectContaining({ id: 'hanging_piece', squares: ['d5', 'e4'], gain: 3 })]);
  });
  it('undefended rook attacked by a bishop', () => {
    const m = detectHangingPieces(legal('4k3/8/8/8/8/2r5/8/B3K3 w - - 0 1'), 'b');
    expect(m).toEqual([expect.objectContaining({ squares: ['c3', 'a1'], gain: 5 })]);
  });
  it('defended queen attacked by a knight (wins 9 − 3)', () => {
    const m = detectHangingPieces(legal('4k3/8/4p3/3q4/8/2N5/8/4K3 w - - 0 1'), 'b');
    expect(m).toEqual([expect.objectContaining({ squares: ['d5', 'c3'], gain: 6, pieces: [{ square: 'd5', piece: 'q', color: 'b' }] })]);
  });
  it('negative: defended knight attacked by a knight (even trade)', () => {
    expect(detectHangingPieces(legal('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1'), 'b')).toEqual([]);
  });
  it('negative: the only attacker is pinned to its king', () => {
    expect(detectHangingPieces(legal('4k3/8/8/8/1b6/5r2/3N4/4K3 w - - 0 1'), 'b')).toEqual([]);
  });
});

describe('detectFork', () => {
  it('knight forks king and queen', () => {
    expect(detectFork(legal('2q3k1/4N3/8/8/8/8/8/4K3 b - - 0 1'), 'e7')).toMatchObject({ id: 'fork', squares: ['e7', 'c8', 'g8'] });
  });
  it('protected pawn forks knight and bishop', () => {
    expect(detectFork(legal('4k3/8/2n1b3/3P4/4P3/8/8/4K3 b - - 0 1'), 'd5')).toMatchObject({ squares: ['d5', 'c6', 'e6'] });
  });
  it('queen forks king and an undefended rook', () => {
    expect(detectFork(legal('8/r5k1/8/8/3Q4/8/8/4K3 b - - 0 1'), 'd4')).toMatchObject({ squares: ['d4', 'a7', 'g7'] });
  });
  it('negative: the forking knight can be taken for free', () => {
    expect(detectFork(legal('2q1r1k1/4N3/8/8/8/8/8/4K3 b - - 0 1'), 'e7')).toBeNull();
  });
  it('negative: attacking two pawns is no fork', () => {
    expect(detectFork(legal('4k3/8/8/2p1p3/8/3N4/8/4K3 b - - 0 1'), 'd3')).toBeNull();
  });
});

describe('detectPins (absolute and relative)', () => {
  it('absolute: Bb5 pins Nc6 to the king (Ruy Lopez after …d6)', () => {
    expect(detectPins(legal('r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4'), 'b')).toEqual([
      expect.objectContaining({ id: 'pin', squares: ['b5', 'c6', 'e8'] }),
    ]);
  });
  it('relative: Bg5 pins Nf6 to the queen', () => {
    expect(detectPins(legal('3qk3/8/5n2/6B1/8/8/8/4K3 b - - 0 1'), 'b')).toEqual([
      expect.objectContaining({ squares: ['g5', 'f6', 'd8'] }),
    ]);
  });
  it('absolute: rook pins a bishop on the e-file', () => {
    expect(detectPins(legal('4k3/4b3/8/8/8/8/8/4RK2 b - - 0 1'), 'b')).toEqual([
      expect.objectContaining({ squares: ['e1', 'e7', 'e8'] }),
    ]);
  });
  it('negative: a pawn shields the king', () => {
    expect(detectPins(legal('4k3/3p4/2n5/1B6/8/8/8/4K3 b - - 0 1'), 'b')).toEqual([]);
  });
  it('negative: the piece behind is worth less (that is a skewer)', () => {
    expect(detectPins(legal('n7/8/8/q3k3/8/8/8/R6K b - - 0 1'), 'b')).toEqual([]);
  });
});

describe('detectSkewers', () => {
  it('rook skewers king and queen', () => {
    expect(detectSkewers(legal('q7/8/8/k7/8/8/8/R3K3 b - - 0 1'), 'b')).toEqual([
      expect.objectContaining({ id: 'skewer', squares: ['a1', 'a5', 'a8'], gain: 9 }),
    ]);
  });
  it('protected bishop skewers queen and rook', () => {
    expect(detectSkewers(legal('8/1r6/8/3q4/8/5B2/6P1/K3k3 b - - 0 1'), 'b')).toEqual([
      expect.objectContaining({ squares: ['f3', 'd5', 'b7'], gain: 5 }),
    ]);
  });
  it('rook skewers king and rook along the rank', () => {
    expect(detectSkewers(legal('8/R1k3r1/8/8/8/8/8/4K3 b - - 0 1'), 'b')).toEqual([
      expect.objectContaining({ squares: ['a7', 'c7', 'g7'] }),
    ]);
  });
  it('negative: the skewering rook can be taken for free', () => {
    expect(detectSkewers(legal('n7/8/8/q3k3/8/8/8/R6K b - - 0 1'), 'b')).toEqual([]);
  });
  it('negative: a relative pin is no skewer', () => {
    expect(detectSkewers(legal('3qk3/8/5n2/6B1/8/8/8/4K3 b - - 0 1'), 'b')).toEqual([]);
  });
});

describe('detectDiscoveredAttacks', () => {
  it('discovered check: the knight leaves the e-file', () => {
    expect(detectDiscoveredAttacks(legal('4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1'), 'e4c5')).toEqual([
      expect.objectContaining({ id: 'discovered_attack', squares: ['e1', 'e8', 'e4'] }),
    ]);
  });
  it('discovered attack on the queen by the bishop', () => {
    expect(detectDiscoveredAttacks(legal('4k3/8/5q2/8/3N4/8/1B6/4K3 w - - 0 1'), 'd4b5')).toEqual([
      expect.objectContaining({ squares: ['b2', 'f6', 'd4'] }),
    ]);
  });
  it('pawn move opens the bishop against a rook', () => {
    expect(detectDiscoveredAttacks(legal('4k3/8/7r/8/8/8/3P4/2B1K3 w - - 0 1'), 'd2d3')).toEqual([
      expect.objectContaining({ squares: ['c1', 'h6', 'd2'] }),
    ]);
  });
  it('negative: a king move that opens nothing', () => {
    expect(detectDiscoveredAttacks(legal('4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1'), 'f1g2')).toEqual([]);
  });
  it('negative: illegal move', () => {
    expect(detectDiscoveredAttacks(legal('4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1'), 'e4e5')).toEqual([]);
  });
});

describe('detectDoubleCheck', () => {
  it('knight and rook', () => {
    expect(detectDoubleCheck(legal('4k3/8/5N2/8/8/8/8/4RK2 b - - 0 1'))).toMatchObject({ id: 'double_check', squares: ['e8', 'f6', 'e1'] });
  });
  it('bishop and rook', () => {
    expect(detectDoubleCheck(legal('4k3/8/8/1B6/8/8/8/4RK2 b - - 0 1'))?.squares).toEqual(['e8', 'b5', 'e1']);
  });
  it('knight and bishop', () => {
    expect(detectDoubleCheck(legal('4k3/8/3N4/1B6/8/8/8/K7 b - - 0 1'))?.squares).toEqual(['e8', 'd6', 'b5']);
  });
  it('negative: single check', () => {
    expect(detectDoubleCheck(legal('4k3/8/8/8/8/8/8/4RK2 b - - 0 1'))).toBeNull();
  });
});

describe('detectMateThreat', () => {
  it('back-rank mate in one (null move for the side to move)', () => {
    expect(detectMateThreat(legal('6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1'), 'b')).toMatchObject({ id: 'mate_threat', squares: ['a1', 'a8'] });
  });
  it("Scholar's mate threat Qxf7#", () => {
    expect(
      detectMateThreat(legal('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3'), 'b'),
    ).toMatchObject({ squares: ['h5', 'f7'] });
  });
  it('mate in two from an engine mate score (smothered mate)', () => {
    const fen = legal('5r1k/6pp/7N/3Q4/8/8/1q4PP/7K w - - 0 2');
    const line = { multipv: 1, depth: 18, score: { type: 'mate' as const, value: 2 }, pv: ['d5g8', 'f8g8', 'h6f7'] };
    expect(detectMateThreat(fen, 'b')).toBeNull(); // no mate in one
    expect(detectMateThreat(fen, 'b', line)).toMatchObject({ squares: ['d5', 'g8'] });
  });
  it('negative: start position, and a centipawn engine score', () => {
    const start = legal('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(detectMateThreat(start, 'b')).toBeNull();
    expect(detectMateThreat(start, 'b', { multipv: 1, depth: 10, score: { type: 'cp', value: 30 }, pv: ['e2e4'] })).toBeNull();
  });
});

describe('detectBackRankWeakness', () => {
  it('king behind three unmoved pawns, enemy rook', () => {
    expect(detectBackRankWeakness(legal('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), 'b')).toMatchObject({
      id: 'back_rank',
      squares: ['g8', 'f7', 'g7', 'h7'],
    });
  });
  it('white king, black rook', () => {
    expect(detectBackRankWeakness(legal('r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1'), 'w')?.squares).toEqual(['g1', 'f2', 'g2', 'h2']);
  });
  it('the luft square is covered by an enemy bishop', () => {
    expect(detectBackRankWeakness(legal('6k1/5pp1/7p/8/8/3B4/8/R5K1 b - - 0 1'), 'b')).not.toBeNull();
  });
  it('negative: free luft square h7', () => {
    expect(detectBackRankWeakness(legal('6k1/5pp1/7p/8/8/8/8/R5K1 b - - 0 1'), 'b')).toBeNull();
  });
  it('negative: no enemy rook or queen', () => {
    expect(detectBackRankWeakness(legal('6k1/5ppp/8/8/8/8/8/B5K1 w - - 0 1'), 'b')).toBeNull();
  });
});

describe('detectTrappedPieces', () => {
  it('bishop on a7 trapped by b6/c7', () => {
    expect(detectTrappedPieces(legal('8/Bkp5/1p6/8/8/8/8/4K3 w - - 0 1'), 'w')).toEqual([
      expect.objectContaining({ id: 'trapped_piece', squares: ['a7', 'b7'], gain: 3 }),
    ]);
  });
  it('knight in the corner attacked by the king', () => {
    expect(detectTrappedPieces(legal('7N/p5k1/8/8/8/8/P7/4K3 w - - 0 1'), 'w')).toEqual([
      expect.objectContaining({ squares: ['h8', 'g7'] }),
    ]);
  });
  it('knight on a1 (null move: White to move in the FEN)', () => {
    expect(detectTrappedPieces(legal('4k3/8/8/8/3B4/1P6/2P5/n2K4 b - - 0 1'), 'b')).toEqual([
      expect.objectContaining({ squares: ['a1', 'd4'] }),
    ]);
    expect(detectTrappedPieces(legal('4k3/8/8/8/3B4/1P6/2P5/n2K4 w - - 0 1'), 'b')).toHaveLength(1);
  });
  it('negative: attacked knight can escape', () => {
    expect(detectTrappedPieces(legal('4k3/8/8/3n4/4P3/8/8/4K3 b - - 0 1'), 'b')).toEqual([]);
  });
  it('negative: cornered knight that is not attacked', () => {
    expect(detectTrappedPieces(legal('7N/p3k3/8/8/8/8/P7/4K3 w - - 0 1'), 'w')).toEqual([]);
  });
});

describe('materialSwing / detectMaterialLoss (along an engine line)', () => {
  it('pawn wins a knight', () => {
    expect(detectMaterialLoss(legal('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), ['e4d5'], 'b')).toMatchObject({
      id: 'material_loss',
      squares: ['d5'],
      gain: 3,
    });
  });
  it('queen blunder Qh4?? Nxh4', () => {
    const fen = legal('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
    expect(detectMaterialLoss(fen, ['d8h4', 'f3h4'], 'b')).toMatchObject({ gain: 9, squares: ['h4'] });
    expect(materialSwing(fen, ['d8h4', 'f3h4'], 'w')).toBe(9);
  });
  it('knight fork wins the queen', () => {
    expect(detectMaterialLoss(legal('2q3k1/8/8/3N4/8/8/8/4K3 w - - 0 1'), ['d5e7', 'g8f7', 'e7c8'], 'b')).toMatchObject({ gain: 9 });
  });
  it('negative: a line ending in the middle of an even trade (pending recapture resolved by SEE)', () => {
    const fen = legal('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1');
    expect(materialSwing(fen, ['c3d5'], 'w')).toBe(0);
    expect(materialSwing(fen, ['c3d5', 'e6d5'], 'w')).toBe(0);
    expect(detectMaterialLoss(fen, ['c3d5'], 'b')).toBeNull();
  });
  it('stops at the first illegal move', () => {
    expect(materialSwing(legal('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), ['e4e5', 'e4d5'], 'w')).toBe(0);
  });
});

describe('detectMotifs (motifs created by a move)', () => {
  it('a knight fork that gives check', () => {
    const ids = detectMotifs(legal('2q3k1/8/8/3N4/8/8/8/4K3 w - - 0 1'), 'd5e7').map((m) => m.id);
    expect(ids).toContain('fork');
  });
  it('a back-rank mate', () => {
    const m = detectMotifs(legal('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), 'a1a8');
    expect(m[0]).toMatchObject({ id: 'mate', squares: ['a1', 'a8', 'g8'] });
  });
  it('a discovered double check', () => {
    const ids = detectMotifs(legal('4k3/8/8/8/4N3/8/8/4RK2 w - - 0 1'), 'e4f6').map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['double_check', 'discovered_attack']));
  });
  it('capturing a hanging piece and creating a pin', () => {
    expect(detectMotifs(legal('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'e4d5').map((m) => m.id)).toContain('hanging_piece');
    expect(detectMotifs(legal('r1bqkbnr/ppp2ppp/2np4/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 4'), 'f1b5').map((m) => m.id)).toContain('pin');
  });
  it('negative: a quiet developing move', () => {
    expect(detectMotifs(legal('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), 'g1f3')).toEqual([]);
  });
});
