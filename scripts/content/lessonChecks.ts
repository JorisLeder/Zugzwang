/**
 * Lesson content checks used by `scripts/validate/lessons.ts` (WP-07). See the header of that file for the authoring
 * rules these checks enforce. Rules only via `@/lib/chess`; engine claims via the `EngineService` of the validation
 * context (Stockfish, depth ≥ 18).
 *
 * The checks are pure functions over parsed JSON so the unit tests can run them on in-memory content:
 * - `checkCatalogAndFiles` – schemas, file layout, catalog ↔ files, ids, kinds and order.
 * - `checkLessonStatic`    – structure rules, legality of every FEN/move, quiz asserts that need no engine, exact
 *                            mate-in-1 claims, terminology, sources, puzzle flags and practice themes.
 * - `checkStepWithEngine`  – find_move `best`/`mate` claims, quiz `bestMove` asserts and play_out goals.
 * - `checkCourseRules` / `checkLaunchScope` – per-course and whole-catalog rules.
 */
import { scoreWinPercent } from '@/analysis';
import type { Color, Fen, Uci } from '@/core/chess';
import type { EngineLine, EngineService } from '@/core/engine';
import type { CourseMeta, Lesson, LessonStep, MoveTreeNode, QuizAssert } from '@/core/lessons';
import { PUZZLE_THEMES } from '@/core/puzzles';
import { lessonCatalogSchema, lessonSchema } from '@/core/schemas';
import { ChessGame, fenTurn, pieceCounts, uciToSan, validateFen } from '@/lib/chess';
import {
  citedArticles,
  FIDE_SOURCE_RE,
  FORBIDDEN_TERMS,
  KNOWN_FIDE_ARTICLES,
  MAX_SENTENCE_WORDS,
  REQUIRED_TERMS,
  RULE_TERMS,
  sentences,
  wordCount,
} from './terminology';

/** Bump when the engine checks change (part of the cache key). */
export const LESSON_CHECKS_VERSION = 'lessons-v1';

/** Engine depth for all claims (≥ 18). */
export const LESSON_ENGINE_DEPTH = 18;

/** Minimum expected-points margin of every accepted move over every other legal move (`claim: best`). */
export const BEST_MARGIN_EP = 0.1;

/** Positions with at most this many legal moves are analysed with MultiPV over all legal moves. */
export const ALL_MOVES_LIMIT = 24;

/** Upper bound of MultiPV for mate searches. */
export const MATE_MULTIPV_LIMIT = 64;

/** play_out: minimum evaluation (centipawns, learner's view) for `checkmate`/`promote` goals. */
export const WIN_GOAL_MIN_CP = 500;

/** play_out: maximum absolute evaluation (centipawns) for `draw` goals. */
export const DRAW_GOAL_MAX_CP = 150;

/** Structure rules (per lesson file). */
export const STRUCTURE = { minSteps: 5, maxSteps: 12, minStepTypes: 3, finalExercises: 2 } as const;

/** Rating range of lesson exercises exported as very easy puzzles (P0-04). */
export const LESSON_PUZZLE_RATING = { min: 150, max: 500 } as const;

/** Launch scope (P0-13). */
export const LAUNCH_SCOPE = { availableCourses: 6, minLessons: 28, maxLessons: 32, courseTests: 6, skipTests: 1, minPuzzles: 30 } as const;

/** Play-outs a course must contain, by material signature (`KQ-K` = king and queen against a lone king). */
export const REQUIRED_PLAY_OUTS: Readonly<Record<string, readonly string[]>> = {
  grundmatts: ['KQ-K', 'KR-K'],
};

/** Content root (repo-relative). */
export const LESSONS_DIR = 'content/lessons';
export const CATALOG_FILE = `${LESSONS_DIR}/catalog.json`;

/** One finding. */
export interface LessonIssue {
  file?: string;
  id?: string;
  message: string;
}

/** Findings. */
export interface LessonFindings {
  errors: LessonIssue[];
  warnings: LessonIssue[];
}

/** A raw lesson file. `file` is repo-relative: `content/lessons/<courseId>/<lessonId>.json`. */
export interface RawLessonFile {
  file: string;
  /** Parsed JSON, or the parse error. */
  raw: unknown;
  parseError?: string;
}

/** Everything below `content/lessons/`. */
export interface LessonContent {
  /** Parsed catalog JSON; `undefined` if the file is missing. */
  catalog: unknown;
  catalogParseError?: string;
  files: RawLessonFile[];
  /** Files that do not follow `<courseId>/<lessonId>.json`. */
  strayFiles: string[];
}

/** A lesson that passed schema and path checks. */
export interface LoadedLesson {
  file: string;
  lesson: Lesson;
  course: CourseMeta | undefined;
}

const THEME_IDS = new Set(PUZZLE_THEMES.map((t) => t.id as string));
const EXERCISE_TYPES = new Set<LessonStep['type']>(['find_move', 'quiz']);

function issues(): LessonFindings {
  return { errors: [], warnings: [] };
}

function zodMessage(error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }): string {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message))
    .join('; ');
}

// ---------------------------------------------------------------------------------------------------------------
// Catalog and files

