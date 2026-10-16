import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { cannotMate, materialBalance, PIECE_VALUES } from './material';

describe('material', () => {
  it('piece values', () => {
    expect(PIECE_VALUES).toEqual({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });
  });

  it('materialBalance is White minus Black in pawns', () => {
    expect(materialBalance(START_FEN)).toBe(0);
    expect(materialBalance('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBe(9);
    expect(materialBalance('4k3/8/8/8/8/8/8/r3K3 w - - 0 1')).toBe(-5);
  });

  it('cannotMate follows RULES §5.3', () => {
    expect(cannotMate('8/8/8/4k3/8/8/8/3QK3 w - - 0 1', 'b')).toBe(true); // bare king
    expect(cannotMate('3qk3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'w')).toBe(true); // K+N v K+Q
    expect(cannotMate('3rk3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'w')).toBe(false); // K+N v K+R
    expect(cannotMate('4k2r/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(true); // K+B v K+R
    expect(cannotMate('6nk/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(false); // K+B v K+N
    expect(cannotMate('2b4k/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(false); // opposite-coloured bishops
    expect(cannotMate('5b1k/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(true); // same-coloured bishops
    expect(cannotMate('7k/7p/8/8/8/8/8/2B1K3 w - - 0 1', 'w')).toBe(false); // K+B v K+P
    expect(cannotMate(START_FEN, 'w')).toBe(false);
  });
});
