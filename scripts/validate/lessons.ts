/**
 * Lesson validator (WP-07, PRD P0-13/P0-04, Lektionen §4). Run with `npm run validate:content -- --only lessons`
 * (`--quick` skips the Stockfish checks). Checks `content/lessons/catalog.json` and every
 * `content/lessons/<courseId>/<lessonId>.json`; the checks live in `scripts/content/lessonChecks.ts`.
 *
 * ## Authoring rules for lessons (enforced here; errors fail the build, warnings are shown)
 *
 * Files and ids
 * - `catalog.json` lists every course of the PRD Lehrplan; courses without content have `status: "planned"` and no
 *   lessons. Ids are stable kebab-case – never rename an id that shipped (progress is stored by id); bump `version`
 *   instead when a change affects progress.
 * - A lesson lives in `content/lessons/<courseId>/<lessonId>.json`; `id`/`courseId` equal the path. `order` is the
 *   1-based position in `lessonIds`; the course test (`kind: "course_test"`, `testLessonId`) comes last. The Stufe-0
 *   skip test (`kind: "skip_test"`, `order: 0`) lives in a Stufe-0 course folder and is not listed in the catalog.
 *
 * Structure (every lesson and test)
 * - 5–12 steps, at least 3 step types, the first step is an explanation, the last two steps are exercises
 *   ("Finde den Zug" or Quiz) – the short test of the lesson.
 * - Every available course has at least one Ausspielen step and a course test; "Grundmatts" contains K+D gegen K and
 *   K+T gegen K as Ausspielen.
 * - One idea per step. Explanation → Demo → guided exercise → free exercises is the usual pattern.
 *
 * Language
 * - German, the learner is "du". Short sentences (warning above 22 words). Positive, concrete, no jokes about
 *   mistakes.
 * - DSB terms: Schach, Schachmatt/Matt, Patt, Remis, Rochade, en passant (im Vorbeigehen schlagen), Umwandlung,
 *   Remis durch dreimalige Stellungswiederholung, 50-Züge-Regel. Pieces: König, Dame, Turm, Läufer, Springer, Bauer.
 *   Forbidden: English chess words (stalemate, castling, check mate …), "Pferd", "Königin", "Bischof",
 *   "unentschieden", "dreifache Wiederholung".
 * - Moves in texts use German notation: K D T L S, `Sf3`, `Dxh7#`, `0-0`/`0-0-0` with zeros, `e8=D`. Board data
 *   (`move`, `uci`) stays UCI.
 *
 * Chess correctness (only via `@/lib/chess` and the engine – never chess.js directly)
 * - Every FEN is legal (`validateFen`); demo moves and move trees are legal in sequence; exercise positions are not
 *   already finished.
 * - find_move `claim: "best"`: the engine's best move (depth 18) is accepted and every other legal move is at least
 *   0.10 expected points worse than every accepted move (MultiPV over all legal moves when there are ≤ 24, else
 *   MultiPV accepted + 1). Checked at every user move of the tree.
 * - find_move `claim: "mate"`: the position is mate in exactly N; every move that mates in ≤ N (also alternative
 *   first moves) is accepted – listed in `solution`, or an immediate mate with `acceptAnyMate`. Every branch ends with
 *   the learner's mating move. Mate in 1 is checked exactly with `@/lib/chess`.
 * - find_move `claim: "rule"` (legality only) is for rule exercises such as "Rochiere" or "Schlage en passant".
 * - Quiz facts go into `asserts` (checkmate, stalemate, check, insufficient material, legal move, engine best move);
 *   each assert must hold. A quiz with a board should have asserts.
 * - Ausspielen: `checkmate`/`promote` goals need an engine evaluation of at least +5 or mate for the learner,
 *   `draw` goals an evaluation within ±1.5; a mate the engine sees must fit into `maxMoves`.
 *
 * Rules and sources
 * - Rule statements follow the FIDE Laws of Chess 2023. Lessons of Stufe 0 and every lesson that mentions Rochade,
 *   en passant, Umwandlung, Patt, Stellungswiederholung or the 50/75-Züge-Regel cite the articles in `sources`:
 *   "FIDE-Schachregeln 2023, Art. 3.8.2 (Rochade)" (or "…, Anhang C" for the notation). Only article numbers of the
 *   2023 Laws are accepted.
 * - Facts to get right: castling needs king and rook unmoved, empty squares between them, the king not in check and
 *   not crossing or landing on an attacked square (the rook may cross one); en passant only on the move right after
 *   the two-square advance; promotion is compulsory to D/T/L/S of the same colour, not limited to captured pieces;
 *   stalemate is a draw; threefold repetition and the 50-move rule are claims, fivefold repetition and the 75-move
 *   rule end the game automatically; on flag fall the game is drawn if the opponent cannot checkmate at all.
 *
 * Puzzles and practice
 * - Mark very easy exercises (mate in 1, win a hanging piece) with `puzzle: { rating: 150–500, themes }` (P0-04);
 *   themes are `PUZZLE_THEMES` ids, mate puzzles carry `mateInN`. Rule exercises are never puzzles.
 * - Every lesson from Stufe 1 on sets `practiceThemes` (valid `PUZZLE_THEMES` ids) for "Passende Puzzles".
 *
 * Launch scope (P0-13): 6 available courses, 28–32 lessons, 6 course tests, 1 skip test, ≥ 30 lesson puzzles.
 * Engine results are cached per step in `.cache/validate/`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATALOG_FILE,
  checkCatalogAndFiles,
  checkCourseRules,
  checkLaunchScope,
  checkLessonStatic,
  checkStepWithEngine,
  engineCacheContent,
  LESSON_CHECKS_VERSION,
  LESSON_ENGINE_DEPTH,
  LESSONS_DIR,
  type LessonContent,
  type LessonFindings,
  type RawLessonFile,
} from '../content/lessonChecks';
import type { ValidationContext, ValidationIssue, ValidationReport } from '../lib/validation';

/** Bump when the checks change (part of the cache key). */
export const VALIDATOR_VERSION = `validate-lessons-1/${LESSON_CHECKS_VERSION}/d${LESSON_ENGINE_DEPTH}`;

