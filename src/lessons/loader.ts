/**
 * Lesson content loader (D-26, D-52, BACKLOG WP-06).
 *
 * - Content: `content/lessons/catalog.json` (`lessonCatalogSchema`) and `content/lessons/<courseId>/<lessonId>.json`
 *   (`lessonSchema`), found with `import.meta.glob` and imported lazily – one chunk per file, so a broken file only
 *   breaks itself.
 * - Invalid content never crashes: a broken catalog keeps its valid courses, a broken lesson is reported as an error
 *   (`ContentError`, shown to authors in development) and treated as "not available" in production.
 * - In e2e builds (`config.e2e`, D-52) the fixture course `fixture-course` from `src/lessons/__fixtures__/` is added
 *   (dynamic import, so it never reaches production bundles). Production never shows it.
 * - The Stufe-0 skip test is the lesson file with `kind: 'skip_test'`; `findSkipTest` looks for it among files that no
 *   course lists, then among the course tests and lessons of Stufe 0 (the fixture's skip test first in e2e builds).
 */
import type { CourseMeta, Lesson } from '@/core/lessons';
import { courseMetaSchema, lessonCatalogSchema } from '@/core/schemas';
import { courseItemIds } from './unlock';
import { LESSONS_DE } from './strings.de';
import { formatSchemaIssues, parseLessonFile } from './validate';

const E = LESSONS_DE.errors;

/** A problem with a content file (German message for content authors). */
export interface ContentError {
  /** Path relative to the project, e.g. `content/lessons/gabel/gabel-1.json`. */
  file: string;
  messageDe: string;
}

/** The loaded catalog. */
export interface LessonCatalogData {
  /** Every course (available and planned, fixture in e2e), sorted by stage and order. */
  courses: CourseMeta[];
  /** Content problems found while loading the catalog. */
  errors: ContentError[];
}

/** Result of loading one lesson. */
export type LessonLoadResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; reason: 'not_found' | 'invalid'; error: ContentError };

/** Lessons of one course (in course order; broken files are left out and reported). */
export interface CourseLessons {
  lessons: Lesson[];
  errors: ContentError[];
}

/** Where the skip test lives. */
export interface SkipTestRef {
  courseId: string;
  lessonId: string;
  lesson: Lesson;
}

/** Options of every load call. */
export interface LoadOptions {
  /** Include the fixture course (`useServices().config.e2e`, D-52). */
  e2e: boolean;
}

/** Fixture content (shape of `src/lessons/__fixtures__/index.ts`). */
export interface FixtureContent {
  /** Catalog entries of the fixture courses. */
  courses: unknown[];
  /** Raw lesson JSON by `courseId/lessonId`. */
  lessons: Record<string, unknown>;
  /** `courseId/lessonId` of the fixture skip test. */
  skipTest?: string;
}

/** Module loaders the loader reads from (tests pass their own). */
export interface LessonSources {
  /** `catalog.json`, `undefined` if the file does not exist. */
  catalog?: () => Promise<unknown>;
  /** Lesson files by `courseId/lessonId`. */
  lessons: Readonly<Record<string, () => Promise<unknown>>>;
  /** Files below `content/lessons/` that do not follow the layout (reported once). */
  strayFiles?: readonly string[];
  /** Fixture course for e2e builds. */
  fixtures?: () => Promise<FixtureContent>;
}

/** Loader API (`createLessonLoader`). */
export interface LessonLoader {
  loadCatalog(opts: LoadOptions): Promise<LessonCatalogData>;
  loadLesson(courseId: string, lessonId: string, opts: LoadOptions): Promise<LessonLoadResult>;
  loadCourseLessons(course: CourseMeta, opts: LoadOptions): Promise<CourseLessons>;
  findSkipTest(catalog: LessonCatalogData, opts: LoadOptions): Promise<SkipTestRef | null>;
}

const CONTENT_ROOT = 'content/lessons';

/** Display path of a lesson file. */
export function lessonFilePath(courseId: string, lessonId: string): string {
  return `${CONTENT_ROOT}/${courseId}/${lessonId}.json`;
}

/** `courseId/lessonId` key. */
export function lessonKey(courseId: string, lessonId: string): string {
  return `${courseId}/${lessonId}`;
}

function sortCourses(courses: CourseMeta[]): CourseMeta[] {
  return [...courses].sort((a, b) => a.stage - b.stage || a.order - b.order || a.id.localeCompare(b.id));
}

