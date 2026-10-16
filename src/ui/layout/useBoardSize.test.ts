import { describe, expect, it } from 'vitest';
import { computeBoardSize } from './useBoardSize';

describe('board size rule (DESIGN §3.3/§3.4)', () => {
  const base = { hasPlayerBars: false, hasEvalBar: false };
  it('phone: full viewport width', () => {
    expect(computeBoardSize({ ...base, viewportWidth: 360, viewportHeight: 640, areaWidth: 360, areaHeight: 360 })).toBe(360);
    expect(computeBoardSize({ ...base, viewportWidth: 390, viewportHeight: 844, areaWidth: 390, areaHeight: 390 })).toBe(390);
  });
  it('tablet: min(width, 100dvh − 220), multiple of 8', () => {
    expect(computeBoardSize({ ...base, viewportWidth: 800, viewportHeight: 1000, areaWidth: 680, areaHeight: 900 })).toBe(680);
    expect(computeBoardSize({ ...base, viewportWidth: 1000, viewportHeight: 700, areaWidth: 880, areaHeight: 600 })).toBe(480);
  });
  it('desktop: height-limited, player bars and eval bar subtracted, capped at 960, min 320', () => {
    expect(computeBoardSize({ viewportWidth: 1440, viewportHeight: 900, areaWidth: 900, areaHeight: 852, hasPlayerBars: true, hasEvalBar: true })).toBe(760);
    expect(computeBoardSize({ ...base, viewportWidth: 2560, viewportHeight: 1440, areaWidth: 2000, areaHeight: 1392 })).toBe(960);
    expect(computeBoardSize({ ...base, viewportWidth: 1024, viewportHeight: 500, areaWidth: 500, areaHeight: 200 })).toBe(320);
    expect(computeBoardSize({ ...base, viewportWidth: 1440, viewportHeight: 900, areaWidth: 801, areaHeight: 853 })).toBe(800);
  });
});