function parseJson(text: string): { raw: unknown; parseError?: string } {
  try {
    return { raw: JSON.parse(text) as unknown };
  } catch (e) {
    return { raw: undefined, parseError: e instanceof Error ? e.message : String(e) };
  }
}

/** Reads `content/lessons/` below `rootDir`. */
export function readLessonContent(rootDir: string, dir = LESSONS_DIR): LessonContent {
  const base = join(rootDir, dir);
  const content: LessonContent = { catalog: undefined, files: [], strayFiles: [] };
  if (!existsSync(base)) return content;
  for (const entry of readdirSync(base).sort()) {
    const path = join(base, entry);
    const rel = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) {
      for (const f of readdirSync(path).sort()) {
        const fp = join(path, f);
        const frel = `${rel}/${f}`;
        if (statSync(fp).isDirectory() || !f.endsWith('.json')) {
          content.strayFiles.push(frel);
          continue;
        }
        const parsed = parseJson(readFileSync(fp, 'utf8'));
        const file: RawLessonFile = { file: frel, raw: parsed.raw };
        if (parsed.parseError !== undefined) file.parseError = parsed.parseError;
        content.files.push(file);
      }
    } else if (rel === CATALOG_FILE) {
      const parsed = parseJson(readFileSync(path, 'utf8'));
      if (parsed.parseError !== undefined) content.catalogParseError = parsed.parseError;
      else content.catalog = parsed.raw;
    } else {
      content.strayFiles.push(rel);
    }
  }
  return content;
}

/** Options of `validateLessonContent`. */
export interface LessonValidationOptions {
  /** Check the P0-13 launch scope (on for the real content, off for unit-test fixtures). */
  launchScope?: boolean;
  /** Engine depth (default 18). */
  depth?: number;
}

/** Validates lesson content (structure, legality, terminology, then engine unless `ctx.quick`). */
export async function validateLessonContent(content: LessonContent, ctx: ValidationContext, opts: LessonValidationOptions = {}): Promise<ValidationReport> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const add = (f: LessonFindings, file?: string) => {
    errors.push(...f.errors.map((i) => ({ ...i, file: i.file ?? file })));
    warnings.push(...f.warnings.map((i) => ({ ...i, file: i.file ?? file })));
  };
  const base = checkCatalogAndFiles(content);
  add(base);
  let checked = 0;
  for (const { file, lesson, course } of base.lessons) {
    checked += lesson.steps.length;
    const stat = checkLessonStatic(lesson, course?.stage);
    add(stat, file);
    if (ctx.quick) continue;
    const brokenSteps = new Set(stat.errors.map((e) => e.id).filter(Boolean));
    for (const step of lesson.steps) {
      if (brokenSteps.has(step.id)) continue;
      const key = engineCacheContent(step);
      if (key === null) continue;
      const result = await ctx.cache.getOrCompute<LessonFindings>(ctx.cache.key(key, VALIDATOR_VERSION), async () =>
        checkStepWithEngine(step, await ctx.engine(), opts.depth ?? LESSON_ENGINE_DEPTH),
      );
      add(result, file);
    }
  }
  add(checkCourseRules(base.courses, base.lessons));
  if (opts.launchScope) add(checkLaunchScope(base.courses, base.lessons));
  return { name: 'lessons', checked, errors, warnings };
}

/** Default export for `validate:content`. */
export default async function validateLessons(ctx: ValidationContext): Promise<ValidationReport> {
  const report = await validateLessonContent(readLessonContent(ctx.rootDir), ctx, { launchScope: true });
  ctx.log.info(`lessons: ${report.checked} Schritte geprüft${ctx.quick ? ' (ohne Engine)' : ''}`);
  return report;
}
