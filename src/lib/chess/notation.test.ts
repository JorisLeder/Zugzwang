import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { formatSan, parseUci, pieceNameDe, sanFromDisplay, sanToUci, uciLineToSan, uciToSan } from './notation';

describe('formatSan (D-23)', () => {
  it('German notation uses K D T L S, =D and 0-0', () => {
    expect(formatSan('Nf3', 'de')).toBe('Sf3');
    expect(formatSan('Qxd8+', 'de')).toBe('Dxd8+');
    expect(formatSan('Rae1', 'de')).toBe('Tae1');
    expect(formatSan('Bb5#', 'de')).toBe('Lb5#');
    expect(formatSan('Kxe2', 'de')).toBe('Kxe2');
    expect(formatSan('exd8=Q+', 'de')).toBe('exd8=D+');
    expect(formatSan('a1=N', 'de')).toBe('a1=S');
    expect(formatSan('O-O', 'de')).toBe('0-0');
    expect(formatSan('O-O-O+', 'de')).toBe('0-0-0+');
    expect(formatSan('e4', 'de')).toBe('e4');
  });

  it('English notation is unchanged (castling with the letter O)', () => {
    expect(formatSan('Nf3', 'en')).toBe('Nf3');
    expect(formatSan('exd8=Q+', 'en')).toBe('exd8=Q+');
    expect(formatSan('O-O-O', 'en')).toBe('O-O-O');
    expect(formatSan('0-0', 'en')).toBe('O-O');
  });

  it('sanFromDisplay reverses German display notation', () => {
    expect(sanFromDisplay('Sf3')).toBe('Nf3');
    expect(sanFromDisplay('exd8=D+')).toBe('exd8=Q+');
    expect(sanFromDisplay('0-0-0')).toBe('O-O-O');
    expect(sanFromDisplay('Bxe5')).toBe('Bxe5');
  });
});

describe('UCI / SAN conversion', () => {
  it('converts both ways and returns null for illegal moves', () => {
    expect(uciToSan(START_FEN, 'g1f3')).toBe('Nf3');
    expect(uciToSan(START_FEN, 'e2e5')).toBeNull();
    expect(uciToSan(START_FEN, 'e2e4q')).toBeNull();
    expect(uciToSan('bad fen', 'e2e4')).toBeNull();
    expect(sanToUci(START_FEN, 'Nf3')).toBe('g1f3');
    expect(sanToUci(START_FEN, 'Sf3')).toBe('g1f3');
    expect(sanToUci('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', '0-0-0')).toBe('e1c1');
    expect(sanToUci(START_FEN, 'Ke2')).toBeNull();
    expect(uciToSan('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7a8n')).toBe('a8=N');
  });

  it('uciLineToSan converts a PV and stops at the first illegal move', () => {
    expect(uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(uciLineToSan(START_FEN, ['e2e4', 'e2e4'])).toEqual(['e4']);
  });

  it('parseUci', () => {
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4' });
    expect(parseUci('Nf3')).toBeNull();
  });

  it('German piece names', () => {
    expect(['p', 'n', 'b', 'r', 'q', 'k'].map((p) => pieceNameDe(p as 'p'))).toEqual([
      'Bauer',
      'Springer',
      'Läufer',
      'Turm',
      'Dame',
      'König',
    ]);
  });
});
