/**
 * Fixture course `fixture-course` for tests and e2e builds (D-52): two lessons (the first one uses all five step
 * types), a course test and a Stufe-0 skip test. Positions and claims are checked in `fixtures.test.ts` with
 * `@/lib/chess` (legality, mates, quiz asserts). Loaded by the lesson loader only when `config.e2e` is true.
 */
import catalog from './catalog.json';
import lesson from './fixture-course/fixture-lesson.json';
import lesson2 from './fixture-course/fixture-lesson-2.json';
import skipTestLesson from './fixture-course/fixture-skip-test.json';
import courseTest from './fixture-course/fixture-test.json';

/** Catalog entries of the fixture course. */
export const courses: unknown[] = catalog.courses;

/** Raw lesson JSON by `courseId/lessonId`. */
export const lessons: Record<string, unknown> = {
  'fixture-course/fixture-lesson': lesson,
  'fixture-course/fixture-lesson-2': lesson2,
  'fixture-course/fixture-test': courseTest,
  'fixture-course/fixture-skip-test': skipTestLesson,
};

/** The fixture's Stufe-0 skip test. */
export const skipTest = 'fixture-course/fixture-skip-test';
