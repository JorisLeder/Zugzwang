import { describe, expect, it } from 'vitest';
import { formatDelta, formatEval, formatNumber, formatPercent } from './format';

describe('German formatting', () => {
  it('numbers and percent', () => {
    expect(formatNumber(1250)).toBe('1.250');
    expect(formatNumber(3.456, 1)).toBe('3,5');
    expect(formatPercent(78.4)).toBe('78,4\u00A0%');
  });
  it('rating deltas', () => {
    expect(formatDelta(8)).toBe('+8');
    expect(formatDelta(-6)).toBe('−6');
    expect(formatDelta(0.2)).toBe('±0');
  });
  it('evaluations', () => {
    expect(formatEval({ type: 'cp', value: 130 })).toBe('+1,3');
    expect(formatEval({ type: 'cp', value: -80 })).toBe('−0,8');
    expect(formatEval({ type: 'cp', value: 3 })).toBe('0,0');
    expect(formatEval({ type: 'mate', value: 3 })).toBe('M3');
    expect(formatEval({ type: 'mate', value: -2 })).toBe('−M2');
  });
});
