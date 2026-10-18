/**
 * Output of the generator:
 * - `public/data/puzzles/`: the existing seed chunk (`seed.json`, WP-03, kept byte for byte), `lessons.json` and
 *   `generated-NN.json` chunks plus `manifest.json` (D-25; the version changes exactly when a chunk changes);
 * - `supabase/seed/puzzles.csv`: every bank puzzle as a row of the `puzzles` table (`toRow.puzzle`), for
 *   `COPY public.puzzles FROM … WITH (FORMAT csv, HEADER true)` – arrays as Postgres array literals, the explanation
 *   as JSON;
 * - statistics per rating band and theme (printed by the CLI).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PUZZLE_THEMES, type Puzzle, type PuzzleBankManifest } from '@/core/puzzles';
import { toRow, type PuzzleRow } from '@/core/tables';
import { MANIFEST_FILE, manifestFromHashes, serializeChunk, sha256Hex } from '../lib/bankFiles';

/** Chunk file of the hand-written seed bank (kept as is). */
export const SEED_CHUNK = 'seed.json';
/** Chunk file of the lesson puzzles. */
export const LESSON_CHUNK = 'lessons.json';
/** Generated puzzles per chunk file. */
export const GENERATED_CHUNK_SIZE = 250;

/** Rating bands of the acceptance criteria (inclusive) and their minimum counts. */
export const RATING_BANDS = [
  { id: '≤600', min: 0, max: 600, required: 150 },
  { id: '601–1000', min: 601, max: 1000, required: 120 },
  { id: '1001–1400', min: 1001, max: 1400, required: 100 },
  { id: '1401–2000', min: 1401, max: 2000, required: 60 },
  { id: '>2000', min: 2001, max: 4000, required: 0 },
] as const;

/** A theme is trainable in the UI with at least this many puzzles (`THEME_MIN_PUZZLES` in `src/puzzles/themes.ts`). */
export const THEME_MIN_PUZZLES = 10;
/** Required number of trainable themes with enough puzzles. */
export const MIN_TRAINABLE_THEMES = 20;

/** Generated chunk file name (1-based, two digits). */
export function generatedChunkName(i: number): string {
  return `generated-${String(i + 1).padStart(2, '0')}.json`;
}

