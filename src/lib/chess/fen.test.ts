import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { normalizeFen, positionKey, validateFen } from './fen';

function errorOf(fen: string): string {
  const r = validateFen(fen);
  if (r.ok) throw new Error(`expected invalid: ${fen}`);
  return r.errorDe;
}

describe('validateFen', () => {
  it('accepts legal positions, including a consistent e.p. square without a possible capture', () => {
    expect(validateFen(START_FEN)).toEqual({ ok: true });
    expect(validateFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toEqual({ ok: true });
    expect(validateFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1')).toEqual({ ok: true });
  });

  it('rejects missing or extra kings', () => {
    expect(errorOf('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('Schwarz braucht genau einen König.');
    expect(errorOf('4k3/8/8/8/8/8/8/4K2K w - - 0 1')).toBe('Weiß braucht genau einen König.');
  });

  it('rejects pawns on the first or eighth rank', () => {
    expect(errorOf('4k2P/8/8/8/8/8/8/4K3 w - - 0 1')).toBe('Bauern dürfen nicht auf der ersten oder achten Reihe stehen.');
    expect(errorOf('4k3/8/8/8/8/8/8/p3K3 w - - 0 1')).toBe('Bauern dürfen nicht auf der ersten oder achten Reihe stehen.');
  });

  it('rejects a position where the side not to move is in check (3.10.3)', () => {
    expect(errorOf('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1')).toContain('Schwarz ist nicht am Zug, steht aber im Schach');
  });

  it('rejects castling rights that do not match king/rook squares', () => {
    expect(errorOf('r3k2r/8/8/8/8/8/8/R4K1R w KQkq - 0 1')).toContain('Rochaderechte passen nicht');
    expect(errorOf('r3k2r/8/8/8/8/8/8/R3K3 w KQkq - 0 1')).toContain('Rochaderechte passen nicht');
  });

  it('rejects an inconsistent en-passant square', () => {
    expect(errorOf('4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1')).toBe('Das En-passant-Feld passt nicht zur Stellung.');
    expect(errorOf('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e3 0 1')).toBe('Das En-passant-Feld passt nicht zur Stellung.');
  });

  it('rejects impossible material and broken syntax', () => {
    expect(errorOf('4k3/pppppppp/p7/8/8/8/8/4K3 w - - 0 1')).toBe('Schwarz hat mehr als 8 Bauern.');
    expect(errorOf('4k3/8/8/8/8/8/PPPPPPPP/QQQQK3 w - - 0 1')).toContain('mehr Figuren, als durch Umwandlungen');
    expect(errorOf('hello')).toBe('Die FEN muss aus sechs durch Leerzeichen getrennten Feldern bestehen.');
    expect(errorOf('4k3/8/8/8/8/8/8/4K3 x - - 0 1')).toContain('Zugrecht');
    expect(errorOf('4k3/8/8/8/8/8/8/4K4 w - - 0 1')).toContain('8 Reihen');
  });
});

describe('normalizeFen', () => {
  it('strips castling flags whose king or rook moved (C11, C12)', () => {
    expect(normalizeFen('r3k2r/8/8/8/8/8/8/R4K1R w KQkq - 0 1')).toBe('r3k2r/8/8/8/8/8/8/R4K1R w kq - 0 1');
    expect(normalizeFen('r3k2r/8/8/8/8/8/8/R3K3 w KQkq - 0 1')).toBe('r3k2r/8/8/8/8/8/8/R3K3 w Qkq - 0 1');
  });

  it('keeps the e.p. square only if a legal capture exists (E5, E3)', () => {
    expect(normalizeFen('4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1')).toBe('4k3/8/8/4P3/8/8/8/4K3 w - - 0 1');
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
    expect(normalizeFen('rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3')).toBe(
      'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
    );
    // Pinned pawn: e.p. would expose the king (E3) -> removed.
    expect(normalizeFen('7k/8/8/KPp4r/8/8/8/8 w - c6 0 2')).toBe('7k/8/8/KPp4r/8/8/8/8 w - - 0 2');
  });

  it('normalises whitespace', () => {
    expect(normalizeFen(`  ${START_FEN.replace(/ /g, '   ')} `)).toBe(START_FEN);
  });
});

describe('positionKey', () => {
  it('uses placement, side to move, castling and e.p.', () => {
    expect(positionKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });
});
