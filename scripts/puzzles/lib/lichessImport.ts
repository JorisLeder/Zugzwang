/**
 * Streaming import of the Lichess puzzle CSV (`.csv` or `.csv.zst`) into the static puzzle bank format (D-25) plus
 * a CSV for the Supabase seed. Used by `scripts/puzzles/import-lichess.ts`; row checks in `lichessCsv.ts`.
 *
 * Memory stays flat: rows are parsed one by one (`csv-parse` stream, `fzstd` streaming decompression), accepted
 * puzzles are buffered only until a chunk is full, then the chunk file is written and its sha256 kept for the manifest.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, type WriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import { Decompress } from 'fzstd';
import type { Puzzle, PuzzleBankManifest } from '@/core/puzzles';
import { puzzleBankManifestSchema } from '@/core/schemas';
import { MANIFEST_FILE, manifestFromHashes, serializeChunk, sha256Hex } from './bankFiles';
import {
  DEFAULT_LICHESS_FILTERS,
  filterReason,
  isLichessHeader,
  LICHESS_COLUMNS,
  lichessRowToPuzzle,
  parseLichessFields,
  seedCsvHeader,
  seedCsvLine,
  type BadRowReason,
  type FilterReason,
  type LichessFilterOptions,
} from './lichessCsv';

/** Options of `importLichessPuzzles`. */
export interface LichessImportOptions extends LichessFilterOptions {
  /** `.csv` or `.csv.zst` file. */
  input: string;
  /** Output directory for `manifest.json` and `lichess-0001.json` … */
  outDir: string;
  /** Seed CSV for Supabase (default `<outDir>/puzzles.csv`). */
  csvFile?: string;
  /** Stop after this many accepted puzzles. */
  max: number;
  /** Puzzles per chunk file. */
  chunkSize: number;
  /** Keep the non-Lichess chunks (e.g. `seed.json`) of an existing manifest in `outDir`. */
  append: boolean;
}

/** Defaults of the CLI. */
export const DEFAULT_IMPORT_OPTIONS = { ...DEFAULT_LICHESS_FILTERS, max: 500_000, chunkSize: 5_000, append: false } as const;

/** Counters reported after the import. */
export interface LichessImportStats {
  /** Data rows read (header excluded, CSV syntax errors included). */
  rows: number;
  imported: number;
  /** Malformed or illegal rows, skipped. */
  bad: number;
  badByReason: Partial<Record<BadRowReason, number>>;
  /** Well-formed rows left out by the filters. */
  filtered: Record<FilterReason, number>;
  /** Themes dropped because `PUZZLE_THEMES` does not know them (count per theme). */
  unknownThemes: Record<string, number>;
  /** The import stopped at `--max`. */
  stoppedAtMax: boolean;
  chunks: number;
  manifest: PuzzleBankManifest;
  csvFile: string;
}

/** Thrown for problems that stop the whole import (missing file, wrong header). */
export class LichessImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LichessImportError';
  }
}

const CHUNK_FILE = (n: number) => `lichess-${String(n).padStart(4, '0')}.json`;
const CHUNK_FILE_RE = /^lichess-\d{4,}\.json$/;

/** Decompresses a zstd byte stream chunk by chunk. */
export async function* zstdDecompressStream(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  const out: Uint8Array[] = [];
  const d = new Decompress((data) => {
    out.push(data);
  });
  for await (const chunk of source) {
    d.push(chunk);
    while (out.length) yield out.shift()!;
  }
  d.push(new Uint8Array(0), true);
  while (out.length) yield out.shift()!;
}

/** The raw byte stream of the input (decompressed for `.zst`). */
export function openInput(path: string): Readable {
  if (!existsSync(path)) throw new LichessImportError(`Input file not found: ${path}`);
  const file = createReadStream(path);
  return path.endsWith('.zst') ? Readable.from(zstdDecompressStream(file)) : file;
}

function readExistingManifest(outDir: string): PuzzleBankManifest | null {
  const path = join(outDir, MANIFEST_FILE);
  if (!existsSync(path)) return null;
  const parsed = puzzleBankManifestSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new LichessImportError(`Existing manifest is invalid: ${path}`);
  return parsed.data;
}

