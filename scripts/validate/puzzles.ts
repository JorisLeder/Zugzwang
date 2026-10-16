/**
 * Puzzle validator (BACKLOG WP-03, CONSTRAINTS §1/§3, D-12, D-24, D-25). Run with
 * `npm run validate:content -- --only puzzles` (`--quick` skips the Stockfish checks).
 *
 * Checks every chunk listed in `public/data/puzzles/manifest.json` (file exists, sha256 and count match the manifest,
 * no duplicate ids), the demo puzzles bundled with the app (`src/puzzles/demoPuzzles.json`) and the shared test
 * fixtures (`FIXTURE_PUZZLES`). Per puzzle: zod schema, legal FEN, all moves legal in sequence, solver to move after
 * `moves[0]`, rating 100–3000, known theme ids, explanation (1–3 sentences, only solution moves) unless the source is
 * `lichess`, and – with the engine – at every solver ply: immediate mate, or the fastest mate without an equally fast
 * alternative, or the engine's best move by ≥ 0.10 expected points (depth 18, MultiPV 2); `mateInN` themes must match.
 * Engine results are cached per puzzle line in `.cache/validate/`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_PUZZLES } from '@/core/testing';
import { puzzleBankManifestSchema } from '@/core/schemas';
import type { Puzzle, PuzzleBankManifest } from '@/core/puzzles';
import { MANIFEST_FILE, sha256Hex } from '../puzzles/lib/bankFiles';
import {
  checkPuzzleStructure,
  checkPuzzleWithEngine,
  PUZZLE_CHECKS_VERSION,
  PUZZLE_ENGINE_DEPTH,
  type PuzzleCheckResult,
} from '../puzzles/lib/puzzleChecks';
import type { ValidationContext, ValidationIssue, ValidationReport } from '../lib/validation';

/** Bump when the checks change (part of the cache key). */
export const VALIDATOR_VERSION = `validate-puzzles-1/${PUZZLE_CHECKS_VERSION}/d${PUZZLE_ENGINE_DEPTH}`;

/** Repo-relative locations. */
export const PUZZLE_BANK_DIR = 'public/data/puzzles';
export const DEMO_PUZZLES_FILE = 'src/puzzles/demoPuzzles.json';

