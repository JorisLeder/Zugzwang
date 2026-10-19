import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lazyRoutes, patternToRegExp, preloadScript } from './routePreload';

const ROOT = join(import.meta.dirname, '..', '..');

describe('routePreload', () => {
  it('turns route patterns into anchored expressions for location.pathname', () => {
    const home = new RegExp(patternToRegExp('/'));
    expect(home.test('/')).toBe(true);
    expect(home.test('/play')).toBe(false);
    const lesson = new RegExp(patternToRegExp('/learn/:courseId/:lessonId'));
    expect(lesson.test('/learn/brett-und-figuren/brett-und-feldnamen')).toBe(true);
    expect(lesson.test('/learn/brett-und-figuren/brett-und-feldnamen/')).toBe(true);
    expect(lesson.test('/learn/brett-und-figuren')).toBe(false);
    expect(new RegExp(patternToRegExp('/puzzles/rated')).test('/puzzles/rated-x')).toBe(false);
  });

  it('reads every lazy feature route with its page module', () => {
    const routes = lazyRoutes(ROOT);
    const byPattern = new Map(routes.map((r) => [r.pattern, r.module]));
    expect(byPattern.get('/')).toBe(join(ROOT, 'src/features/dashboard/pages/DashboardPage'));
    expect(byPattern.get('/puzzles/rated')).toBe(join(ROOT, 'src/features/puzzles/pages/RatedPuzzlesPage'));
    expect(byPattern.get('/learn/:courseId/:lessonId')).toBe(join(ROOT, 'src/features/lessons/pages/LessonPage'));
    expect(routes.length).toBeGreaterThanOrEqual(20);
  });

  it('builds a script that preloads the chunks of the first matching route only', () => {
    const script = preloadScript(
      [
        { re: patternToRegExp('/analysis/import'), files: ['assets/import.js'] },
        { re: patternToRegExp('/analysis/:gameId'), files: ['assets/review.js', 'assets/board.js'] },
      ],
      '/',
    );
    const added: Array<{ rel: string; href: string; crossOrigin: string | null }> = [];
    const document = {
      createElement: () => ({ rel: '', href: '', crossOrigin: null as string | null }),
      head: { appendChild: (l: (typeof added)[number]) => added.push(l) },
    };
    new Function('location', 'document', script)({ pathname: '/analysis/import' }, document);
    expect(added).toEqual([{ rel: 'modulepreload', href: '/assets/import.js', crossOrigin: '' }]);
    added.length = 0;
    new Function('location', 'document', script)({ pathname: '/analysis/g1' }, document);
    expect(added.map((l) => l.href)).toEqual(['/assets/review.js', '/assets/board.js']);
  });
});
