import { describe, expect, it } from 'vitest';
import { validateFen } from '@/lib/chess';
import { classifyMove, isRecapture, sacrificeSee, type ClassifyInput } from './classify';

function legal(fen: string): string {
  const v = validateFen(fen);
  if (!v.ok) throw new Error(`invalid test FEN ${fen}: ${v.errorDe}`);
  return fen;
}

/** A plain move in a balanced position; override what the case needs. */
function input(over: Partial<ClassifyInput>): ClassifyInput {
  const loss = over.loss ?? 0;
  return { loss, isBestMove: false, winPctBefore: 50, winPctAfter: 50 - loss * 100, ...over };
}

describe('classifyMove – one test per category (D-07)', () => {
  it('book', () => expect(classifyMove(input({ inBook: true, loss: 0.01 }))).toBe('book'));
  it('brilliant', () =>
    expect(classifyMove(input({ loss: 0.01, sacrificeSee: -3, winPctBefore: 60, winPctAfter: 59 }))).toBe('brilliant'));
  it('great – only good move (gap to the second-best ≥ 0.15)', () =>
    expect(classifyMove(input({ isBestMove: true, secondBestGap: 0.15 }))).toBe('great'));
  it('great – saves a lost position (before < 30, after ≥ 50)', () =>
    expect(classifyMove(input({ loss: 0.01, winPctBefore: 25, winPctAfter: 50 }))).toBe('great'));
  it('best – the engine move', () => expect(classifyMove(input({ isBestMove: true, secondBestGap: 0.05 }))).toBe('best'));
  it('excellent', () => expect(classifyMove(input({ loss: 0.015 }))).toBe('excellent'));
  it('good', () => expect(classifyMove(input({ loss: 0.03 }))).toBe('good'));
  it('inaccuracy', () => expect(classifyMove(input({ loss: 0.07 }))).toBe('inaccuracy'));
  it('mistake', () => expect(classifyMove(input({ loss: 0.15 }))).toBe('mistake'));
  it('miss', () =>
    expect(classifyMove(input({ loss: 0.15, previousClassification: 'blunder', recoverable: 0.3 }))).toBe('miss'));
  it('blunder', () => expect(classifyMove(input({ loss: 0.35 }))).toBe('blunder'));
});

describe('classifyMove – boundaries (lower exclusive / upper inclusive, blunder from 0.20)', () => {
  it.each([
    [0, 'best'],
    [0.0049, 'best'],
    [0.005, 'excellent'],
    [0.02, 'excellent'],
    [0.0201, 'good'],
    [0.05, 'good'],
    [0.0501, 'inaccuracy'],
    [0.1, 'inaccuracy'],
    [0.1001, 'mistake'],
    [0.1999, 'mistake'],
    [0.2, 'blunder'],
    [0.2001, 'blunder'],
  ] as const)('loss %f → %s', (loss, expected) => {
    expect(classifyMove(input({ loss }))).toBe(expected);
  });

  it('the engine best move is "best" whatever the measured loss', () => {
    expect(classifyMove(input({ isBestMove: true, loss: 0.04 }))).toBe('best');
  });
});

describe('classifyMove – precedence and special rules', () => {
  it('book beats brilliant', () => {
    expect(classifyMove(input({ inBook: true, loss: 0, sacrificeSee: -5, winPctBefore: 60, winPctAfter: 60 }))).toBe('book');
  });

  it('brilliant beats great', () => {
    expect(classifyMove(input({ isBestMove: true, secondBestGap: 0.3, sacrificeSee: -2, winPctBefore: 60, winPctAfter: 60 }))).toBe(
      'brilliant',
    );
  });

  it.each([
    ['a recapture', { isRecapture: true }],
    ['the only legal move', { onlyLegalMove: true }],
    ['already winning (win% before ≥ 97)', { winPctBefore: 97, winPctAfter: 97 }],
    ['not good enough afterwards (win% after < 50)', { winPctBefore: 49, winPctAfter: 49.9 }],
    ['no real sacrifice (SEE −1)', { sacrificeSee: -1 }],
    ['too much loss (0.021)', { loss: 0.021 }],
  ])('not brilliant: %s', (_, over) => {
    const c = classifyMove(input({ loss: 0.01, sacrificeSee: -3, winPctBefore: 60, winPctAfter: 59, ...over }));
    expect(c).not.toBe('brilliant');
  });

  it('not great: gap 0.149, recapture, only legal move, loss > 0.02', () => {
    expect(classifyMove(input({ isBestMove: true, secondBestGap: 0.149 }))).toBe('best');
    expect(classifyMove(input({ isBestMove: true, secondBestGap: 0.5, isRecapture: true }))).toBe('best');
    expect(classifyMove(input({ isBestMove: true, secondBestGap: 0.5, onlyLegalMove: true }))).toBe('best');
    expect(classifyMove(input({ loss: 0.021, winPctBefore: 20, winPctAfter: 55 }))).toBe('good');
  });

  it('miss: from a loss of exactly 0.10, blunders stay blunders', () => {
    const prev = { previousClassification: 'mistake' as const, recoverable: 0.12 };
    expect(classifyMove(input({ loss: 0.1, ...prev }))).toBe('miss');
    expect(classifyMove(input({ loss: 0.1999, ...prev }))).toBe('miss');
    expect(classifyMove(input({ loss: 0.2, ...prev }))).toBe('blunder');
    expect(classifyMove(input({ loss: 0.05, ...prev }))).toBe('good');
  });

  it('no miss after an opponent inaccuracy or when too little could be recovered', () => {
    expect(classifyMove(input({ loss: 0.15, previousClassification: 'inaccuracy', recoverable: 0.3 }))).toBe('mistake');
    expect(classifyMove(input({ loss: 0.15, previousClassification: 'blunder', recoverable: 0.099 }))).toBe('mistake');
  });
});

describe('sacrificeSee (real piece sacrifice measure)', () => {
  it('Greek gift Bxh7+ gives a bishop for a pawn (−2)', () => {
    expect(sacrificeSee(legal('6k1/5ppp/8/8/8/3B4/8/6K1 w - - 0 1'), 'd3h7')).toBe(-2);
  });
  it('a quiet move that leaves a rook en prise (−5)', () => {
    expect(sacrificeSee(legal('3rk3/8/8/8/8/8/8/3R2K1 w - - 0 1'), 'g1h1')).toBe(-5);
  });
  it('an even trade is no sacrifice (N×N, e×d5 back)', () => {
    expect(sacrificeSee(legal('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1'), 'c3d5')).toBe(0);
  });
  it('a mate with a protected queen is no sacrifice', () => {
    expect(sacrificeSee(legal('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'), 'h5f7')).toBe(0);
  });
  it('pawns do not count; an illegal move returns 0', () => {
    expect(sacrificeSee(legal('4k3/8/8/3p4/8/8/4P3/4K3 w - - 0 1'), 'e2e4')).toBe(0);
    expect(sacrificeSee(legal('4k3/8/8/3p4/8/8/4P3/4K3 w - - 0 1'), 'e2e5')).toBe(0);
  });
});

describe('isRecapture', () => {
  it('captures back on the square of the previous capture', () => {
    expect(isRecapture({ to: 'd5', captured: 'n' }, { to: 'd5', captured: 'n' })).toBe(true);
    expect(isRecapture({ to: 'd5' }, { to: 'd5', captured: 'n' })).toBe(false);
    expect(isRecapture({ to: 'e4', captured: 'p' }, { to: 'd5', captured: 'n' })).toBe(false);
    expect(isRecapture(null, { to: 'd5', captured: 'n' })).toBe(false);
  });
});
