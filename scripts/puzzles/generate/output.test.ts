import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Puzzle } from '@/core/puzzles';
import { puzzleBankManifestSchema, puzzleChunkSchema } from '@/core/schemas';
import { checkPuzzleStructure } from '../lib/puzzleChecks';
import { sha256Hex } from '../lib/bankFiles';
import { explainPuzzle, generatedPuzzleId, toGeneratedPuzzle } from './assemble';
import { bankStats, csvField, meetsTargets, pgArray, puzzlesCsv, readBankPuzzles, writePuzzleBank, GENERATED_CHUNK_SIZE } from './output';
import type { RawPuzzle } from './selfplay';

const raw = (over: Partial<RawPuzzle> = {}): RawPuzzle => ({
  fen: '3r2k1/pp3p1p/6p1/8/4N3/7P/PPP2PP1/6K1 b - - 0 1',
  moves: ['d8d7', 'e4f6', 'g8f8', 'f6d7'],
  mateIn: null,
  findDepth: 3,
  finalCp: 450,
  firstScore: { type: 'cp', value: 480 },
  phase: 'endgame',
  themes: ['fork', 'endgame', 'short', 'advantage'],
  openingTags: [],
  game: 0,
  ply: 30,
  profiles: { opponent: 'novice', solver: 'club' },
  ...over,
});

describe('assemble', () => {
  it('builds a valid generated puzzle with a stored German explanation', () => {
    const p = toGeneratedPuzzle(raw());
    expect(p.id).toBe(generatedPuzzleId(p.fen, p.moves));
    expect(p.id).toMatch(/^gen-[0-9a-f]{10}$/);
    expect(p).toMatchObject({ source: 'generated', ratingDeviation: 80, themes: ['fork', 'endgame', 'short', 'advantage'] });
    expect(checkPuzzleStructure(p).errors).toEqual([]);
    expect(p.explanation!.plain).toMatch(/Gabel/);
    expect(p.explanation!.segments.filter((s) => s.type === 'move').every((s) => ['Nf6+', 'Kf8', 'Nxd7+', 'Nxd7'].includes(s.san))).toBe(true);
  });

  it('explains mates with the mate distance', () => {
    const e = explainPuzzle('4r2k/pp4pp/7N/8/2Q5/8/5PPP/6K1 b - - 0 1', ['e8d8', 'c4g8', 'd8g8', 'h6f7'], ['mateIn2', 'smotheredMate'], 2);
    expect(e.plain).toMatch(/Matt in 2 Zügen/);
    expect(e.source).toBe('rule');
  });
});

describe('CSV', () => {
  it('quotes fields and writes Postgres arrays and JSON', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "x"')).toBe('"say ""x"""');
    expect(csvField(null)).toBe('');
    expect(pgArray(['e2e4', 'e7e5'])).toBe('{e2e4,e7e5}');
    expect(pgArray(['a b', 'c"d'])).toBe('{"a b","c\\"d"}');
    expect(pgArray([])).toBe('{}');
    const p = toGeneratedPuzzle(raw());
    const csv = puzzlesCsv([p]).trim().split('\n');
    expect(csv[0]).toBe('id,fen,moves,rating,rating_deviation,themes,opening_tags,popularity,nb_plays,source,explanation,game_url');
    expect(csv[1]).toContain(`${p.id},${p.fen},"{d8d7,e4f6,g8f8,f6d7}",${p.rating},80,"{fork,endgame,short,advantage}",{},,,generated,"{""plain""`);
  });
});

describe('writePuzzleBank', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('keeps the seed chunk, writes lesson and generated chunks and a matching manifest', () => {
    dir = mkdtempSync(join(tmpdir(), 'zz-bank-'));
    const seedText = '[\n {"id":"seed-1"}\n]\n';
    writeFileSync(join(dir, 'seed.json'), seedText);
    writeFileSync(join(dir, 'generated-09.json'), '[]\n'); // stale chunk from an earlier run
    const base = toGeneratedPuzzle(raw());
    const generated: Puzzle[] = Array.from({ length: GENERATED_CHUNK_SIZE + 3 }, (_, i) => ({ ...base, id: `gen-${i}` }));
    const lesson: Puzzle = { ...base, id: 'lesson-x', source: 'lesson' };
    const manifest = writePuzzleBank(dir, generated, [lesson]);
    expect(puzzleBankManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.chunks.map((c) => [c.file, c.count, c.source])).toEqual([
      ['seed.json', 1, 'seed'],
      ['lessons.json', 1, 'lesson'],
      ['generated-01.json', GENERATED_CHUNK_SIZE, 'generated'],
      ['generated-02.json', 3, 'generated'],
    ]);
    expect(readFileSync(join(dir, 'seed.json'), 'utf8')).toBe(seedText);
    expect(existsSync(join(dir, 'generated-09.json'))).toBe(false);
    for (const c of manifest.chunks) expect(sha256Hex(readFileSync(join(dir, c.file), 'utf8'))).toBe(c.sha256);
    expect(puzzleChunkSchema.safeParse(JSON.parse(readFileSync(join(dir, 'generated-02.json'), 'utf8'))).success).toBe(true);
    expect(readBankPuzzles(dir)).toHaveLength(GENERATED_CHUNK_SIZE + 5);
    // Same content → same version.
    expect(writePuzzleBank(dir, generated, [lesson]).version).toBe(manifest.version);
  });
});

describe('bankStats', () => {
  it('counts rating bands and trainable themes', () => {
    const p = toGeneratedPuzzle(raw());
    const many = Array.from({ length: 10 }, (_, i) => ({ ...p, id: `g${i}`, rating: 300 }));
    const s = bankStats(many);
    expect(s.bands[0]).toEqual({ id: '≤600', count: 10, required: 150 });
    expect(s.trainableWithContent).toEqual(expect.arrayContaining(['fork', 'endgame']));
    expect(s.trainableWithContent).not.toContain('short');
    expect(meetsTargets(s, 5, 10)).toBe(false);
  });
});