/** Schema, layout and catalog ↔ file consistency. Returns the lessons that can be checked further. */
export function checkCatalogAndFiles(content: LessonContent): LessonFindings & { courses: CourseMeta[]; lessons: LoadedLesson[] } {
  const out = issues();
  let courses: CourseMeta[] = [];
  if (content.catalog === undefined) {
    out.errors.push({ file: CATALOG_FILE, message: content.catalogParseError ? `Kein gültiges JSON: ${content.catalogParseError}` : 'Katalog fehlt.' });
  } else {
    const parsed = lessonCatalogSchema.safeParse(content.catalog);
    if (!parsed.success) out.errors.push({ file: CATALOG_FILE, message: `Katalog entspricht nicht dem Schema: ${zodMessage(parsed.error)}` });
    else courses = parsed.data.courses;
  }
  for (const f of content.strayFiles) out.errors.push({ file: f, message: 'Datei liegt nicht unter content/lessons/<kurs>/<lektion>.json.' });

  const courseIds = new Set<string>();
  const owner = new Map<string, string>();
  const orderKeys = new Set<string>();
  for (const c of courses) {
    if (courseIds.has(c.id)) out.errors.push({ file: CATALOG_FILE, id: c.id, message: 'Kurs-ID ist doppelt.' });
    courseIds.add(c.id);
    const ok = `${c.stage}/${c.order}`;
    if (orderKeys.has(ok)) out.errors.push({ file: CATALOG_FILE, id: c.id, message: `Reihenfolge ${c.order} in Stufe ${c.stage} ist doppelt.` });
    orderKeys.add(ok);
    const items = [...c.lessonIds, ...(c.testLessonId ? [c.testLessonId] : [])];
    if (new Set(items).size !== items.length) out.errors.push({ file: CATALOG_FILE, id: c.id, message: 'Eine Lektions-ID kommt im Kurs mehrfach vor.' });
    for (const id of items) {
      const prev = owner.get(id);
      if (prev && prev !== c.id) out.errors.push({ file: CATALOG_FILE, id, message: `Lektions-ID kommt in ${prev} und ${c.id} vor.` });
      owner.set(id, c.id);
    }
    if (c.status === 'available' && c.lessonIds.length === 0) out.errors.push({ file: CATALOG_FILE, id: c.id, message: 'Verfügbarer Kurs ohne Lektionen.' });
  }

  const lessons: LoadedLesson[] = [];
  const present = new Set<string>();
  const lessonIds = new Map<string, string>();
  for (const f of content.files) {
    const m = /^content\/lessons\/([^/]+)\/([^/]+)\.json$/.exec(f.file);
    if (!m) {
      out.errors.push({ file: f.file, message: 'Datei liegt nicht unter content/lessons/<kurs>/<lektion>.json.' });
      continue;
    }
    const [, courseId, lessonId] = m as unknown as [string, string, string];
    if (f.parseError !== undefined) {
      out.errors.push({ file: f.file, message: `Kein gültiges JSON: ${f.parseError}` });
      continue;
    }
    const parsed = lessonSchema.safeParse(f.raw);
    if (!parsed.success) {
      out.errors.push({ file: f.file, message: `Lektion entspricht nicht dem Schema: ${zodMessage(parsed.error)}` });
      continue;
    }
    const lesson = parsed.data as Lesson;
    if (lesson.id !== lessonId) out.errors.push({ file: f.file, message: `id ist „${lesson.id}“, der Dateiname verlangt „${lessonId}“.` });
    if (lesson.courseId !== courseId) out.errors.push({ file: f.file, message: `courseId ist „${lesson.courseId}“, der Ordner verlangt „${courseId}“.` });
    const dup = lessonIds.get(lesson.id);
    if (dup) out.errors.push({ file: f.file, message: `Lektions-ID „${lesson.id}“ gibt es auch in ${dup}.` });
    lessonIds.set(lesson.id, f.file);
    present.add(`${courseId}/${lessonId}`);
    const course = courses.find((c) => c.id === courseId);
    if (content.catalog !== undefined && courses.length > 0 && !course) {
      out.errors.push({ file: f.file, message: `Kurs „${courseId}“ steht nicht im Katalog.` });
    }
    if (course) {
      const index = course.lessonIds.indexOf(lessonId);
      if (index >= 0) {
        if (lesson.kind !== 'lesson') out.errors.push({ file: f.file, message: `Steht in lessonIds, hat aber kind „${lesson.kind}“.` });
        if (lesson.order !== index + 1) out.errors.push({ file: f.file, message: `order ist ${lesson.order}, erwartet ${index + 1} (Position im Kurs).` });
      } else if (course.testLessonId === lessonId) {
        if (lesson.kind !== 'course_test') out.errors.push({ file: f.file, message: `Ist der Kurstest, hat aber kind „${lesson.kind}“.` });
        if (lesson.order !== course.lessonIds.length + 1) {
          out.errors.push({ file: f.file, message: `order ist ${lesson.order}, erwartet ${course.lessonIds.length + 1} (nach den Lektionen).` });
        }
      } else if (lesson.kind === 'skip_test') {
        if (course.stage !== 0) out.errors.push({ file: f.file, message: 'Der Einstufungstest gehört in einen Kurs der Stufe 0.' });
        if (lesson.order !== 0) out.errors.push({ file: f.file, message: 'Der Einstufungstest hat order 0.' });
      } else {
        out.errors.push({ file: f.file, message: 'Die Lektion steht weder in lessonIds noch als testLessonId im Katalog.' });
      }
    }
    if (lesson.kind === 'lesson' && lesson.passThreshold !== undefined) out.warnings.push({ file: f.file, message: 'passThreshold gilt nur für Tests.' });
    lessons.push({ file: f.file, lesson, course });
  }
  for (const c of courses) {
    if (c.status !== 'available') continue;
    for (const id of [...c.lessonIds, ...(c.testLessonId ? [c.testLessonId] : [])]) {
      if (!present.has(`${c.id}/${id}`)) out.errors.push({ file: CATALOG_FILE, id: `${c.id}/${id}`, message: 'Lektionsdatei fehlt.' });
    }
  }
  return { ...out, courses, lessons };
}

