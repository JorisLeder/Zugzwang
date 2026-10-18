import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpeningBook, type OpeningBook } from '@/analysis';
import { START_FEN } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import { randomBookLine } from './openings';
import { createRng, hashSeed, pick, randInt, weightedIndex } from './rng';

let book: OpeningBook;
beforeAll(async () => {
  book = await loadOpeningBook();
});

describe('randomBookLine', () => {
  it('walks through named book positions only', () => {
    for (let i = 0; i < 20; i++) {
      const line = randomBookLine(book, createRng(hashSeed(1, 'game', i)), 2, 14);
      expect(line.moves.length).toBeGreaterThanOrEqual(1);
      expect(line.moves.length).toBeLessThanOrEqual(14);
      const game = ChessGame.fromFen(START_FEN);
      for (const m of line.moves) {
        expect(game.move(m)).not.toBeNull();
        expect(book.has(game.fen())).toBe(true);
      }
      expect(line.opening).toEqual(book.get(game.fen()));
    }
  });

  it('is deterministic for an RNG seed and varies between seeds', () => {
    const a = randomBookLine(book, createRng(7), 6, 12);
    expect(randomBookLine(book, createRng(7), 6, 12)).toEqual(a);
    const lines = new Set(Array.from({ length: 10 }, (_, i) => randomBookLine(book, createRng(100 + i), 6, 12).moves.join(' ')));
    expect(lines.size).toBeGreaterThan(5);
  });
});

describe('rng', () => {
  it('is reproducible and in range', () => {
    const r1 = createRng(hashSeed(3, 'x'));
    const r2 = createRng(hashSeed(3, 'x'));
    const xs = Array.from({ length: 50 }, () => r1());
    expect(Array.from({ length: 50 }, () => r2())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(hashSeed(1, 'game', 2)).not.toBe(hashSeed(1, 'game', 3));
  });

  it('picks by weight and inside bounds', () => {
    const rng = createRng(5);
    for (let i = 0; i < 100; i++) {
      const n = randInt(rng, 2, 4);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
      expect(weightedIndex(rng, [0, 1, 0])).toBe(1);
    }
    expect(() => pick(rng, [])).toThrow();
  });
});
