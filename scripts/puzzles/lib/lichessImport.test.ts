import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Puzzle } from '@/core/puzzles';
import { puzzleBankManifestSchema } from '@/core/schemas';
import { parseCliArgs } from '../import-lichess';
import { sha256Hex } from './bankFiles';
import { csvField, filterReason, lichessRowToPuzzle, parseLichessFields, pgArray, seedCsvHeader, seedCsvLine, DEFAULT_LICHESS_FILTERS } from './lichessCsv';
import { DEFAULT_IMPORT_OPTIONS, importLichessPuzzles, LichessImportError, type LichessImportOptions } from './lichessImport';
import { checkPuzzleStructure } from './puzzleChecks';

const FIXTURE = join(import.meta.dirname, '__fixtures__', 'lichess-sample.csv');
const dirs: string[] = [];

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'zz-lichess-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function options(outDir: string, extra: Partial<LichessImportOptions> = {}): LichessImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, input: FIXTURE, outDir, ...extra };
}

function readChunks(outDir: string): Puzzle[] {
  const manifest = puzzleBankManifestSchema.parse(JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')));
  return manifest.chunks.flatMap((c) => JSON.parse(readFileSync(join(outDir, c.file), 'utf8')) as Puzzle[]);
}

/**
 * A valid zstd frame made of raw (uncompressed) blocks – enough to exercise the streaming `.zst` path without a
 * compressor. Frame header: magic, descriptor 0 (no content size, not single segment), window descriptor 128 KiB.
 */
function zstdRawFrame(data: Uint8Array, blockSize = 1000): Uint8Array {
  const parts: number[] = [0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x38];
  for (let off = 0; off < data.length || off === 0; off += blockSize) {
    const block = data.subarray(off, Math.min(data.length, off + blockSize));
    const last = off + blockSize >= data.length ? 1 : 0;
    const header = last | (0 << 1) | (block.length << 3);
    parts.push(header & 0xff, (header >> 8) & 0xff, (header >> 16) & 0xff, ...block);
    if (data.length === 0) break;
  }
  return Uint8Array.from(parts);
}

describe('Lichess row checks', () => {
  const good = '0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,1580,74,96,2939,advantage endgame short,https://lichess.org/F8M8OS71#53,';

  it('parses a well-formed row and converts it to a Lichess-format puzzle', () => {
    const f = parseLichessFields(good.split(','));
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(filterReason(f.row, DEFAULT_LICHESS_FILTERS)).toBeNull();
    const c = lichessRowToPuzzle(f.row);
    expect(c).toMatchObject({
      ok: true,
      puzzle: {
        id: '0000D',
        moves: ['d3d6', 'f8d8', 'd6d8', 'f6d8'],
        rating: 1580,
        ratingDeviation: 74,
        popularity: 96,
        nbPlays: 2939,
        themes: ['advantage', 'endgame', 'short'],
        openingTags: [],
        source: 'lichess',
        gameUrl: 'https://lichess.org/F8M8OS71#53',
      },
    });
  });

  it('applies the filters in order popularity, plays, rating', () => {
    const f = parseLichessFields(good.split(','));
    if (!f.ok) throw new Error('fixture');
    expect(filterReason({ ...f.row, popularity: 79 }, DEFAULT_LICHESS_FILTERS)).toBe('popularity');
    expect(filterReason({ ...f.row, nbPlays: 299 }, DEFAULT_LICHESS_FILTERS)).toBe('plays');
    expect(filterReason(f.row, { ...DEFAULT_LICHESS_FILTERS, ratingMax: 1579 })).toBe('rating');
    expect(filterReason(f.row, { ...DEFAULT_LICHESS_FILTERS, ratingMin: 1580, ratingMax: 1580 })).toBeNull();
  });

  it('writes Postgres arrays and RFC 4180 fields for the seed CSV', () => {
    expect(pgArray(['e2e4', 'e7e5'])).toBe('{e2e4,e7e5}');
    expect(pgArray([])).toBe('{}');
    expect(pgArray(['a b', 'x"y'])).toBe('{"a b","x\\"y"}');
    expect(csvField(null)).toBe('');
    expect(csvField('')).toBe('""');
    expect(csvField('plain')).toBe('plain');
    expect(csvField('{a,b}')).toBe('"{a,b}"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    const f = parseLichessFields(good.split(','));
    if (!f.ok) throw new Error('fixture');
    const c = lichessRowToPuzzle(f.row);
    if (!c.ok) throw new Error('fixture');
    expect(seedCsvHeader()).toBe('id,fen,moves,rating,rating_deviation,themes,opening_tags,popularity,nb_plays,source,explanation,game_url\n');
    expect(seedCsvLine(c.puzzle)).toBe(
      '0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,"{d3d6,f8d8,d6d8,f6d8}",1580,74,"{advantage,endgame,short}","{}",96,2939,lichess,,https://lichess.org/F8M8OS71#53\n',
    );
  });
});

describe('importLichessPuzzles', () => {
  it('imports the fixture: skips and counts malformed and illegal rows, filters, drops unknown themes', async () => {
    const out = tempDir();
    const s = await importLichessPuzzles(options(out, { chunkSize: 4 }));
    expect(s.rows).toBe(18); // the empty line is not a row
    expect(s.imported).toBe(6);
    expect(s.bad).toBe(9);
    expect(s.badByReason).toEqual({
      columns: 1,
      fen: 1,
      'illegal-move': 1,
      rating: 1,
      'odd-moves': 1,
      duplicate: 1,
      'mate-theme': 1,
      id: 1,
      moves: 1,
    });
    expect(s.filtered).toEqual({ popularity: 1, plays: 1, rating: 1 });
    expect(s.unknownThemes).toEqual({ killBoxMate: 1 });
    expect(s.stoppedAtMax).toBe(false);
    expect(s.chunks).toBe(2);

    const manifest = puzzleBankManifestSchema.parse(JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')));
    expect(manifest.version).toMatch(/^lichess-[0-9a-f]{12}$/);
    expect(manifest.chunks.map((c) => [c.file, c.count, c.source])).toEqual([
      ['lichess-0001.json', 4, 'lichess'],
      ['lichess-0002.json', 2, 'lichess'],
    ]);
    for (const c of manifest.chunks) expect(sha256Hex(readFileSync(join(out, c.file), 'utf8'))).toBe(c.sha256);

    const puzzles = readChunks(out);
    expect(puzzles.map((p) => p.id)).toEqual(['00008', '0000D', '0009B', '000aY', 'fxMate1', 'fxScholar']);
    expect(puzzles.find((p) => p.id === 'fxMate1')!.themes).not.toContain('killBoxMate');
    expect(puzzles.find((p) => p.id === 'fxScholar')!.gameUrl).toBeUndefined();
    expect(puzzles.find((p) => p.id === '0009B')!.openingTags).toEqual(['Kings_Pawn_Game', 'Kings_Pawn_Game_Leonardis_Variation']);
    // Every imported puzzle passes the structural checks of the content validator.
    for (const p of puzzles) expect(checkPuzzleStructure(p).errors).toEqual([]);

    const csvLines = readFileSync(join(out, 'puzzles.csv'), 'utf8').trimEnd().split('\n');
    expect(csvLines).toHaveLength(7);
    expect(csvLines[0]).toBe(seedCsvHeader().trimEnd());
    expect(csvLines[1]!.startsWith('00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,"{f2g3,e6e7,b2b1,b3c1,b1c1,h6c1}",1913,')).toBe(true);
  });

  it('reads .csv.zst with streaming decompression and gives the same result', async () => {
    const dir = tempDir();
    const zst = join(dir, 'puzzles.csv.zst');
    writeFileSync(zst, zstdRawFrame(readFileSync(FIXTURE), 700));
    const a = await importLichessPuzzles(options(join(dir, 'a')));
    const b = await importLichessPuzzles(options(join(dir, 'b'), { input: zst }));
    expect(b).toMatchObject({ rows: a.rows, imported: a.imported, bad: a.bad, filtered: a.filtered });
    expect(b.manifest.version).toBe(a.manifest.version);
  });

  it('stops at --max and honours the rating filters', async () => {
    const s = await importLichessPuzzles(options(tempDir(), { max: 2 }));
    expect(s).toMatchObject({ imported: 2, stoppedAtMax: true, chunks: 1 });
    const r = await importLichessPuzzles(options(tempDir(), { ratingMin: 1000, ratingMax: 1600, minPopularity: 0, minPlays: 0 }));
    expect(r.imported).toBe(3); // 0000D (1580), 0009B (1144), 000aY (1386)
  });

  it('--append keeps other chunks of an existing manifest and replaces an earlier Lichess import', async () => {
    const out = tempDir();
    const seedText = '[]\n';
    writeFileSync(join(out, 'seed.json'), seedText);
    writeFileSync(
      join(out, 'manifest.json'),
      JSON.stringify({ version: 'seed-x', chunks: [{ file: 'seed.json', count: 0, source: 'seed', sha256: sha256Hex(seedText) }] }),
    );
    await importLichessPuzzles(options(out, { append: true, chunkSize: 1 }));
    const second = await importLichessPuzzles(options(out, { append: true, chunkSize: 3 }));
    expect(second.manifest.chunks.map((c) => c.file)).toEqual(['seed.json', 'lichess-0001.json', 'lichess-0002.json']);
    expect(readChunks(out)).toHaveLength(6);
    // Without --append the manifest lists only the new import.
    const plain = await importLichessPuzzles(options(out));
    expect(plain.manifest.chunks.map((c) => c.file)).toEqual(['lichess-0001.json']);
  });

  it('rejects a file with a different header and a missing input', async () => {
    const dir = tempDir();
    const wrong = join(dir, 'wrong.csv');
    writeFileSync(wrong, 'id,fen,moves\n1,2,3\n');
    await expect(importLichessPuzzles(options(join(dir, 'out'), { input: wrong }))).rejects.toThrow(LichessImportError);
    await expect(importLichessPuzzles(options(join(dir, 'out'), { input: join(dir, 'missing.csv') }))).rejects.toThrow(/not found/);
  });
});

describe('import-lichess CLI arguments', () => {
  it('parses the documented flags with defaults', () => {
    const o = parseCliArgs(['--input', 'x.csv.zst', '--out', 'out', '--min-popularity', '90', '--max', '1000', '--rating-max', '2000', '--append'])!;
    expect(o).toMatchObject({ minPopularity: 90, minPlays: 300, max: 1000, ratingMin: 0, ratingMax: 2000, chunkSize: 5000, append: true });
    expect(o.input.endsWith('x.csv.zst')).toBe(true);
    expect(parseCliArgs(['--help'])).toBeNull();
    expect(() => parseCliArgs(['--input', 'x.csv'])).toThrow(LichessImportError);
    expect(() => parseCliArgs(['--input', 'x.csv', '--out', 'o', '--max', 'many'])).toThrow(/integer/);
  });
});