function writeLine(stream: WriteStream, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stream.write(line)) resolve();
    else {
      stream.once('drain', resolve);
      stream.once('error', reject);
    }
  });
}

function closeStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
}

/** Imports the Lichess CSV (see the file header). */
export async function importLichessPuzzles(opts: LichessImportOptions): Promise<LichessImportStats> {
  const csvFile = opts.csvFile ?? join(opts.outDir, 'puzzles.csv');
  const input = openInput(opts.input);
  const kept = opts.append ? (readExistingManifest(opts.outDir)?.chunks.filter((c) => c.source !== 'lichess') ?? []) : [];

  let csv: WriteStream | null = null;
  /** Called once the header is verified: removes chunks of an earlier import and starts the seed CSV. */
  const start = async (): Promise<WriteStream> => {
    mkdirSync(opts.outDir, { recursive: true });
    for (const f of readdirSync(opts.outDir)) if (CHUNK_FILE_RE.test(f)) rmSync(join(opts.outDir, f));
    mkdirSync(dirname(csvFile), { recursive: true });
    const stream = createWriteStream(csvFile);
    await writeLine(stream, seedCsvHeader());
    return stream;
  };

  const stats: Omit<LichessImportStats, 'manifest' | 'csvFile' | 'chunks'> = {
    rows: 0,
    imported: 0,
    bad: 0,
    badByReason: {},
    filtered: { popularity: 0, plays: 0, rating: 0 },
    unknownThemes: {},
    stoppedAtMax: false,
  };
  const bad = (reason: BadRowReason) => {
    stats.bad++;
    stats.badByReason[reason] = (stats.badByReason[reason] ?? 0) + 1;
  };

  const written: Array<{ file: string; source: Puzzle['source']; count: number; sha256: string }> = [];
  let buffer: Puzzle[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const file = CHUNK_FILE(written.length + 1);
    const text = serializeChunk(buffer);
    writeFileSync(join(opts.outDir, file), text);
    written.push({ file, source: 'lichess', count: buffer.length, sha256: sha256Hex(text) });
    buffer = [];
  };

  // The Lichess CSV never quotes fields (none contains a comma), so quoting is off: every line is exactly one row and a
  // stray quote character only breaks its own row instead of swallowing the rest of the file.
  const parser = parse({
    quote: false,
    relax_column_count: true,
    skip_empty_lines: true,
    skip_records_with_error: true,
    on_skip: () => {
      stats.rows++;
      bad('csv');
      return undefined;
    },
  });
  input.on('error', (e) => parser.destroy(e));
  input.pipe(parser);

  const seen = new Set<string>();
  let header = true;
  try {
    for await (const record of parser as AsyncIterable<string[]>) {
      if (header) {
        header = false;
        if (!isLichessHeader(record)) throw new LichessImportError(`Unexpected header. Expected exactly: ${LICHESS_COLUMNS.join(',')}`);
        csv = await start();
        continue;
      }
      stats.rows++;
      const fields = parseLichessFields(record);
      if (!fields.ok) {
        bad(fields.reason);
        continue;
      }
      const reason = filterReason(fields.row, opts);
      if (reason) {
        stats.filtered[reason]++;
        continue;
      }
      if (seen.has(fields.row.id)) {
        bad('duplicate');
        continue;
      }
      const converted = lichessRowToPuzzle(fields.row);
      if (!converted.ok) {
        bad(converted.reason);
        continue;
      }
      seen.add(converted.puzzle.id);
      for (const t of converted.unknownThemes) stats.unknownThemes[t] = (stats.unknownThemes[t] ?? 0) + 1;
      buffer.push(converted.puzzle);
      await writeLine(csv!, seedCsvLine(converted.puzzle));
      stats.imported++;
      if (buffer.length >= opts.chunkSize) flush();
      if (stats.imported >= opts.max) {
        stats.stoppedAtMax = true;
        break;
      }
    }
  } finally {
    input.unpipe(parser);
    input.destroy();
    parser.destroy();
    if (csv) await closeStream(csv);
  }
  if (header) throw new LichessImportError('The input file is empty.');
  flush();

  const manifest = manifestFromHashes('lichess', [...kept, ...written]);
  writeFileSync(join(opts.outDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...stats, chunks: written.length, manifest, csvFile };
}