// ---------------------------------------------------------------------------------------------------------------
// Chess helpers (lib/chess only)

/** Plays `uci` on `fen`; `null` if illegal. */
function play(fen: Fen, uci: string) {
  try {
    return ChessGame.fromFen(fen).move(uci);
  } catch {
    return null;
  }
}

/** UCI moves that checkmate immediately. */
export function immediateMates(fen: Fen): Uci[] {
  const out: Uci[] = [];
  for (const m of ChessGame.fromFen(fen).legalMoves()) if (play(fen, m.uci)?.isCheckmate) out.push(m.uci);
  return out;
}

function san(fen: Fen, uci: string): string {
  return uciToSan(fen, uci) ?? uci;
}

/** Material signature like `KQ-K` (side with more material first). */
export function materialSignature(fen: Fen): string {
  const counts = pieceCounts(fen);
  const side = (c: Color) =>
    (['k', 'q', 'r', 'b', 'n', 'p'] as const).map((p) => p.toUpperCase().repeat(counts[c][p])).join('');
  const [a, b] = [side('w'), side('b')].sort((x, y) => y.length - x.length || x.localeCompare(y));
  return `${a}-${b}`;
}

/** A user decision point of a find_move tree: position and the accepted moves there. */
export interface DecisionPoint {
  fen: Fen;
  nodes: readonly MoveTreeNode[];
  /** User moves already made before this point. */
  userPly: number;
  /** Move path for messages (SAN). */
  path: string[];
}

/** Walks a solution tree; reports illegal moves and returns the user decision points. */
export function walkTree(
  fen: Fen,
  solution: readonly MoveTreeNode[],
  report: (message: string) => void,
): { points: DecisionPoint[]; leaves: Array<{ fen: Fen; path: string[]; userPly: number; endsWith: 'user' | 'reply'; mate: boolean }> } {
  const points: DecisionPoint[] = [];
  const leaves: Array<{ fen: Fen; path: string[]; userPly: number; endsWith: 'user' | 'reply'; mate: boolean }> = [];
  const visitUser = (pos: Fen, nodes: readonly MoveTreeNode[], userPly: number, path: string[], depth: number) => {
    if (depth > 40) return report('Zugbaum ist zu tief.');
    points.push({ fen: pos, nodes, userPly, path });
    const seen = new Set<string>();
    for (const node of nodes) {
      const rec = play(pos, node.move);
      if (!rec) {
        report(`Zug ${[...path, node.move].join(' ')} ist nicht regelgemäß.`);
        continue;
      }
      if (seen.has(rec.uci)) report(`Zug ${rec.san} steht doppelt im Zugbaum.`);
      seen.add(rec.uci);
      const p = [...path, rec.san];
      if (rec.isCheckmate || node.children.length === 0) {
        if (rec.isCheckmate && node.children.length > 0) report(`Nach ${p.join(' ')} ist die Partie vorbei, der Zugbaum geht aber weiter.`);
        leaves.push({ fen: rec.fenAfter, path: p, userPly: userPly + 1, endsWith: 'user', mate: rec.isCheckmate });
        continue;
      }
      const replySeen = new Set<string>();
      for (const reply of node.children) {
        const r = play(rec.fenAfter, reply.move);
        if (!r) {
          report(`Antwort ${[...p, reply.move].join(' ')} ist nicht regelgemäß.`);
          continue;
        }
        if (replySeen.has(r.uci)) report(`Antwort ${r.san} steht doppelt im Zugbaum.`);
        replySeen.add(r.uci);
        const rp = [...p, r.san];
        if (r.isCheckmate || reply.children.length === 0) {
          if (r.isCheckmate && reply.children.length > 0) report(`Nach ${rp.join(' ')} ist die Partie vorbei, der Zugbaum geht aber weiter.`);
          leaves.push({ fen: r.fenAfter, path: rp, userPly: userPly + 1, endsWith: 'reply', mate: r.isCheckmate });
          continue;
        }
        visitUser(r.fenAfter, reply.children, userPly + 1, rp, depth + 1);
      }
    }
  };
  visitUser(fen, solution, 0, [], 0);
  return { points, leaves };
}

