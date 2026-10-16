/**
 * Builds the wave-1 seed bank from the hand-written sources (`sources.ts`):
 * - `public/data/puzzles/seed.json` + `public/data/puzzles/manifest.json` (D-25),
 * - `src/puzzles/demoPuzzles.json` (the 5 demo puzzles of `/puzzles/demo`, bundled with the app).
 *
 * Run: `npx tsx scripts/puzzles/lib/seed/build.ts`. Then validate with
 * `npm run validate:content -- --only puzzles` (Stockfish checks every solution move).
 * The build itself only runs the structural checks and fails on any error.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Puzzle } from '@/core/puzzles';
import { writeBank } from '../bankFiles';
import { checkPuzzleStructure } from '../puzzleChecks';
import { buildSeedPuzzle } from '../seedFormat';
import { DEMO_SOURCES, SEED_SOURCES } from './sources';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Minimum size of the seed bank and of its easy part (BACKLOG WP-03). */
export const SEED_MIN = { total: 40, easy: 20, easyMaxRating: 600 } as const;

/** Builds and checks all seed and demo puzzles (throws on illegal lines or structural errors). */
export function buildSeedPuzzles(): { seed: Puzzle[]; demo: Puzzle[] } {
  const seed = SEED_SOURCES.map(buildSeedPuzzle);
  const demo = DEMO_SOURCES.map(buildSeedPuzzle);
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const p of [...seed, ...demo]) {
    if (ids.has(p.id)) problems.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    for (const e of checkPuzzleStructure(p).errors) problems.push(`${p.id}: ${e.message}`);
  }
  const easy = seed.filter((p) => p.rating <= SEED_MIN.easyMaxRating).length;
  if (seed.length < SEED_MIN.total) problems.push(`seed bank has ${seed.length} puzzles (minimum ${SEED_MIN.total})`);
  if (easy < SEED_MIN.easy) problems.push(`seed bank has ${easy} puzzles rated ≤ ${SEED_MIN.easyMaxRating} (minimum ${SEED_MIN.easy})`);
  if (demo.length !== 5) problems.push(`demo needs exactly 5 puzzles (has ${demo.length})`);
  if (problems.length) throw new Error(`Seed build failed:\n${problems.join('\n')}`);
  return { seed, demo };
}

function main(): void {
  const { seed, demo } = buildSeedPuzzles();
  const bankDir = join(rootDir, 'public', 'data', 'puzzles');
  const manifest = writeBank(bankDir, 'seed', [{ file: 'seed.json', source: 'seed', puzzles: seed }], { pretty: true });
  writeFileSync(join(rootDir, 'src', 'puzzles', 'demoPuzzles.json'), `${JSON.stringify(demo, null, 1)}\n`);
  console.log(`seed bank: ${seed.length} puzzles, version ${manifest.version}; demo: ${demo.length} puzzles`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
