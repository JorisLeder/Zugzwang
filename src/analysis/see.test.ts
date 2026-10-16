import { describe, expect, it } from 'vitest';
import { validateFen } from '@/lib/chess';
import { captureGain, seeMove } from './see';

function legal(fen: string): string {
  const v = validateFen(fen);
  if (!v.ok) throw new Error(`invalid test FEN ${fen}: ${v.errorDe}`);
  return fen;
}

describe('static exchange evaluation', () => {
  it('an undefended piece is won outright', () => {
    expect(captureGain(legal('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'd5', 'w')).toBe(3);
  });

  it('queen takes a pawn-defended knight: the side stops (gain 0), the move itself loses 6', () => {
    const fen = legal('4k3/8/4p3/3n4/8/8/8/3QK3 w - - 0 1');
    expect(captureGain(fen, 'd5', 'w')).toBe(0);
    expect(seeMove(fen, 'd1d5')).toBe(-6);
  });

  it('x-ray: doubled rooks win a knight defended by one rook', () => {
    const fen = legal('3rk3/8/8/3n4/8/8/3R4/3RK3 w - - 0 1');
    expect(captureGain(fen, 'd5', 'w')).toBe(3);
    expect(seeMove(fen, 'd2d5')).toBe(3);
  });

  it('an absolutely pinned attacker cannot capture', () => {
    expect(captureGain(legal('4k3/8/8/8/1b6/5r2/3N4/4K3 w - - 0 1'), 'f3', 'w')).toBe(0);
  });

  it('the king only captures undefended pieces', () => {
    expect(captureGain(legal('4k3/8/8/8/8/8/3p4/4K3 w - - 0 1'), 'd2', 'w')).toBe(1);
    expect(captureGain(legal('4k3/8/8/8/8/2b5/3p4/4K3 w - - 0 1'), 'd2', 'w')).toBe(0);
  });

  it('en passant wins a pawn', () => {
    expect(seeMove(legal('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2'), 'e5d6')).toBe(1);
  });

  it('no capture, own piece, or king square → 0', () => {
    const fen = legal('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1');
    expect(captureGain(fen, 'a1', 'w')).toBe(0);
    expect(captureGain(fen, 'e4', 'w')).toBe(0);
    expect(captureGain(fen, 'e8', 'w')).toBe(0);
    expect(seeMove(fen, 'e1e2')).toBe(0);
  });
});