/** Accepted UCI moves at a decision point (canonical; with `acceptAnyMate` every immediate mate). */
export function acceptedMoves(point: Pick<DecisionPoint, 'fen' | 'nodes'>, acceptAnyMate: boolean): Set<Uci> {
  const set = new Set<Uci>();
  for (const n of point.nodes) {
    const rec = play(point.fen, n.move);
    if (rec) set.add(rec.uci);
  }
  if (acceptAnyMate) for (const m of immediateMates(point.fen)) set.add(m);
  return set;
}

/** Evaluates a quiz assert that needs no engine. `null` for `bestMove` (engine) – checked separately. */
export function evaluateAssert(a: QuizAssert): { ok: boolean; actual: string } | null {
  const v = validateFen(a.fen);
  if (!v.ok) return { ok: false, actual: `ungültige FEN (${v.errorDe})` };
  const game = ChessGame.fromFen(a.fen);
  const s = game.status();
  switch (a.kind) {
    case 'isCheckmate':
      return { ok: (s.reason === 'checkmate') === a.expect, actual: `Status ${s.reason ?? 'läuft'}` };
    case 'isStalemate':
      return { ok: (s.reason === 'stalemate') === a.expect, actual: `Status ${s.reason ?? 'läuft'}` };
    case 'isInsufficientMaterial':
      return { ok: (s.reason === 'insufficient_material') === a.expect, actual: `Status ${s.reason ?? 'läuft'}` };
    case 'isCheck':
      return { ok: s.inCheck === a.expect, actual: s.inCheck ? 'Schach' : 'kein Schach' };
    case 'isLegalMove': {
      const legal = game.legalMoves().some((m) => m.uci === a.move);
      return { ok: legal === a.expect, actual: legal ? 'regelgemäß' : 'nicht regelgemäß' };
    }
    case 'bestMove':
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Static lesson checks

/** All German texts of a lesson with their location. */
export function lessonTexts(lesson: Lesson): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [
    { where: 'titleDe', text: lesson.titleDe },
    { where: 'summaryDe', text: lesson.summaryDe },
  ];
  const add = (where: string, text: string | undefined) => {
    if (text) out.push({ where, text });
  };
  const tree = (where: string, nodes: readonly MoveTreeNode[]) => {
    for (const n of nodes) {
      add(where, n.comment);
      tree(where, n.children);
    }
  };
  for (const s of lesson.steps) {
    const w = `Schritt „${s.id}“`;
    switch (s.type) {
      case 'explanation':
        add(w, s.textDe);
        break;
      case 'demo':
        add(w, s.introDe);
        for (const m of s.moves) add(w, m.commentDe);
        break;
      case 'find_move':
        add(w, s.promptDe);
        s.hintsDe.forEach((h) => add(w, h));
        add(w, s.explanationDe);
        tree(w, s.solution);
        break;
      case 'quiz':
        add(w, s.questionDe);
        for (const o of s.options) {
          add(w, o.textDe);
          add(w, o.feedbackDe);
        }
        break;
      case 'play_out':
        add(w, s.promptDe);
        add(w, s.successDe);
        add(w, s.failDe);
        break;
    }
  }
  return out;
}

/** Terminology lint for a list of texts. */
export function lintTexts(texts: ReadonlyArray<{ where: string; text: string }>, requiredTerms: readonly string[] = []): LessonFindings {
  const out = issues();
  for (const { where, text } of texts) {
    for (const t of FORBIDDEN_TERMS) {
      const m = t.re.exec(text);
      if (m) out.errors.push({ id: where, message: `Begriff „${m[0].trim()}“ – verwende ${t.useDe}.` });
    }
    for (const s of sentences(text)) {
      const n = wordCount(s);
      if (n > MAX_SENTENCE_WORDS) out.warnings.push({ id: where, message: `Langer Satz (${n} Wörter): „${s.slice(0, 60)}…“` });
    }
  }
  const all = texts.map((t) => t.text.toLowerCase()).join('\n');
  for (const term of requiredTerms) {
    if (!all.includes(term.toLowerCase())) out.errors.push({ message: `Der DSB-Begriff „${term}“ fehlt in der Lektion.` });
  }
  return out;
}

/** Checks the `sources` of a lesson: FIDE format, known article numbers, required for rule lessons. */
export function checkSources(lesson: Lesson, requireFide: boolean): LessonFindings {
  const out = issues();
  const fide = (lesson.sources ?? []).filter((s) => s.startsWith('FIDE'));
  for (const s of fide) {
    if (!FIDE_SOURCE_RE.test(s)) out.errors.push({ message: `Quelle „${s}“: Format „FIDE-Schachregeln 2023, Art. x.y (Thema)“.` });
    for (const a of citedArticles(s)) if (!KNOWN_FIDE_ARTICLES.has(a)) out.errors.push({ message: `Quelle „${s}“: Art. ${a} gibt es in den FIDE-Regeln 2023 nicht (oder er ist nicht freigegeben).` });
  }
  if (requireFide && !fide.some((s) => citedArticles(s).length > 0)) {
    out.errors.push({ message: 'Regelinhalte brauchen mindestens eine Quelle mit FIDE-Artikel („FIDE-Schachregeln 2023, Art. …“).' });
  }
  return out;
}

/** Structure rules of one lesson file. */
export function checkStructure(lesson: Lesson): LessonFindings {
  const out = issues();
  const n = lesson.steps.length;
  if (n < STRUCTURE.minSteps || n > STRUCTURE.maxSteps) out.errors.push({ message: `${n} Schritte – erlaubt sind ${STRUCTURE.minSteps} bis ${STRUCTURE.maxSteps}.` });
  const types = new Set(lesson.steps.map((s) => s.type));
  if (types.size < STRUCTURE.minStepTypes) out.errors.push({ message: `Nur ${types.size} Schritttypen – mindestens ${STRUCTURE.minStepTypes}.` });
  if (lesson.steps[0]?.type !== 'explanation') out.errors.push({ message: 'Die Lektion muss mit einer Erklärung beginnen.' });
  const tail = lesson.steps.slice(-STRUCTURE.finalExercises);
  if (tail.length < STRUCTURE.finalExercises || !tail.every((s) => EXERCISE_TYPES.has(s.type))) {
    out.errors.push({ message: `Die letzten ${STRUCTURE.finalExercises} Schritte müssen Übungen sein („Finde den Zug“ oder Quiz).` });
  }
  return out;
}

/** Legality and engine-free claims of one step. */
export function checkStepStatic(step: LessonStep): LessonFindings {
  const out = issues();
  const err = (message: string) => out.errors.push({ id: step.id, message });
  const warn = (message: string) => out.warnings.push({ id: step.id, message });
  const fenOk = (fen: Fen, label = 'FEN'): boolean => {
    const v = validateFen(fen);
    if (!v.ok) err(`${label} ist nicht regelgemäß: ${v.errorDe}`);
    return v.ok;
  };
  switch (step.type) {
    case 'explanation':
      if (step.fen) fenOk(step.fen);
      break;
    case 'demo': {
      if (!fenOk(step.startFen, 'startFen')) break;
      const game = ChessGame.fromFen(step.startFen);
      for (const [i, m] of step.moves.entries()) {
        if (!game.move(m.uci)) {
          err(`Demo-Zug ${i + 1} (${m.uci}) ist nicht regelgemäß.`);
          break;
        }
      }
      break;
    }
    case 'find_move': {
      if (!fenOk(step.fen)) break;
      const start = ChessGame.fromFen(step.fen);
      if (start.status().isOver) {
        err('In der Stellung ist die Partie schon beendet.');
        break;
      }
      if (step.orientation && step.orientation !== start.turn()) warn('orientation zeigt nicht die Seite am Zug.');
      const { points, leaves } = walkTree(step.fen, step.solution, err);
      if (step.claim.kind === 'mate') {
        const n = step.claim.mateIn;
        for (const leaf of leaves) {
          if (leaf.endsWith === 'reply') err(`Nach ${leaf.path.join(' ')} fehlt der nächste Zug – ein Matt-Baum endet mit dem Matt.`);
          else if (!leaf.mate) err(`${leaf.path.join(' ')} setzt nicht matt – ein Matt-Baum endet mit dem Matt.`);
          if (leaf.userPly > n) err(`${leaf.path.join(' ')} braucht ${leaf.userPly} Züge, behauptet ist Matt in ${n}.`);
        }
        // Exact check where exactly one user move is left (mate in 1 at the root, last move of longer mates).
        for (const p of points) {
          if (n - p.userPly !== 1) continue;
          const mates = new Set(immediateMates(p.fen));
          const accepted = acceptedMoves(p, step.acceptAnyMate);
          const where = p.path.length ? ` nach ${p.path.join(' ')}` : '';
          if (p.userPly === 0 && mates.size === 0) err(`Kein Matt in 1 – behauptet ist Matt in ${n}.`);
          for (const node of p.nodes) {
            const rec = play(p.fen, node.move);
            if (rec && !rec.isCheckmate) err(`${rec.san}${where} setzt nicht matt.`);
          }
          for (const m of mates) if (!accepted.has(m)) err(`Alternatives Matt ${san(p.fen, m)}${where} wird nicht akzeptiert (Lösung ergänzen oder acceptAnyMate).`);
        }
      }
      if (step.claim.kind === 'rule' && step.puzzle) err('Regel-Übungen (claim rule) können nicht als Puzzle markiert werden.');
      if (step.puzzle) {
        const { rating, themes } = step.puzzle;
        if (rating < LESSON_PUZZLE_RATING.min || rating > LESSON_PUZZLE_RATING.max) {
          err(`Puzzle-Rating ${rating} – sehr leichte Lektions-Puzzles liegen bei ${LESSON_PUZZLE_RATING.min}–${LESSON_PUZZLE_RATING.max}.`);
        }
        for (const t of themes) if (!THEME_IDS.has(t)) err(`Unbekanntes Puzzle-Thema „${t}“.`);
        if (step.claim.kind === 'mate' && !themes.includes(`mateIn${Math.min(step.claim.mateIn, 5)}`)) {
          err(`Puzzle mit Matt in ${step.claim.mateIn} braucht das Thema mateIn${Math.min(step.claim.mateIn, 5)}.`);
        }
      }
      break;
    }
    case 'quiz': {
      if (step.fen) fenOk(step.fen);
      if (step.fen && !step.asserts?.length) warn('Quiz mit Stellung, aber ohne asserts – die Antwort wird nicht maschinell geprüft.');
      for (const [i, a] of (step.asserts ?? []).entries()) {
        const r = evaluateAssert(a);
        if (r === null || a.kind === 'bestMove') {
          if (a.kind !== 'bestMove') continue;
          if (fenOk(a.fen, `Prüfung ${i + 1}: FEN`) && !ChessGame.fromFen(a.fen).legalMoves().some((m) => m.uci === a.move)) {
            err(`Prüfung ${i + 1} (bestMove ${a.move}): Der Zug ist nicht regelgemäß.`);
          }
          continue;
        }
        if (!r.ok) err(`Prüfung ${i + 1} (${a.kind}${'move' in a ? ` ${a.move}` : ''} = ${String('expect' in a ? a.expect : '')}) stimmt nicht: ${r.actual}.`);
      }
      break;
    }
    case 'play_out': {
      if (!fenOk(step.fen)) break;
      const s = ChessGame.fromFen(step.fen).status();
      if (s.isOver) err('In der Stellung ist die Partie schon beendet.');
      break;
    }
  }
  return out;
}

/** All engine-free checks of one lesson. `stage` is the course stage (rule lessons of Stufe 0 need FIDE sources). */
export function checkLessonStatic(lesson: Lesson, stage: number | undefined): LessonFindings {
  const out = issues();
  const merge = (f: LessonFindings) => {
    out.errors.push(...f.errors);
    out.warnings.push(...f.warnings);
  };
  merge(checkStructure(lesson));
  for (const step of lesson.steps) merge(checkStepStatic(step));
  const texts = lessonTexts(lesson);
  merge(lintTexts(texts, REQUIRED_TERMS[lesson.id] ?? []));
  const mentionsRules = texts.some((t) => RULE_TERMS.some((re) => re.test(t.text)));
  merge(checkSources(lesson, stage === 0 || mentionsRules));
  for (const t of lesson.practiceThemes) if (!THEME_IDS.has(t)) out.errors.push({ message: `Unbekanntes Übungsthema „${t}“ in practiceThemes.` });
  if (stage !== undefined && stage >= 1 && lesson.kind === 'lesson' && lesson.practiceThemes.length === 0) {
    out.errors.push({ message: 'Lektionen ab Stufe 1 brauchen practiceThemes.' });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Engine checks

/** Expected points (0–1) of a line for the side to move. */
function ep(line: EngineLine, turn: Color): number {
  return scoreWinPercent(line.score, turn, turn) / 100;
}

/** Mate distance for the side to move (`null` = no mate for the mover). */
function moverMate(line: EngineLine | undefined, turn: Color): number | null {
  if (!line || line.score.type !== 'mate') return null;
  const n = turn === 'w' ? line.score.value : -line.score.value;
  return n > 0 ? n : null;
}

/** Centipawns for `pov` (mate = ±100000). */
function povCp(line: EngineLine, pov: Color): number {
  const sign = pov === 'w' ? 1 : -1;
  if (line.score.type === 'mate') return line.score.value === 0 ? -100000 * sign : Math.sign(line.score.value) * 100000 * sign;
  return line.score.value * sign;
}

function fmtScore(line: EngineLine, pov: Color): string {
  if (line.score.type === 'mate') {
    const n = pov === 'w' ? line.score.value : -line.score.value;
    return n > 0 ? `Matt in ${n}` : `wird in ${-n} mattgesetzt`;
  }
  return `${(povCp(line, pov) / 100).toFixed(2)}`;
}

/** Cache key content of a step (only what the engine checks depend on). */
export function engineCacheContent(step: LessonStep): string | null {
  switch (step.type) {
    case 'find_move':
      if (step.claim.kind === 'rule') return null;
      if (step.claim.kind === 'mate' && step.claim.mateIn === 1) return null;
      return JSON.stringify({ t: step.type, fen: step.fen, solution: stripComments(step.solution), any: step.acceptAnyMate, claim: step.claim });
    case 'quiz': {
      const best = (step.asserts ?? []).filter((a) => a.kind === 'bestMove');
      return best.length ? JSON.stringify({ t: step.type, best }) : null;
    }
    case 'play_out':
      return JSON.stringify({ t: step.type, fen: step.fen, goal: step.goal, user: step.userColor, max: step.maxMoves });
    default:
      return null;
  }
}

function stripComments(nodes: readonly MoveTreeNode[]): unknown {
  return nodes.map((n) => ({ m: n.move, c: stripComments(n.children) }));
}

/** Engine checks of one step (static checks must have passed). */
export async function checkStepWithEngine(step: LessonStep, engine: EngineService, depth = LESSON_ENGINE_DEPTH): Promise<LessonFindings> {
  const out = issues();
  const err = (message: string) => out.errors.push({ id: step.id, message });
  const warn = (message: string) => out.warnings.push({ id: step.id, message });
  if (step.type === 'find_move') {
    const { points } = walkTree(step.fen, step.solution, () => {});
    if (step.claim.kind === 'best') {
      for (const p of points) await checkBestPoint(p, step.acceptAnyMate, engine, depth, err, warn);
    } else if (step.claim.kind === 'mate') {
      const n = step.claim.mateIn;
      for (const p of points) {
        const remaining = n - p.userPly;
        if (remaining <= 1) continue; // exact check in checkStepStatic
        await checkMatePoint(p, remaining, p.userPly === 0, step.acceptAnyMate, engine, depth, err);
      }
    }
  } else if (step.type === 'quiz') {
    for (const [i, a] of (step.asserts ?? []).entries()) {
      if (a.kind !== 'bestMove') continue;
      const turn = fenTurn(a.fen);
      const analysis = await engine.analyse(a.fen, { depth, multiPv: 2 });
      const [l1, l2] = analysis.lines;
      if (!l1) {
        err(`Prüfung ${i + 1} (bestMove): Die Engine findet keinen Zug.`);
        continue;
      }
      if (l1.pv[0] !== a.move) {
        err(`Prüfung ${i + 1} (bestMove ${san(a.fen, a.move)}): Die Engine spielt ${san(a.fen, l1.pv[0]!)} (${fmtScore(l1, turn)}).`);
        continue;
      }
      if (l2) {
        const m1 = moverMate(l1, turn);
        const m2 = moverMate(l2, turn);
        if (m1 !== null && m2 === m1) err(`Prüfung ${i + 1} (bestMove): ${san(a.fen, l2.pv[0]!)} setzt ebenso schnell matt.`);
        else if (m1 === null && ep(l1, turn) - ep(l2, turn) < BEST_MARGIN_EP) {
          err(`Prüfung ${i + 1} (bestMove): ${san(a.fen, l2.pv[0]!)} ist fast gleich gut (Abstand ${(ep(l1, turn) - ep(l2, turn)).toFixed(3)}).`);
        }
      }
    }
  } else if (step.type === 'play_out') {
    const analysis = await engine.analyse(step.fen, { depth, multiPv: 1 });
    const l1 = analysis.lines[0];
    if (!l1) {
      err('Die Engine findet keinen Zug.');
      return out;
    }
    const user = step.userColor;
    const cp = povCp(l1, user);
    if (step.goal === 'draw') {
      if (l1.score.type === 'mate' || Math.abs(cp) > DRAW_GOAL_MAX_CP) {
        err(`Ziel Remis, aber die Engine bewertet ${fmtScore(l1, user)} (erlaubt ±${(DRAW_GOAL_MAX_CP / 100).toFixed(1)}).`);
      }
    } else {
      if (cp < WIN_GOAL_MIN_CP) err(`Ziel ${step.goal === 'checkmate' ? 'Matt' : 'Umwandlung'}, aber die Engine bewertet nur ${fmtScore(l1, user)} (mindestens +${WIN_GOAL_MIN_CP / 100}).`);
      const mate = moverMate(l1, fenTurn(step.fen));
      if (step.goal === 'checkmate' && mate !== null && fenTurn(step.fen) === user && mate > step.maxMoves) {
        err(`Die Engine braucht ${mate} Züge zum Matt, maxMoves ist ${step.maxMoves}.`);
      }
    }
  }
  return out;
}

async function checkBestPoint(
  p: DecisionPoint,
  acceptAnyMate: boolean,
  engine: EngineService,
  depth: number,
  err: (m: string) => void,
  warn: (m: string) => void,
): Promise<void> {
  const where = p.path.length ? ` (nach ${p.path.join(' ')})` : '';
  const legal = ChessGame.fromFen(p.fen).legalMoves();
  const accepted = acceptedMoves(p, acceptAnyMate);
  if (legal.length <= 1) {
    warn(`Nur ein regelgemäßer Zug${where}.`);
    return;
  }
  const multiPv = legal.length <= ALL_MOVES_LIMIT ? legal.length : Math.min(legal.length, accepted.size + 1);
  const turn = fenTurn(p.fen);
  const analysis = await engine.analyse(p.fen, { depth, multiPv });
  const lines = analysis.lines;
  const best = lines[0];
  if (!best) {
    err(`Die Engine findet keinen Zug${where}.`);
    return;
  }
  if (!accepted.has(best.pv[0]!)) {
    err(`Die Engine spielt ${san(p.fen, best.pv[0]!)} (${fmtScore(best, turn)})${where} – der Zug wird nicht akzeptiert.`);
    return;
  }
  const other = lines.find((l) => !accepted.has(l.pv[0]!));
  if (!other) {
    if (lines.length < legal.length) err(`Kein Vergleichszug in der Analyse${where}.`);
    else warn(`Jeder regelgemäße Zug wird akzeptiert${where}.`);
    return;
  }
  for (const node of p.nodes) {
    const rec = play(p.fen, node.move);
    if (!rec) continue;
    const line = lines.find((l) => l.pv[0] === rec.uci);
    if (!line) {
      err(`${rec.san}${where} ist schlechter als ${san(p.fen, other.pv[0]!)} (nicht unter den besten ${lines.length} Zügen).`);
      continue;
    }
    const margin = ep(line, turn) - ep(other, turn);
    if (margin < BEST_MARGIN_EP) {
      err(
        `${rec.san}${where} ist nicht eindeutig: ${san(p.fen, other.pv[0]!)} (${fmtScore(other, turn)}) ist nur ${margin.toFixed(3)} erwartete Punkte schlechter als ${rec.san} (${fmtScore(line, turn)}), mindestens ${BEST_MARGIN_EP}.`,
      );
    }
  }
}

async function checkMatePoint(
  p: DecisionPoint,
  remaining: number,
  isRoot: boolean,
  acceptAnyMate: boolean,
  engine: EngineService,
  depth: number,
  err: (m: string) => void,
): Promise<void> {
  const where = p.path.length ? ` nach ${p.path.join(' ')}` : '';
  const legal = ChessGame.fromFen(p.fen).legalMoves();
  const turn = fenTurn(p.fen);
  const analysis = await engine.analyse(p.fen, { depth, multiPv: Math.min(legal.length, MATE_MULTIPV_LIMIT) });
  const mateOf = new Map<string, number | null>(analysis.lines.map((l) => [l.pv[0]!, moverMate(l, turn)]));
  const fastest = Math.min(...[...mateOf.values()].map((m) => m ?? Infinity));
  if (isRoot && fastest !== remaining) {
    err(Number.isFinite(fastest) ? `Die Engine findet Matt in ${fastest}, behauptet ist Matt in ${remaining}.` : `Die Engine findet kein Matt in ${remaining}.`);
  }
  const accepted = acceptedMoves(p, acceptAnyMate);
  for (const node of p.nodes) {
    const rec = play(p.fen, node.move);
    if (!rec) continue;
    const m = mateOf.get(rec.uci);
    if (m === undefined || m === null || m > remaining) err(`${rec.san}${where} setzt nicht in ${remaining} Zügen matt.`);
  }
  for (const [uci, m] of mateOf) {
    if (m !== null && m <= remaining && !accepted.has(uci)) {
      err(`Alternatives Matt in ${m}: ${san(p.fen, uci)}${where} fehlt in der Lösung.`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Course and catalog rules

/** Every available course has an Ausspielen step; required play-out material per course. */
export function checkCourseRules(courses: readonly CourseMeta[], lessons: readonly LoadedLesson[]): LessonFindings {
  const out = issues();
  for (const c of courses) {
    if (c.status !== 'available') continue;
    const items = new Set([...c.lessonIds, ...(c.testLessonId ? [c.testLessonId] : [])]);
    const steps = lessons.filter((l) => l.lesson.courseId === c.id && items.has(l.lesson.id)).flatMap((l) => l.lesson.steps);
    const playOuts = steps.filter((s) => s.type === 'play_out');
    if (playOuts.length === 0) out.errors.push({ file: CATALOG_FILE, id: c.id, message: 'Der Kurs braucht mindestens einen Ausspielen-Schritt.' });
    for (const sig of REQUIRED_PLAY_OUTS[c.id] ?? []) {
      if (!playOuts.some((s) => materialSignature(s.fen) === sig)) out.errors.push({ file: CATALOG_FILE, id: c.id, message: `Ausspielen mit ${sig} fehlt.` });
    }
    if (c.testLessonId === undefined) out.errors.push({ file: CATALOG_FILE, id: c.id, message: 'Verfügbare Kurse brauchen einen Kurstest (testLessonId).' });
  }
  return out;
}

/** Launch scope of P0-13 (6 courses, 28–32 lessons, 6 tests, 1 skip test, ≥ 30 easy puzzles, planned courses). */
export function checkLaunchScope(courses: readonly CourseMeta[], lessons: readonly LoadedLesson[]): LessonFindings {
  const out = issues();
  const available = courses.filter((c) => c.status === 'available');
  const lessonCount = available.reduce((n, c) => n + c.lessonIds.length, 0);
  const tests = available.filter((c) => c.testLessonId).length;
  const skip = lessons.filter((l) => l.lesson.kind === 'skip_test').length;
  const puzzles = lessons.flatMap((l) => l.lesson.steps).filter((s) => s.type === 'find_move' && s.puzzle).length;
  const add = (ok: boolean, message: string) => {
    if (!ok) out.errors.push({ file: CATALOG_FILE, message });
  };
  add(available.length === LAUNCH_SCOPE.availableCourses, `${available.length} verfügbare Kurse – erwartet ${LAUNCH_SCOPE.availableCourses}.`);
  add(lessonCount >= LAUNCH_SCOPE.minLessons && lessonCount <= LAUNCH_SCOPE.maxLessons, `${lessonCount} Lektionen – erwartet ${LAUNCH_SCOPE.minLessons}–${LAUNCH_SCOPE.maxLessons}.`);
  add(tests === LAUNCH_SCOPE.courseTests, `${tests} Kurstests – erwartet ${LAUNCH_SCOPE.courseTests}.`);
  add(skip === LAUNCH_SCOPE.skipTests, `${skip} Einstufungstests – erwartet ${LAUNCH_SCOPE.skipTests}.`);
  add(puzzles >= LAUNCH_SCOPE.minPuzzles, `${puzzles} als Puzzle markierte Übungen – erwartet mindestens ${LAUNCH_SCOPE.minPuzzles}.`);
  add(courses.some((c) => c.status === 'planned'), 'Geplante Kurse aus dem Lehrplan fehlen im Katalog.');
  for (const stage of [0, 1] as const) {
    if (!available.some((c) => c.stage === stage)) add(false, `Keine verfügbaren Kurse in Stufe ${stage}.`);
  }
  return out;
}