/** A group of raw puzzles to check, with the file they come from. */
export interface PuzzleGroup {
  file: string;
  items: unknown[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Reads the manifest and its chunks; file-level problems become errors. */
export function readBank(rootDir: string, bankDir = PUZZLE_BANK_DIR): { groups: PuzzleGroup[]; errors: ValidationIssue[]; manifest: PuzzleBankManifest | null } {
  const errors: ValidationIssue[] = [];
  const manifestFile = `${bankDir}/${MANIFEST_FILE}`;
  const manifestPath = join(rootDir, manifestFile);
  if (!existsSync(manifestPath)) return { groups: [], errors: [{ file: manifestFile, message: 'Manifest fehlt.' }], manifest: null };
  let manifest: PuzzleBankManifest;
  try {
    const parsed = puzzleBankManifestSchema.safeParse(readJson(manifestPath));
    if (!parsed.success) {
      return { groups: [], errors: [{ file: manifestFile, message: `Ungültiges Manifest: ${parsed.error.message}` }], manifest: null };
    }
    manifest = parsed.data;
  } catch (e) {
    return { groups: [], errors: [{ file: manifestFile, message: `Manifest ist kein gültiges JSON: ${String(e)}` }], manifest: null };
  }
  const groups: PuzzleGroup[] = [];
  for (const chunk of manifest.chunks) {
    const file = `${bankDir}/${chunk.file}`;
    const path = join(rootDir, file);
    if (!existsSync(path)) {
      errors.push({ file, message: 'Datei aus dem Manifest fehlt.' });
      continue;
    }
    const text = readFileSync(path, 'utf8');
    if (sha256Hex(text) !== chunk.sha256) errors.push({ file, message: 'sha256 passt nicht zum Manifest (Bank neu bauen).' });
    let items: unknown;
    try {
      items = JSON.parse(text) as unknown;
    } catch (e) {
      errors.push({ file, message: `Kein gültiges JSON: ${String(e)}` });
      continue;
    }
    if (!Array.isArray(items)) {
      errors.push({ file, message: 'Ein Chunk muss ein Array von Puzzles sein.' });
      continue;
    }
    if (items.length !== chunk.count) errors.push({ file, message: `Manifest nennt ${chunk.count} Puzzles, die Datei hat ${items.length}.` });
    for (const item of items) {
      const source = typeof item === 'object' && item !== null && 'source' in item ? (item as { source: unknown }).source : undefined;
      if (source !== chunk.source) {
        errors.push({ file, id: idOf(item), message: `Quelle „${String(source)}“ passt nicht zum Manifest („${chunk.source}“).` });
      }
    }
    groups.push({ file, items });
  }
  return { groups, errors, manifest };
}

function idOf(item: unknown): string | undefined {
  return typeof item === 'object' && item !== null && 'id' in item ? String((item as { id: unknown }).id) : undefined;
}

/** Cache key content: only what the engine checks depend on. */
export function engineCacheContent(p: Pick<Puzzle, 'fen' | 'moves' | 'themes'>): string {
  return JSON.stringify({ fen: p.fen, moves: p.moves, themes: [...p.themes].sort() });
}

/** Checks groups of puzzles (structure, then engine unless `ctx.quick`). */
export async function validatePuzzleGroups(groups: readonly PuzzleGroup[], ctx: ValidationContext): Promise<ValidationReport> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const seen = new Map<string, string>();
  let checked = 0;
  for (const group of groups) {
    for (const raw of group.items) {
      checked++;
      const { puzzle, errors: e, warnings: w } = checkPuzzleStructure(raw);
      errors.push(...e.map((i) => ({ file: group.file, ...i })));
      warnings.push(...w.map((i) => ({ file: group.file, ...i })));
      if (!puzzle) continue;
      const other = seen.get(puzzle.id);
      if (other !== undefined) errors.push({ file: group.file, id: puzzle.id, message: `Doppelte Puzzle-ID (auch in ${other}).` });
      seen.set(puzzle.id, group.file);
      if (ctx.quick || e.length > 0) continue;
      const key = ctx.cache.key(engineCacheContent(puzzle), VALIDATOR_VERSION);
      const result = await ctx.cache.getOrCompute<PuzzleCheckResult>(key, async () => checkPuzzleWithEngine(puzzle, await ctx.engine()));
      errors.push(...result.errors.map((i) => ({ file: group.file, id: puzzle.id, message: i.message })));
      warnings.push(...result.warnings.map((i) => ({ file: group.file, id: puzzle.id, message: i.message })));
    }
  }
  return { name: 'puzzles', checked, errors, warnings };
}

/** Default export for `validate:content`. */
export default async function validatePuzzles(ctx: ValidationContext): Promise<ValidationReport> {
  const bank = readBank(ctx.rootDir);
  const groups: PuzzleGroup[] = [...bank.groups];
  const demoPath = join(ctx.rootDir, DEMO_PUZZLES_FILE);
  if (existsSync(demoPath)) {
    const demo = readJson(demoPath);
    if (Array.isArray(demo) && demo.length === 5) groups.push({ file: DEMO_PUZZLES_FILE, items: demo });
    else bank.errors.push({ file: DEMO_PUZZLES_FILE, message: 'Die Demo braucht genau 5 Puzzles.' });
  } else {
    bank.errors.push({ file: DEMO_PUZZLES_FILE, message: 'Demo-Puzzles fehlen.' });
  }
  groups.push({ file: 'src/core/testing/fixtures.ts', items: FIXTURE_PUZZLES });
  const report = await validatePuzzleGroups(groups, ctx);
  ctx.log.info(`puzzles: ${report.checked} Puzzles geprüft${ctx.quick ? ' (ohne Engine)' : ''}`);
  return { ...report, errors: [...bank.errors, ...report.errors] };
}
