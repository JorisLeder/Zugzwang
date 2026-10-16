import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { attackersOf, boardPieces, buildFen, isSquareAttacked, kingSquare, nullMoveFen, parseFen } from './board';
import { validateFen } from './fen';

describe('parseFen / buildFen', () => {
  it('round-trips positions', () => {
    for (const fen of [
      START_FEN,
      'r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 12',
      '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
      '8/8/8/8/8/8/8/8 b - - 99 140',
    ]) {
      const parts = parseFen(fen);
      expect(parts).not.toBeNull();
      expect(buildFen(parts!)).toBe(fen);
    }
  });

  it('lists pieces with squares and colours', () => {
    const pieces = boardPieces('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
    expect(pieces).toHaveLength(9);
    expect(pieces).toContainEqual({ square: 'g8', type: 'k', color: 'b' });
    expect(pieces).toContainEqual({ square: 'd1', type: 'r', color: 'w' });
    expect(boardPieces(START_FEN)).toHaveLength(32);
  });

  it('rejects malformed FENs', () => {
    expect(parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1')).toBeNull(); // 7 ranks
    expect(parseFen('rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeNull(); // 9 files
    expect(parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1')).toBeNull(); // bad letter
    expect(parseFen(`${START_FEN.replace(' w ', ' x ')}`)).toBeNull();
    expect(parseFen(`${START_FEN.replace(' - ', ' e9 ')}`)).toBeNull();
    expect(parseFen('')).toBeNull();
  });

  it('builds a FEN from edited pieces (position editor) with defaults', () => {
    const fen = buildFen({
      pieces: [
        { square: 'e1', type: 'k', color: 'w' },
        { square: 'e8', type: 'k', color: 'b' },
        { square: 'a1', type: 'r', color: 'w' },
      ],
    });
    expect(fen).toBe('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(validateFen(fen)).toEqual({ ok: true });
  });
});

describe('kingSquare', () => {
  it('finds the king or returns null', () => {
    expect(kingSquare(START_FEN, 'w')).toBe('e1');
    expect(kingSquare(START_FEN, 'b')).toBe('e8');
    expect(kingSquare('8/8/8/8/8/8/8/R7 w - - 0 1', 'w')).toBeNull();
  });
});

describe('attackersOf / isSquareAttacked', () => {
  it('counts a pinned piece as an attacker (FIDE 3.9: it still attacks)', () => {
    // White knight e2 is pinned by the rook e4 against the king e1, yet it attacks d4 and f4.
    const fen = '4k3/8/8/8/4r3/8/4N3/4K3 w - - 0 1';
    expect(attackersOf(fen, 'd4', 'w')).toEqual(['e2']);
    expect(isSquareAttacked(fen, 'f4', 'w')).toBe(true);
    expect(attackersOf(fen, 'e2', 'b')).toEqual(['e4']);
  });

  it('does not treat en passant as an attack on the pawn square', () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2';
    expect(attackersOf(fen, 'd5', 'w')).toEqual([]);
    expect(attackersOf(fen, 'd6', 'w')).toEqual(['e5']);
  });

  it('lists several attackers and works on positions without kings', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    expect(attackersOf(fen, 'd8', 'w')).toEqual(['d1']);
    expect(attackersOf(fen, 'g7', 'b')).toEqual(['g8']);
    expect(attackersOf(fen, 'g2', 'w')).toEqual(['g1']);
    expect(attackersOf(START_FEN, 'f3', 'w').sort()).toEqual(['e2', 'g1', 'g2']);
    expect(attackersOf('8/8/8/8/8/8/8/R7 w - - 0 1', 'a8', 'w')).toEqual(['a1']);
    expect(attackersOf('not a fen', 'a8', 'w')).toEqual([]);
  });
});

describe('nullMoveFen', () => {
  it('passes the move, clears e.p. and advances the clocks', () => {
    expect(nullMoveFen(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 1 1');
    expect(nullMoveFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2')).toBe('4k3/8/8/3pP3/8/8/8/4K3 b - - 1 2');
    expect(nullMoveFen('4k3/8/8/8/8/8/8/4K3 b - - 3 7')).toBe('4k3/8/8/8/8/8/8/4K3 w - - 4 8');
    expect(validateFen(nullMoveFen(START_FEN)!)).toEqual({ ok: true });
  });

  it('returns null when the side to move is in check', () => {
    expect(nullMoveFen('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1')).toBeNull();
  });
});
