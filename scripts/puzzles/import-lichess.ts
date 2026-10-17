/**
 * `npm run puzzles:import-lichess -- --input <file.csv|file.csv.zst> --out <dir> [options]`
 *
 * Imports the official Lichess puzzle database (CC0, https://database.lichess.org/#puzzles) into the static puzzle
 * bank format of the app (manifest + chunk JSON, D-25) and writes a CSV for the Supabase seed. Every row is checked
 * with chess.js (via `@/lib/chess`); malformed and illegal rows are skipped and counted. Documentation:
 * `scripts/puzzles/README.md`. Needs a machine with access to database.lichess.org (not reachable from the build box).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_IMPORT_OPTIONS, importLichessPuzzles, LichessImportError, type LichessImportOptions } from './lib/lichessImport';

const USAGE = `Usage: npm run puzzles:import-lichess -- --input <file.csv|file.csv.zst> --out <dir> [options]

Options:
  --min-popularity <n>  minimum Lichess popularity, -100..100 (default ${DEFAULT_IMPORT_OPTIONS.minPopularity})
  --min-plays <n>       minimum number of plays (default ${DEFAULT_IMPORT_OPTIONS.minPlays})
  --max <n>             stop after n imported puzzles (default ${DEFAULT_IMPORT_OPTIONS.max})
  --rating-min <n>      lowest puzzle rating, inclusive (default ${DEFAULT_IMPORT_OPTIONS.ratingMin})
  --rating-max <n>      highest puzzle rating, inclusive (default ${DEFAULT_IMPORT_OPTIONS.ratingMax})
  --chunk-size <n>      puzzles per chunk file (default ${DEFAULT_IMPORT_OPTIONS.chunkSize})
  --csv <file>          Supabase seed CSV (default <out>/puzzles.csv)
  --append              keep the non-Lichess chunks (e.g. seed.json) of an existing manifest in <out>
  --help                show this help`;

function intOption(values: Record<string, string | boolean | undefined>, name: string, fallback: number): number {
  const raw = values[name];
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) throw new LichessImportError(`--${name} needs an integer (got "${String(raw)}")`);
  return Number(raw);
}

/** Parses the command line into import options (`null` = help requested). Throws `LichessImportError` on bad input. */
export function parseCliArgs(argv: string[]): LichessImportOptions | null {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string' },
      out: { type: 'string' },
      csv: { type: 'string' },
      'min-popularity': { type: 'string' },
      'min-plays': { type: 'string' },
      max: { type: 'string' },
      'rating-min': { type: 'string' },
      'rating-max': { type: 'string' },
      'chunk-size': { type: 'string' },
      append: { type: 'boolean' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) return null;
  if (!values.input || !values.out) throw new LichessImportError('--input and --out are required.');
  const opts: LichessImportOptions = {
    input: resolve(values.input),
    outDir: resolve(values.out),
    csvFile: values.csv ? resolve(values.csv) : undefined,
    minPopularity: intOption(values, 'min-popularity', DEFAULT_IMPORT_OPTIONS.minPopularity),
    minPlays: intOption(values, 'min-plays', DEFAULT_IMPORT_OPTIONS.minPlays),
    max: intOption(values, 'max', DEFAULT_IMPORT_OPTIONS.max),
    ratingMin: intOption(values, 'rating-min', DEFAULT_IMPORT_OPTIONS.ratingMin),
    ratingMax: intOption(values, 'rating-max', DEFAULT_IMPORT_OPTIONS.ratingMax),
    chunkSize: intOption(values, 'chunk-size', DEFAULT_IMPORT_OPTIONS.chunkSize),
    append: values.append ?? false,
  };
  if (opts.max < 1) throw new LichessImportError('--max must be at least 1.');
  if (opts.chunkSize < 1) throw new LichessImportError('--chunk-size must be at least 1.');
  if (opts.ratingMin > opts.ratingMax) throw new LichessImportError('--rating-min is larger than --rating-max.');
  return opts;
}

async function main(): Promise<void> {
  let opts: LichessImportOptions | null;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if (!opts) {
    console.log(USAGE);
    return;
  }
  const started = Date.now();
  try {
    const s = await importLichessPuzzles(opts);
    const reasons = Object.entries(s.badByReason).map(([k, v]) => `${k} ${v}`).join(', ');
    const unknown = Object.entries(s.unknownThemes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`rows read:      ${s.rows}`);
    console.log(`imported:       ${s.imported}${s.stoppedAtMax ? ` (stopped at --max ${opts.max})` : ''}`);
    console.log(`bad (skipped):  ${s.bad}${reasons ? ` – ${reasons}` : ''}`);
    console.log(`filtered:       popularity ${s.filtered.popularity}, plays ${s.filtered.plays}, rating ${s.filtered.rating}`);
    if (unknown) console.log(`unknown themes dropped: ${unknown}`);
    console.log(`chunks:         ${s.chunks} → ${opts.outDir} (manifest version ${s.manifest.version})`);
    console.log(`seed CSV:       ${s.csvFile}`);
    console.log(`time:           ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.error(e instanceof LichessImportError ? e.message : e);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
