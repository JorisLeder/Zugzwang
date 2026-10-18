import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importedGameRecord, normalizedGameText, pgnExternalId, pgnWithOwnTags } from './normalize';
import { parsePgnWithDiagnostics, type PgnGame } from './parser';
import { sha256Hex } from './sha256';

const read = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

function first(text: string): PgnGame {
  const r = parsePgnWithDiagnostics(text);
  if (!r.ok) throw new Error(r.error.messageDe);
  return r.games[0]!;
}

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 test vectors and node:crypto', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    for (const text of ['ä ö ü ß – „Zug“', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), read('19-fixture-40-moves.pgn')]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });
});

describe('pgnExternalId', () => {
  it('is the same for the same game with other formatting, comments, NAGs and variations', () => {
    const plain = first('[Event "Turnier"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0');
    const decorated = first(
      '\uFEFF[Event  "Turnier "]\r\n[White "A"]\r\n[Black "B"]\r\n[Result "1-0"]\r\n[Annotator "x"]\r\n\r\n1.e4 {gut} e5 $1 (1... c5) 2. Nf3! Nc6 1-0\r\n',
    );
    expect(pgnExternalId(decorated)).toBe(pgnExternalId(plain));
    expect(pgnExternalId(plain)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when moves, players, result or start position differ', () => {
    const base = pgnExternalId(first('[White "A"]\n\n1. e4 e5 *'));
    expect(pgnExternalId(first('[White "A"]\n\n1. e4 c5 *'))).not.toBe(base);
    expect(pgnExternalId(first('[White "C"]\n\n1. e4 e5 *'))).not.toBe(base);
    expect(pgnExternalId(first('[White "A"]\n\n1. e4 e5 1-0'))).not.toBe(base);
    expect(pgnExternalId(first(read('05-fen-black-to-move.pgn')))).not.toBe(
      pgnExternalId(first('[Event "Aus Stellung"]\n[Site "?"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *')),
    );
  });

  it('documents its normal form', () => {
    const g = first(read('05-fen-black-to-move.pgn'));
    expect(normalizedGameText(g)).toBe(
      '[Event "Aus Stellung"]\n[Site "?"]\n[Result "*"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"]\n\nNc6 Bb5 a6 Ba4 *',
    );
  });
});

describe('importedGameRecord', () => {
  it('builds a finished pgn game with external id and the rule-based end reason', () => {
    const g = first(read('08-white-mates.pgn'));
    const row = importedGameRecord(g, '2026-10-17T10:00:00.000Z');
    expect(row).toMatchObject({
      source: 'pgn',
      externalId: pgnExternalId(g),
      botId: null,
      userColor: null,
      assistance: null,
      status: 'finished',
      result: '1-0',
      endReason: 'checkmate',
      origin: { type: 'new' },
      finishedAt: '2026-10-17T10:00:00.000Z',
      timeControl: { kind: 'none' },
    });
    expect(row.pgn).toContain('4. Qxf7# 1-0');
    expect(row.headers.White).toBe('Weiß');
  });

  it('has no end reason for a resignation and marks FEN starts', () => {
    const resigned = importedGameRecord(first(read('15-lichess.pgn')), '2026-10-17T10:00:00.000Z');
    expect(resigned.endReason).toBeNull();
    expect(resigned.result).toBe('0-1');
    const fen = importedGameRecord(first(read('05-fen-black-to-move.pgn')), '2026-10-17T10:00:00.000Z');
    expect(fen.origin).toEqual({ type: 'fen' });
    expect(fen.startFen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  });
});

describe('pgnWithOwnTags (request text of games-import)', () => {
  it('parses again to the same normal form and external id for every fixture game – game.pgn does not', () => {
    let games = 0;
    let differs = 0;
    for (const name of readdirSync(join(__dirname, '__fixtures__')).filter((f) => f.endsWith('.pgn'))) {
      const r = parsePgnWithDiagnostics(read(name));
      if (!r.ok) continue;
      for (const g of r.games) {
        const again = first(pgnWithOwnTags(g));
        expect(normalizedGameText(again), name).toBe(normalizedGameText(g));
        expect(pgnExternalId(again), name).toBe(pgnExternalId(g));
        expect(again.pgn, name).toBe(g.pgn);
        if (pgnExternalId(first(g.pgn)) !== pgnExternalId(g)) differs += 1;
        games += 1;
      }
    }
    expect(games).toBeGreaterThanOrEqual(20);
    // The clean PGN adds Seven Tag Roster placeholders, so re-parsing it changes the id of games without them.
    expect(differs).toBeGreaterThan(0);
  });

  it('escapes quotes and backslashes and writes a non-standard start as SetUp + normalised FEN', () => {
    const g = first('[Event "Das \\"Turnier\\" in A\\\\B"]\n[FEN "4k3/8/8/8/8/8/8/4K2R w K - 0 1"]\n\n1. O-O *');
    expect(g.headers.Event).toBe('Das "Turnier" in A\\B');
    const text = pgnWithOwnTags(g);
    expect(text).toBe(
      '[Event "Das \\"Turnier\\" in A\\\\B"]\n[Result "*"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K2R w K - 0 1"]\n\n1. O-O *\n',
    );
    expect(pgnExternalId(first(text))).toBe(pgnExternalId(g));
  });
});