/** Writes the bank (seed chunk kept, lesson and generated chunks replaced, stale generated chunks removed). */
export function writePuzzleBank(dir: string, generated: readonly Puzzle[], lessons: readonly Puzzle[]): PuzzleBankManifest {
  mkdirSync(dir, { recursive: true });
  const entries: Array<PuzzleBankManifest['chunks'][number]> = [];
  const seedPath = join(dir, SEED_CHUNK);
  if (existsSync(seedPath)) {
    const text = readFileSync(seedPath, 'utf8');
    const count = (JSON.parse(text) as unknown[]).length;
    entries.push({ file: SEED_CHUNK, count, source: 'seed', sha256: sha256Hex(text) });
  }
  const write = (file: string, source: Puzzle['source'], puzzles: readonly Puzzle[]) => {
    const text = serializeChunk(puzzles);
    writeFileSync(join(dir, file), text);
    entries.push({ file, count: puzzles.length, source, sha256: sha256Hex(text) });
  };
  if (lessons.length > 0) write(LESSON_CHUNK, 'lesson', lessons);
  const names = new Set<string>();
  for (let i = 0; i * GENERATED_CHUNK_SIZE < generated.length; i++) {
    const name = generatedChunkName(i);
    names.add(name);
    write(name, 'generated', generated.slice(i * GENERATED_CHUNK_SIZE, (i + 1) * GENERATED_CHUNK_SIZE));
  }
  for (const f of readdirSync(dir)) if (/^generated-\d+\.json$/.test(f) && !names.has(f)) rmSync(join(dir, f));
  const manifest = manifestFromHashes('bank', entries);
  writeFileSync(join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Reads every chunk listed in the manifest of `dir`. */
export function readBankPuzzles(dir: string): Puzzle[] {
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8')) as PuzzleBankManifest;
  return manifest.chunks.flatMap((c) => JSON.parse(readFileSync(join(dir, c.file), 'utf8')) as Puzzle[]);
}

const CSV_COLUMNS: ReadonlyArray<keyof PuzzleRow> = [
  'id',
  'fen',
  'moves',
  'rating',
  'rating_deviation',
  'themes',
  'opening_tags',
  'popularity',
  'nb_plays',
  'source',
  'explanation',
  'game_url',
];

/** Postgres array literal of text values: `{a,"b c"}`. */
export function pgArray(values: readonly string[]): string {
  return `{${values.map((v) => (/^[A-Za-z0-9_+#=-]+$/.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)).join(',')}}`;
}

/** One CSV field (RFC 4180 quoting); `null` becomes an empty unquoted field (= SQL NULL in `COPY … CSV`). */
export function csvField(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) || s === '' ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of the `puzzles` table (header + one row per puzzle). */
export function puzzlesCsv(puzzles: readonly Puzzle[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const p of puzzles) {
    const row = toRow.puzzle(p);
    lines.push(
      CSV_COLUMNS.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return csvField(null);
        if (Array.isArray(v)) return csvField(pgArray(v as string[]));
        if (typeof v === 'object') return csvField(JSON.stringify(v));
        return csvField(v as string | number);
      }).join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Writes the CSV (directory created if needed). */
export function writePuzzlesCsv(path: string, puzzles: readonly Puzzle[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, puzzlesCsv(puzzles));
}

/** Bank statistics. */
export interface BankStats {
  total: number;
  bySource: Record<string, number>;
  bands: Array<{ id: string; count: number; required: number }>;
  themes: Array<{ id: string; count: number; trainable: boolean }>;
  /** Trainable themes with ≥ `THEME_MIN_PUZZLES` puzzles (shown in Themen-Training). */
  trainableWithContent: string[];
  /** Trainable themes below `THEME_MIN_PUZZLES` (hidden in Themen-Training while the bank is this small). */
  trainableBelowMinimum: string[];
}

/** Statistics of a set of puzzles. */
export function bankStats(puzzles: readonly Puzzle[]): BankStats {
  const bySource: Record<string, number> = {};
  const themeCount = new Map<string, number>();
  for (const p of puzzles) {
    bySource[p.source] = (bySource[p.source] ?? 0) + 1;
    for (const t of new Set(p.themes)) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);
  }
  const bands = RATING_BANDS.map((b) => ({ id: b.id, required: b.required, count: puzzles.filter((p) => p.rating >= b.min && p.rating <= b.max).length }));
  const themes = PUZZLE_THEMES.map((t) => ({ id: t.id, count: themeCount.get(t.id) ?? 0, trainable: t.trainable }));
  const trainable = themes.filter((t) => t.trainable);
  return {
    total: puzzles.length,
    bySource,
    bands,
    themes,
    trainableWithContent: trainable.filter((t) => t.count >= THEME_MIN_PUZZLES).map((t) => t.id),
    trainableBelowMinimum: trainable.filter((t) => t.count < THEME_MIN_PUZZLES).map((t) => t.id),
  };
}

/** Whether a set of puzzles meets the acceptance criteria on size, rating bands and trainable themes. */
export function meetsTargets(stats: BankStats, target: number, generatedCount: number): boolean {
  return generatedCount >= target && stats.bands.every((b) => b.count >= b.required) && stats.trainableWithContent.length >= MIN_TRAINABLE_THEMES;
}

/** Human-readable statistics (for the CLI). */
export function formatStats(stats: BankStats): string {
  const lines = [`Puzzles: ${stats.total} (${Object.entries(stats.bySource).map(([s, n]) => `${s} ${n}`).join(', ')})`, 'Rating bands:'];
  for (const b of stats.bands) lines.push(`  ${b.id.padEnd(10)} ${String(b.count).padStart(5)}${b.required ? ` (min ${b.required})` : ''}`);
  lines.push('Themes:');
  for (const t of stats.themes.filter((x) => x.count > 0).sort((a, b) => b.count - a.count)) {
    lines.push(`  ${t.id.padEnd(20)} ${String(t.count).padStart(5)}${t.trainable ? '' : ' (meta)'}`);
  }
  lines.push(`Trainable themes with ≥ ${THEME_MIN_PUZZLES} puzzles: ${stats.trainableWithContent.length} (min ${MIN_TRAINABLE_THEMES})`);
  lines.push(`Hidden in Themen-Training (< ${THEME_MIN_PUZZLES} puzzles): ${stats.trainableBelowMinimum.join(', ') || '–'}`);
  return lines.join('\n');
}
