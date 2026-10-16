import { describe, expect, it } from 'vitest';
import { buildOpeningBook, parseOpeningsTsv, pgnMoves, replayLine } from './build';

const TSV = [
  'eco\tname\tpgn',
  "B00\tKing's Pawn Game\t1. e4",
  'C20\tKing\'s Pawn Game: Napoleon Attack\t1. e4 e5 2. Qf3',
  'C50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4',
  'C40\tKing\'s Knight Opening\t1. e4 e5 2. Nf3',
  '',
].join('\n');

describe('openings:build', () => {
  it('parses the TSV columns', () => {
    const lines = parseOpeningsTsv(TSV, 'c.tsv');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toEqual({ eco: 'C50', name: 'Italian Game', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4', origin: 'c.tsv:4' });
    expect(() => parseOpeningsTsv('a\tb\n', 'x.tsv')).toThrow(/unexpected header/);
  });

  it('extracts SAN moves from PGN move text', () => {
    expect(pgnMoves('1. e4 e5 2. Nf3 Nc6 3. Bc4 *')).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(pgnMoves('1. d4 1... d5')).toEqual(['d4', 'd5']);
  });

  it('rejects lines with illegal moves', () => {
    expect(() => replayLine({ eco: 'A00', name: 'Bad', pgn: '1. e5', origin: 'a.tsv:2' })).toThrow(/a.tsv:2: illegal move "e5"/);
  });

  it('names final positions and gives intermediate positions the deepest named ancestor', () => {
    const book = buildOpeningBook(parseOpeningsTsv(TSV, 'c.tsv'), { commit: 'abc', files: ['c.tsv'] });
    expect(book).toMatchObject({ commit: 'abc', license: 'CC0-1.0', lines: 4, named: 4 });
    const byEpd = new Map(book.entries.map(([epd, eco, name]) => [epd, `${eco} ${name}`]));
    // 1. e4 e5 is not named itself → deepest named ancestor on its lines is 1. e4.
    expect(byEpd.get('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -')).toBe("B00 King's Pawn Game");
    // 1. e4 e5 2. Nf3 is named (C40); 2... Nc6 (unnamed) inherits it.
    expect(byEpd.get('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -')).toBe("C40 King's Knight Opening");
    expect(byEpd.get('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -')).toBe('C50 Italian Game');
    expect(book.entries).toHaveLength(6); // e4, e5, Qf3, Nf3, Nc6, Bc4
    const sorted = [...book.entries].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    expect(book.entries).toEqual(sorted);
  });
});