/** Parses catalog JSON; keeps every valid course when the whole catalog does not validate. */
export function parseCatalog(raw: unknown, file = `${CONTENT_ROOT}/catalog.json`): LessonCatalogData {
  const whole = lessonCatalogSchema.safeParse(raw);
  const errors: ContentError[] = [];
  let courses: CourseMeta[];
  if (whole.success) {
    courses = whole.data.courses;
  } else {
    errors.push({ file, messageDe: `${E.catalogInvalid}: ${formatSchemaIssues(whole.error.issues)}` });
    const list = raw && typeof raw === 'object' && Array.isArray((raw as { courses?: unknown }).courses) ? (raw as { courses: unknown[] }).courses : [];
    courses = [];
    list.forEach((entry, index) => {
      const one = courseMetaSchema.safeParse(entry);
      if (one.success) courses.push(one.data);
      else errors.push({ file, messageDe: `${E.courseInvalid(index)}: ${formatSchemaIssues(one.error.issues)}` });
    });
  }
  const seen = new Set<string>();
  const unique: CourseMeta[] = [];
  for (const c of courses) {
    if (seen.has(c.id)) {
      errors.push({ file, messageDe: E.duplicateCourse(c.id) });
      continue;
    }
    seen.add(c.id);
    unique.push(c);
  }
  const owner = new Map<string, string>();
  for (const c of unique) {
    for (const id of courseItemIds(c)) {
      const prev = owner.get(id);
      if (prev && prev !== c.id) errors.push({ file, messageDe: E.duplicateLesson(id) });
      else owner.set(id, c.id);
    }
  }
  return { courses: sortCourses(unique), errors };
}

