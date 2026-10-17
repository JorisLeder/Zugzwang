import { describe, expect, it, vi } from 'vitest';
import * as fixtures from './__fixtures__';
import { loadCatalog, loadLesson } from './index';
import { createLessonLoader, parseCatalog, sourcesFromGlob, type LessonSources } from './loader';
import { lessonFilePath } from './loader';

const COURSE = {
  id: 'regeln',
  stage: 0,
  order: 1,
  version: 1,
  titleDe: 'Regeln',
  descriptionDe: 'Die Regeln.',
  status: 'available',
  lessonIds: ['regeln-1'],
  testLessonId: 'regeln-test',
};
const PLANNED = { ...COURSE, id: 'spaeter', order: 2, status: 'planned', lessonIds: [], testLessonId: undefined };

function lessonJson(id: string, courseId = 'regeln', extra: Record<string, unknown> = {}) {
  return {
    id,
    courseId,
    order: 1,
    version: 1,
    kind: 'lesson',
    titleDe: `Lektion ${id}`,
    summaryDe: 'Kurz.',
    practiceThemes: [],
    steps: [{ id: 's1', type: 'explanation', textDe: 'Text', fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' }],
    ...extra,
  };
}

function sources(over: Partial<LessonSources> = {}): LessonSources {
  return {
    catalog: async () => ({ courses: [COURSE, PLANNED] }),
    lessons: {
      'regeln/regeln-1': async () => lessonJson('regeln-1'),
      'regeln/regeln-test': async () => lessonJson('regeln-test', 'regeln', { kind: 'course_test' }),
    },
    fixtures: async () => fixtures,
    ...over,
  };
}

describe('lesson loader (D-26)', () => {
  it('loads the catalog with planned courses, sorted by stage and order', async () => {
    const data = await createLessonLoader(sources()).loadCatalog({ e2e: false });
    expect(data.errors).toEqual([]);
    expect(data.courses.map((c) => [c.id, c.status])).toEqual([
      ['regeln', 'available'],
      ['spaeter', 'planned'],
    ]);
  });

  it('adds the fixture course only in e2e builds (D-52)', async () => {
    const loader = createLessonLoader(sources());
    expect((await loader.loadCatalog({ e2e: false })).courses.some((c) => c.id === 'fixture-course')).toBe(false);
    expect((await loader.loadCatalog({ e2e: true })).courses.some((c) => c.id === 'fixture-course')).toBe(true);
    expect((await loader.loadLesson('fixture-course', 'fixture-lesson', { e2e: false })).ok).toBe(false);
    const fx = await loader.loadLesson('fixture-course', 'fixture-lesson', { e2e: true });
    expect(fx.ok && fx.lesson.steps.map((s) => s.type)).toEqual(['explanation', 'demo', 'find_move', 'quiz', 'play_out']);
  });

  it('keeps the valid courses of a broken catalog and reports the broken entry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const data = await createLessonLoader(sources({ catalog: async () => ({ courses: [COURSE, { id: 'kaputt', stage: 9 }] }) })).loadCatalog({
      e2e: false,
    });
    expect(data.courses.map((c) => c.id)).toEqual(['regeln']);
    expect(data.errors.length).toBeGreaterThan(0);
    expect(data.errors[0]!.file).toBe('content/lessons/catalog.json');
    warn.mockRestore();
  });

  it('a missing catalog, an import error and stray files are reported, never thrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missing = await createLessonLoader(sources({ catalog: undefined, strayFiles: ['content/lessons/x.json'] })).loadCatalog({ e2e: true });
    expect(missing.courses.map((c) => c.id)).toEqual(['fixture-course']);
    expect(missing.errors.map((e) => e.file)).toEqual(['content/lessons/catalog.json', 'content/lessons/x.json']);
    const broken = await createLessonLoader(
      sources({
        catalog: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
      }),
    ).loadCatalog({ e2e: true });
    expect(broken.courses.map((c) => c.id)).toEqual(['fixture-course']);
    expect(broken.errors).toHaveLength(1);
    warn.mockRestore();
  });

  it('reports duplicate course ids and lessons listed in two courses', () => {
    const dup = parseCatalog({ courses: [COURSE, COURSE, { ...COURSE, id: 'andere' }] });
    expect(dup.courses.map((c) => c.id)).toEqual(['andere', 'regeln']);
    expect(dup.errors.map((e) => e.messageDe).join(' ')).toMatch(/doppelt.*mehreren Kursen/);
  });

  it('a half-written lesson file is "invalid" (shown as a dev error) while other lessons still load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loader = createLessonLoader(
      sources({
        lessons: {
          'regeln/regeln-1': async () => ({ id: 'regeln-1', courseId: 'regeln', steps: [{ type: 'quiz' }] }),
          'regeln/regeln-test': () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
        },
      }),
    );
    const bad = await loader.loadLesson('regeln', 'regeln-1', { e2e: true });
    expect(bad).toMatchObject({ ok: false, reason: 'invalid', error: { file: lessonFilePath('regeln', 'regeln-1') } });
    const broken = await loader.loadLesson('regeln', 'regeln-test', { e2e: true });
    expect(broken).toMatchObject({ ok: false, reason: 'invalid' });
    expect((await loader.loadLesson('regeln', 'fehlt', { e2e: true })).ok).toBe(false);
    expect((await loader.loadLesson('fixture-course', 'fixture-lesson', { e2e: true })).ok).toBe(true);
    warn.mockRestore();
  });

  it('rejects files whose id or courseId does not match the path, and illegal positions or moves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loader = createLessonLoader(
      sources({
        lessons: {
          'regeln/regeln-1': async () => lessonJson('anders'),
          'regeln/zug': async () =>
            lessonJson('zug', 'regeln', {
              steps: [{ id: 'd', type: 'demo', startFen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', moves: [{ uci: 'e1e3' }] }],
            }),
          'regeln/fen': async () =>
            lessonJson('fen', 'regeln', { steps: [{ id: 'x', type: 'explanation', textDe: 'T', fen: '8/8/8/8/8/8/8/8 w - - 0 1' }] }),
        },
      }),
    );
    const mismatch = await loader.loadLesson('regeln', 'regeln-1', { e2e: false });
    expect(!mismatch.ok && mismatch.error.messageDe).toMatch(/erwartet wird „regeln-1“/);
    const move = await loader.loadLesson('regeln', 'zug', { e2e: false });
    expect(!move.ok && move.error.messageDe).toMatch(/e1e3/);
    const fen = await loader.loadLesson('regeln', 'fen', { e2e: false });
    expect(fen.ok).toBe(false);
    warn.mockRestore();
  });

  it('retries a failed import instead of caching the failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let calls = 0;
    const loader = createLessonLoader(
      sources({
        lessons: {
          'regeln/regeln-1': async () => {
            calls++;
            if (calls === 1) throw new Error('offline');
            return lessonJson('regeln-1');
          },
        },
      }),
    );
    expect((await loader.loadLesson('regeln', 'regeln-1', { e2e: false })).ok).toBe(false);
    expect((await loader.loadLesson('regeln', 'regeln-1', { e2e: false })).ok).toBe(true);
    warn.mockRestore();
  });

  it('finds the skip test: the fixture one in e2e builds, otherwise an unlisted file of kind skip_test', async () => {
    const skip = lessonJson('einstufung', 'regeln', { kind: 'skip_test' });
    const loader = createLessonLoader(sources({ lessons: { ...sources().lessons, 'regeln/einstufung': async () => skip } }));
    const e2e = await loader.findSkipTest(await loader.loadCatalog({ e2e: true }), { e2e: true });
    expect(e2e && [e2e.courseId, e2e.lessonId]).toEqual(['fixture-course', 'fixture-skip-test']);
    const app = await loader.findSkipTest(await loader.loadCatalog({ e2e: false }), { e2e: false });
    expect(app && [app.courseId, app.lessonId]).toEqual(['regeln', 'einstufung']);
    const none = createLessonLoader(sources());
    expect(await none.findSkipTest(await none.loadCatalog({ e2e: false }), { e2e: false })).toBeNull();
  });

  it('sourcesFromGlob splits catalog, lesson files and stray files', () => {
    const load = async () => ({});
    const s = sourcesFromGlob({
      '/content/lessons/catalog.json': load,
      '/content/lessons/regeln/regeln-1.json': load,
      '/content/lessons/notes.json': load,
      '/content/lessons/a/b/c.json': load,
    });
    expect(s.catalog).toBe(load);
    expect(Object.keys(s.lessons)).toEqual(['regeln/regeln-1']);
    expect(s.strayFiles).toEqual(['content/lessons/notes.json', 'content/lessons/a/b/c.json']);
  });

  it('the default loader (import.meta.glob) serves the fixture course in e2e mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const data = await loadCatalog({ e2e: true });
    expect(data.courses.find((c) => c.id === 'fixture-course')?.lessonIds).toEqual(['fixture-lesson', 'fixture-lesson-2']);
    expect((await loadLesson('fixture-course', 'fixture-test', { e2e: true })).ok).toBe(true);
    warn.mockRestore();
  });
});
