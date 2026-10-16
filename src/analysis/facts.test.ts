import { describe, expect, it } from 'vitest';
import { uciLineToSan, validateFen } from '@/lib/chess';
import { buildFacts, MAX_LINE_PLIES } from './facts';

function legal(fen: string): string {
  const v = validateFen(fen);
  if (!v.ok) throw new Error(`invalid test FEN ${fen}: ${v.errorDe}`);
  return fen;
}

const QH4 = legal('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');

describe('buildFacts – mistake / coach warning', () => {
  it('hanging queen: SAN from the engine lines only, hanging_piece + material_loss', () => {
    const f = buildFacts('coach_warning', {
      fenBefore: QH4,
      playedMove: 'd8h4',
      bestLine: ['b8c6', 'f1b5'],
      bestScore: { type: 'cp', value: 30 },
      refutation: ['f3h4', 'g8f6'],
      refutationScore: { type: 'cp', value: 900 },
      expectedPointsLoss: 0.45,
    });
    expect(f).toMatchObject({
      kind: 'coach_warning',
      mover: 'b',
      fenBefore: QH4,
      playedMove: { uci: 'd8h4', san: 'Qh4' },
      bestMove: { uci: 'b8c6', san: 'Nc6' },
      bestLine: ['Nc6', 'Bb5'],
      refutation: ['Nxh4', 'Nf6'],
      materialSwing: -9,
      expectedPointsLoss: 0.45,
    });
    const ids = f.motifs.map((m) => m.id);
    expect(ids).toContain('hanging_piece');
    expect(ids).toContain('material_loss');
    expect(f.motifs.find((m) => m.id === 'hanging_piece')).toMatchObject({ squares: ['h4', 'f3'], gain: 9 });
  });

  it('cuts lines at the first illegal move and at MAX_LINE_PLIES', () => {
    const f = buildFacts('mistake', {
      fenBefore: QH4,
      playedMove: 'd8h4',
      bestLine: ['b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'e4d6', 'b5c6', 'd7c6', 'd4e5'],
      refutation: ['f3h4', 'a1a8'],
    });
    expect(f.bestLine).toHaveLength(MAX_LINE_PLIES);
    expect(f.bestLine).toEqual(uciLineToSan(QH4, ['b8c6', 'f1b5', 'g8f6', 'e1g1', 'f6e4', 'd2d4', 'e4d6', 'b5c6']));
    expect(f.refutation).toEqual(['Nxh4']);
  });

  it('a move that allows a back-rank mate: mateIn < 0, mate + back_rank motifs', () => {
    const f = buildFacts('mistake', {
      fenBefore: legal('3r2k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1'),
      playedMove: 'c1c7',
      bestLine: ['h2h3'],
      bestScore: { type: 'cp', value: 0 },
      refutation: ['d8d1'],
      refutationScore: { type: 'mate', value: -1 },
    });
    expect(f.mateIn).toBe(-1);
    expect(f.refutation).toEqual(['Rd1#']);
    expect(f.motifs.map((m) => m.id)).toEqual(expect.arrayContaining(['mate', 'back_rank']));
  });

  it('missing a free queen: missed_win with the material gain', () => {
    const f = buildFacts('mistake', {
      fenBefore: legal('4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1'),
      playedMove: 'e1e2',
      bestLine: ['c3d5'],
      bestScore: { type: 'cp', value: 900 },
      refutation: ['d5d4'],
      refutationScore: { type: 'cp', value: -900 },
    });
    expect(f.bestMove).toEqual({ uci: 'c3d5', san: 'Nxd5' });
    expect(f.motifs.find((m) => m.id === 'missed_win')).toMatchObject({ squares: ['c3', 'd5'], gain: 9 });
  });

  it('an illegal played move yields facts without moves', () => {
    const f = buildFacts('mistake', { fenBefore: QH4, playedMove: 'e1e2', refutation: ['f3h4'] });
    expect(f.playedMove).toBeUndefined();
    expect(f.refutation).toEqual([]);
  });
});

describe('buildFacts – threat, praise, puzzle', () => {
  it('threat: line from the null-move position, mover = threatened side', () => {
    const fen = legal('6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1');
    const f = buildFacts('threat', { fenBefore: fen, refutation: ['a1a8'], refutationScore: { type: 'mate', value: 1 } });
    expect(f).toMatchObject({ kind: 'threat', mover: 'b', refutation: ['Ra8#'], mateIn: -1 });
    expect(f.motifs.map((m) => m.id)).toEqual(expect.arrayContaining(['mate', 'back_rank']));
  });

  it('praise: a knight fork', () => {
    const f = buildFacts('praise', {
      fenBefore: legal('2q3k1/8/8/3N4/8/8/8/4K3 w - - 0 1'),
      playedMove: 'd5e7',
      bestLine: ['d5e7', 'g8f7', 'e7c8'],
      refutation: ['g8f7', 'e7c8'],
    });
    expect(f.playedMove?.san).toBe('Ne7+');
    expect(f.refutation).toEqual(['Kf7', 'Nxc8']);
    expect(f.materialSwing).toBe(9);
    expect(f.motifs.map((m) => m.id)).toContain('fork');
  });

  it('puzzle: motifs along the solution and themes', () => {
    const f = buildFacts('puzzle', {
      // FIXTURE_PUZZLES "knight fork" after the opponent's first move 1…Qc6.
      fenBefore: legal('6k1/pp3ppp/2q5/3N4/8/8/PP3PPP/4R1K1 w - - 1 2'),
      bestLine: ['d5e7', 'g8f8', 'e7c6'],
      themes: ['fork'],
    });
    expect(f.bestLine).toEqual(['Ne7+', 'Kf8', 'Nxc6']);
    expect(f.themes).toEqual(['fork']);
    expect(f.motifs.map((m) => m.id)).toContain('fork');
  });
});