/** Creates a loader over the given sources. Results are cached; failed imports are retried on the next call. */
export function createLessonLoader(sources: LessonSources): LessonLoader {
  const lessonCache = new Map<string, Promise<LessonLoadResult>>();
  let fixturePromise: Promise<FixtureContent | null> | null = null;

  function fixtures(): Promise<FixtureContent | null> {
    if (!sources.fixtures) return Promise.resolve(null);
    if (!fixturePromise) {
      fixturePromise = sources.fixtures().catch((err: unknown) => {
        console.warn('Lesson fixtures could not be loaded', err);
        fixturePromise = null;
        return null;
      });
    }
    return fixturePromise;
  }

  async function loadCatalog(opts: LoadOptions): Promise<LessonCatalogData> {
    const file = `${CONTENT_ROOT}/catalog.json`;
    let data: LessonCatalogData;
    if (!sources.catalog) {
      data = { courses: [], errors: [{ file, messageDe: E.catalogMissing }] };
    } else {
      try {
        data = parseCatalog(await sources.catalog(), file);
      } catch (err) {
        console.warn('Lesson catalog could not be imported', err);
        data = { courses: [], errors: [{ file, messageDe: E.importFailed }] };
      }
    }
    for (const stray of sources.strayFiles ?? []) data.errors.push({ file: stray, messageDe: E.unknownFile });
    if (opts.e2e) {
      const fx = await fixtures();
      if (fx) {
        const parsed = parseCatalog({ courses: fx.courses }, 'src/lessons/__fixtures__');
        const ids = new Set(data.courses.map((c) => c.id));
        data = {
          courses: sortCourses([...data.courses, ...parsed.courses.filter((c) => !ids.has(c.id))]),
          errors: [...data.errors, ...parsed.errors],
        };
      }
    }
    if (data.errors.length > 0) console.warn('Lesson content problems', data.errors);
    return data;
  }

  async function importLesson(courseId: string, lessonId: string, opts: LoadOptions): Promise<LessonLoadResult> {
    const key = lessonKey(courseId, lessonId);
    if (opts.e2e) {
      const fx = await fixtures();
      if (fx && key in fx.lessons) {
        const parsed = parseLessonFile(fx.lessons[key], courseId, lessonId);
        return parsed.ok
          ? { ok: true, lesson: parsed.lesson }
          : { ok: false, reason: 'invalid', error: { file: `src/lessons/__fixtures__/${key}.json`, messageDe: parsed.messageDe } };
      }
    }
    const file = lessonFilePath(courseId, lessonId);
    const load = sources.lessons[key];
    if (!load) return { ok: false, reason: 'not_found', error: { file, messageDe: E.notFound } };
    let raw: unknown;
    try {
      raw = await load();
    } catch (err) {
      console.warn(`Lesson ${file} could not be imported`, err);
      throw Object.assign(new Error(E.importFailed), { contentError: { file, messageDe: E.importFailed } satisfies ContentError });
    }
    const parsed = parseLessonFile(raw, courseId, lessonId);
    if (!parsed.ok) {
      console.warn(`Lesson ${file} is invalid: ${parsed.messageDe}`);
      return { ok: false, reason: 'invalid', error: { file, messageDe: parsed.messageDe } };
    }
    return { ok: true, lesson: parsed.lesson };
  }

  function loadLesson(courseId: string, lessonId: string, opts: LoadOptions): Promise<LessonLoadResult> {
    const cacheKey = `${opts.e2e ? 'e2e' : 'app'}:${lessonKey(courseId, lessonId)}`;
    const cached = lessonCache.get(cacheKey);
    if (cached) return cached;
    const promise = importLesson(courseId, lessonId, opts).catch((err: unknown) => {
      // An import that failed (e.g. invalid JSON, offline) is not cached – the next call tries again.
      lessonCache.delete(cacheKey);
      const contentError = (err as { contentError?: ContentError }).contentError;
      return {
        ok: false as const,
        reason: 'invalid' as const,
        error: contentError ?? { file: lessonFilePath(courseId, lessonId), messageDe: E.importFailed },
      };
    });
    lessonCache.set(cacheKey, promise);
    return promise;
  }

  async function loadCourseLessons(course: CourseMeta, opts: LoadOptions): Promise<CourseLessons> {
    const results = await Promise.all(courseItemIds(course).map((id) => loadLesson(course.id, id, opts)));
    const lessons: Lesson[] = [];
    const errors: ContentError[] = [];
    for (const r of results) {
      if (r.ok) lessons.push(r.lesson);
      else errors.push(r.error);
    }
    return { lessons, errors };
  }

  async function findSkipTest(catalog: LessonCatalogData, opts: LoadOptions): Promise<SkipTestRef | null> {
    const candidates: Array<[string, string]> = [];
    const add = (courseId: string, lessonId: string) => {
      if (!candidates.some(([c, l]) => c === courseId && l === lessonId)) candidates.push([courseId, lessonId]);
    };
    if (opts.e2e) {
      const fx = await fixtures();
      const [c, l] = fx?.skipTest?.split('/') ?? [];
      if (c && l) add(c, l);
    }
    const referenced = new Set(catalog.courses.flatMap((c) => courseItemIds(c).map((id) => lessonKey(c.id, id))));
    for (const key of Object.keys(sources.lessons).sort()) {
      if (referenced.has(key)) continue;
      const [c, l] = key.split('/');
      if (c && l) add(c, l);
    }
    const stageZero = catalog.courses.filter((c) => c.stage === 0);
    for (const c of stageZero) if (c.testLessonId) add(c.id, c.testLessonId);
    for (const c of stageZero) for (const id of c.lessonIds) add(c.id, id);
    for (const [courseId, lessonId] of candidates) {
      const r = await loadLesson(courseId, lessonId, opts);
      if (r.ok && r.lesson.kind === 'skip_test') return { courseId, lessonId, lesson: r.lesson };
    }
    return null;
  }

  return { loadCatalog, loadLesson, loadCourseLessons, findSkipTest };
}

/** Splits `import.meta.glob` keys (`/content/lessons/…`) into catalog, lesson files and stray files. */
export function sourcesFromGlob(
  modules: Readonly<Record<string, () => Promise<unknown>>>,
  fixtures?: () => Promise<FixtureContent>,
): LessonSources {
  const lessons: Record<string, () => Promise<unknown>> = {};
  const strayFiles: string[] = [];
  let catalog: (() => Promise<unknown>) | undefined;
  for (const [path, load] of Object.entries(modules)) {
    const rel = path.replace(/^\/+/, '');
    if (rel === `${CONTENT_ROOT}/catalog.json`) {
      catalog = load;
      continue;
    }
    const m = /^content\/lessons\/([^/]+)\/([^/]+)\.json$/.exec(rel);
    if (m) lessons[lessonKey(m[1]!, m[2]!)] = load;
    else strayFiles.push(rel);
  }
  return { catalog, lessons, strayFiles, fixtures };
}
