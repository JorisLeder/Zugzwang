import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { FIXTURE_GAME } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import data from './openings/openings.json';
import { createOpeningBook, loadOpeningBook, lookupOpening, openingKey } from './openings';

describe('opening book data (lichess-org/chess-openings, CC0)', () => {
  it('records source, commit and licence', () => {
    expect(data.source).toBe('https://github.com/lichess-org/chess-openings');
    expect(data.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(data.license).toBe('CC0-1.0');
    expect(data.lines).toBeGreaterThan(3000);
    expect(data.entries.length).toBeGreaterThan(data.named);
  });

  it('every entry is a legal position key with an ECO code and a name', () => {
    for (const [epd, eco, name] of data.entries.slice(0, 500)) {
      expect(eco).toMatch(/^[A-E]\d\d$/);
      expect(name.length).toBeGreaterThan(0);
      expect(() => ChessGame.fromFen(`${epd} 0 1`)).not.toThrow();
    }
  });
});

describe('lookupOpening', () => {
  it('names well-known positions', async () => {
    const after = (moves: string[]) => ChessGame.fromMoves(START_FEN, moves).fen();
    await expect(lookupOpening(after(['e2e4']))).resolves.toEqual({ eco: 'B00', name: "King's Pawn Game" });
    await expect(lookupOpening(after(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']))).resolves.toEqual({ eco: 'C50', name: 'Italian Game' });
    await expect(lookupOpening(after(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']))).resolves.toEqual({
      eco: 'C50',
      name: 'Italian Game: Giuoco Piano',
    });
  });

  it('ignores move counters and a bogus e.p. square', async () => {
    await expect(lookupOpening('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).resolves.toMatchObject({ eco: 'B00' });
    await expect(lookupOpening('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 7 30')).resolves.toMatchObject({ eco: 'B00' });
  });

  it('returns null outside the book and for garbage', async () => {
    await expect(lookupOpening(START_FEN)).resolves.toBeNull();
    await expect(lookupOpening(FIXTURE_GAME.finalFen)).resolves.toBeNull();
    await expect(lookupOpening('not a fen')).resolves.toBeNull();
  });

  it('the fixture game starts in book and leaves it later', async () => {
    const book = await loadOpeningBook();
    const game = ChessGame.fromMoves(FIXTURE_GAME.startFen, FIXTURE_GAME.moves);
    const inBook = game.history().map((m) => book.has(m.fenAfter));
    expect(inBook.slice(0, 6)).toEqual([true, true, true, true, true, true]);
    expect(inBook.indexOf(false)).toBeGreaterThan(6);
    expect(inBook.slice(30).some(Boolean)).toBe(false);
  });

  it('loads once', async () => {
    expect(await loadOpeningBook()).toBe(await loadOpeningBook());
  });
});

describe('createOpeningBook / openingKey', () => {
  it('builds a lookup from [epd, eco, name] entries', () => {
    const book = createOpeningBook({ commit: 'x', entries: [['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'B00', "King's Pawn Game"]] });
    expect(book.size).toBe(1);
    expect(book.get('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toEqual({ eco: 'B00', name: "King's Pawn Game" });
    expect(book.has(START_FEN)).toBe(false);
  });

  it('keys drop the clocks', () => {
    expect(openingKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    expect(openingKey('garbage')).toBeNull();
  });
});
