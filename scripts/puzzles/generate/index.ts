/**
 * `npm run puzzles:generate` – builds the puzzle bank with Stockfish (PRD P0-04, P0-05, P0-06; data model `puzzles`).
 *
 * Usage:
 *   npm run puzzles:generate                       # seed 1, ≥ 700 generated puzzles, 3 worker processes
 *   npm run puzzles:generate -- --seed 7 --target 900 --workers 4
 *   npm run puzzles:generate -- --dry-run          # statistics only, no files written
 * then: npm run validate:content -- --only puzzles  (Stockfish re-checks every solver move, results are cached)
 *
 * Options: `--seed <n>` (default 1), `--target <n>` generated puzzles (default 700), `--workers <n>` worker processes
 * (default min(3, CPUs − 1); 0 = in-process), `--max-games <n>` (default 6000), `--no-cache` (replay every game
 * instead of reusing `.cache/puzzles-generate/`), `--dry-run`.
 *
 * Output: `public/data/puzzles/` (the WP-03 seed chunk `seed.json` is kept; `lessons.json`, `generated-NN.json` and
 * `manifest.json` are rewritten) and `supabase/seed/puzzles.csv` (all bank puzzles as rows of the `puzzles` table).
 * The run is deterministic for a given seed and config: same seed → byte-identical files.
 *
 * Method
 * 1. Source positions: self-play games of Stockfish 19 lite (`@/lib/uci/node`) at mixed strengths (four player
 *    profiles from "novice" – random moves, careless when ahead – to "strong"), each game starting from a random
 *    line through the Lichess opening book (`openings.json`, CC0) – see `selfplay.ts`, `openings.ts`.
 * 2. Detection (`detect.ts`): after an opponent mistake (the solver gains ≥ 0.15 expected points or gets a forced
 *    mate) the side to move has a forced mate in 1–5 without an equally fast alternative, or a unique winning move:
 *    EP(best) ≥ 0.70 and EP(best) − EP(second) ≥ 0.25 at depth 18, MultiPV 2 (cheap screen at depth 10 first).
 * 3. Solution (`solution.ts`): extended while every solver move stays unique by ≥ 0.15 EP (validator: 0.10) or is
 *    the only fastest mate; the opponent answers with the engine's best defence; an advantage line ends when the
 *    next solver move is not unique or the position has turned into a forced mate (the advantage is settled).
 *    Lichess format: `fen` is the position before the opponent's mistake, `moves[0]` is that mistake.
 * 4. Second opinion: the exact validator check (`checkPuzzleWithEngine`, depth 18) on a separate engine; failures
 *    are dropped.
 * 5. Themes (`tagger.ts`): WP-02 motif detectors confirmed by the line, mate distance and mate patterns, length,
 *    phase (Lichess divider) and endgame type by material; opening tags (Lichess style) for puzzles before ply 40.
 * 6. Rating (`rating.ts`): heuristic from solution length, mate distance, the depth at which Stockfish first keeps
 *    the move, the number of legal moves and a forcing vs. quiet first move; one-move mates and hanging pieces are
 *    calibrated to 200–600. Deviation 80.
 * 7. Explanation (`assemble.ts`): `explainRuleBased({ kind: 'puzzle', … })` on `buildFacts`, stored with the puzzle
 *    (1–3 German sentences, "du", only solution moves); the validator's structure checks must pass.
 * 8. Lesson puzzles (`lessons.ts`): every flagged "Finde den Zug" exercise (`puzzle: { rating, themes }`) becomes a
 *    `lesson-…` puzzle with a constructed legal opponent move before it; it must pass the same engine check.
 * The run stops at the first game index from which the generated puzzles reach `--target`, every rating band of
 * WP-10 (≤ 600: 150, 601–1000: 120, 1001–1400: 100, 1401–2000: 60) and ≥ 20 trainable themes with ≥ 10 puzzles.
 *
 * Themes: Themen-Training lists only trainable themes with ≥ 10 puzzles in the bank (`THEME_MIN_PUZZLES` in
 * `src/puzzles/themes.ts`); the run prints which trainable themes stay below that and are therefore hidden.
 *
 * Licences: Stockfish (GPL-3.0, used as a tool – no engine code in the output); opening book from
 * lichess-org/chess-openings (CC0-1.0); tagging rules re-implemented after lichess-puzzler (AGPL-3.0, no code
 * copied). The generated puzzles are our own content.
 */
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Puzzle } from '@/core/puzzles';
import { loadOpeningBook } from '@/analysis';
import { positionKey } from '@/lib/chess';
import { checkPuzzleStructure, checkPuzzleWithEngine } from '../lib/puzzleChecks';
import { solverStart, toGeneratedPuzzle } from './assemble';
import { createGeneratorEngine } from './engine';
import { isSkip, lessonPuzzle, readLessonExercises } from './lessons';
import { bankStats, formatStats, meetsTargets, MIN_TRAINABLE_THEMES, SEED_CHUNK, writePuzzleBank, writePuzzlesCsv, type BankStats } from './output';
import { cacheDir, createInProcessRunner, createWorkerPool, runGamesInOrder } from './pool';
import { DEFAULT_GENERATOR_CONFIG, type GameResult, type GeneratorConfig } from './selfplay';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Repo-relative outputs. */
export const BANK_DIR = 'public/data/puzzles';
export const CSV_FILE = 'supabase/seed/puzzles.csv';

/** Parsed command line. */
export interface CliOptions {
  seed: number;
  target: number;
  workers: number;
  maxGames: number;
  cache: boolean;
  dryRun: boolean;
}

/** Parses `process.argv`-style arguments. */
export function parseArgs(argv: readonly string[]): CliOptions {
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (name: string, fallback: number): number => {
    const v = value(name);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} needs a non-negative integer, got "${v}"`);
    return n;
  };
  return {
    seed: num('--seed', 1),
    target: num('--target', 700),
    workers: num('--workers', Math.max(1, Math.min(3, cpus().length - 1))),
    maxGames: num('--max-games', 6000),
    cache: !argv.includes('--no-cache'),
    dryRun: argv.includes('--dry-run'),
  };
}

/** Counters of a run. */
export interface RunCounters {
  games: number;
  plies: number;
  mistakes: number;
  candidates: number;
  confirmed: number;
  rejected: Record<string, number>;
}

/** Accumulates games (in index order) into generated puzzles; `done` once the targets are met. */
export function createAccumulator(target: number, fixed: readonly Puzzle[]) {
  const generated: Puzzle[] = [];
  const seen = new Set(fixed.map((p) => positionKey(solverStart(p.fen, p.moves))));
  const counters: RunCounters = { games: 0, plies: 0, mistakes: 0, candidates: 0, confirmed: 0, rejected: {} };
  const reject = (reason: string) => {
    counters.rejected[reason] = (counters.rejected[reason] ?? 0) + 1;
  };
  let stats: BankStats = bankStats([]);
  let themeStats: BankStats = bankStats(fixed);
  return {
    generated,
    counters,
    stats: () => stats,
    themeStats: () => themeStats,
    /** Adds a game; returns whether the targets are met. */
    add(result: GameResult): boolean {
      counters.games++;
      counters.plies += result.stats.plies;
      counters.mistakes += result.stats.mistakes;
      counters.candidates += result.stats.candidates;
      counters.confirmed += result.stats.confirmed;
      for (const [k, v] of Object.entries(result.stats.rejected)) counters.rejected[k] = (counters.rejected[k] ?? 0) + v;
      for (const raw of result.puzzles) {
        const key = positionKey(solverStart(raw.fen, raw.moves));
        if (seen.has(key)) {
          reject('duplicate_position');
          continue;
        }
        seen.add(key);
        const puzzle = toGeneratedPuzzle(raw);
        if (checkPuzzleStructure(puzzle).errors.length > 0) {
          reject('structure');
          continue;
        }
        generated.push(puzzle);
      }
      stats = bankStats(generated);
      themeStats = bankStats([...fixed, ...generated]);
      return meetsTargets({ ...stats, trainableWithContent: themeStats.trainableWithContent }, target, generated.length);
    },
  };
}

function readSeedPuzzles(): Puzzle[] {
  try {
    return JSON.parse(readFileSync(join(rootDir, BANK_DIR, SEED_CHUNK), 'utf8')) as Puzzle[];
  } catch {
    return [];
  }
}

/** Builds the lesson puzzles and checks them like the validator (structure + engine). */
async function buildLessonPuzzles(): Promise<{ puzzles: Puzzle[]; skipped: Array<{ id: string; reason: string }> }> {
  const engine = createGeneratorEngine('perPuzzle');
  const puzzles: Puzzle[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  try {
    for (const ex of readLessonExercises(rootDir)) {
      const r = lessonPuzzle(ex);
      if (isSkip(r)) {
        skipped.push(r);
        continue;
      }
      const structure = checkPuzzleStructure(r);
      if (structure.errors.length > 0) {
        skipped.push({ id: r.id, reason: structure.errors.map((e) => e.message).join('; ') });
        continue;
      }
      engine.reset();
      const check = await checkPuzzleWithEngine(r, engine.service);
      if (check.errors.length > 0) {
        skipped.push({ id: r.id, reason: check.errors.map((e) => e.message).join('; ') });
        continue;
      }
      puzzles.push(r);
    }
  } finally {
    engine.dispose();
  }
  return { puzzles, skipped };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const config: GeneratorConfig = DEFAULT_GENERATOR_CONFIG;
  const t0 = Date.now();
  console.log(`puzzles:generate – seed ${opts.seed}, target ${opts.target}, ${opts.workers} worker(s)`);

  const seed = readSeedPuzzles();
  const lessons = await buildLessonPuzzles();
  console.log(`Lesson puzzles: ${lessons.puzzles.length} exported, ${lessons.skipped.length} skipped`);
  for (const s of lessons.skipped) console.log(`  skipped ${s.id}: ${s.reason}`);

  const acc = createAccumulator(opts.target, [...seed, ...lessons.puzzles]);
  const book = await loadOpeningBook();
  const runner = opts.workers > 0 ? createWorkerPool(opts.workers, opts.seed, config) : createInProcessRunner(opts.seed, config, book);
  let done = false;
  let games: number;
  try {
    games = await runGamesInOrder({
      runner,
      window: Math.max(1, opts.workers) * 3,
      maxGames: opts.maxGames,
      cache: opts.cache ? cacheDir(rootDir, opts.seed, config) : null,
      consume(result) {
        done = acc.add(result);
        if (acc.counters.games % 50 === 0 || done) {
          const bands = acc.stats().bands.map((b) => `${b.id}:${b.count}`).join(' ');
          const minutes = ((Date.now() - t0) / 60000).toFixed(1);
          console.log(`  ${acc.counters.games} games, ${acc.generated.length} puzzles [${bands}] themes ${acc.themeStats().trainableWithContent.length}/${MIN_TRAINABLE_THEMES} – ${minutes} min`);
        }
        return done;
      },
    });
  } finally {
    runner.close();
  }
  const c = acc.counters;
  console.log(`Games: ${games}, plies ${c.plies}, mistakes ${c.mistakes}, candidates ${c.candidates}, confirmed ${c.confirmed}`);
  console.log(`Rejected: ${Object.entries(c.rejected).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '–'}`);
  if (!done) console.warn(`WARNING: targets not met after ${games} games (raise --max-games).`);

  const bank = [...seed, ...lessons.puzzles, ...acc.generated];
  console.log('\nGenerated puzzles');
  console.log(formatStats(acc.stats()));
  console.log('\nWhole bank (seed + lesson + generated)');
  console.log(formatStats(bankStats(bank)));
  if (opts.dryRun) {
    console.log('\n--dry-run: no files written.');
  } else {
    const manifest = writePuzzleBank(join(rootDir, BANK_DIR), acc.generated, lessons.puzzles);
    writePuzzlesCsv(join(rootDir, CSV_FILE), bank);
    console.log(`\nWrote ${BANK_DIR}/ (manifest ${manifest.version}, ${manifest.chunks.length} chunks) and ${CSV_FILE} (${bank.length} rows).`);
  }
  console.log(`Done in ${((Date.now() - t0) / 60000).toFixed(1)} min.`);
  if (!done) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
