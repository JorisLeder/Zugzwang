import { describe, expect, it } from 'vitest';
import type { Puzzle } from '@/core/puzzles';
import { createMemoryDataServices, FIXTURE_PUZZLES, seededRandom } from '@/core/testing';
import { puzzleAttemptInput } from './attempt';
import {
  countThemePuzzles,
  difficultyRange,
  openingTagsForTheme,
  selectLearning,
  selectNear,
  selectNextRated,
  selectThemePuzzle,
} from './select';

const base = FIXTURE_PUZZLES.find((p) => p.id === 'fixture-knight-fork')!;

/** Synthetic puzzle (selection does not look at the position). */
function puzzle(id: string, rating: number, themes: string[] = ['fork'], openingTags: string[] = []): Puzzle {
  return { ...structuredClone(base), id, rating, themes, openingTags };
}

function bank(ratings: number[]): Puzzle[] {
  return ratings.map((r, i) => puzzle(`p${i}`, r));
}

describe('selectNear / selectNextRated windows (D-32)', () => {
  it('prefers ±150, then widens to ±250, ±400 and finally the closest of any rating', async () => {
    const data = createMemoryDataServices({ puzzles: bank([600, 760, 950, 1500]), random: seededRandom(1) });
    const repos = data.repos;
    expect(await selectNear(repos.puzzles, 600)).toMatchObject({ puzzle: { id: 'p0' }, window: 150 }); // 760 is 160 away
    expect(await selectNear(repos.puzzles, 650, { excludeIds: ['p0'] })).toMatchObject({ puzzle: { id: 'p1' }, window: 150 });
    expect(await selectNear(repos.puzzles, 500, { excludeIds: ['p0'] })).toMatchObject({ puzzle: { id: 'p1' }, window: 400 });
    expect(await selectNear(repos.puzzles, 720, { excludeIds: ['p0', 'p1'] })).toMatchObject({ puzzle: { id: 'p2' }, window: 250 });
    expect(await selectNear(repos.puzzles, 100, { excludeIds: ['p0', 'p1'] })).toMatchObject({ puzzle: { id: 'p2' }, window: null });
    expect(await selectNear(repos.puzzles, 1400, { excludeIds: ['p0', 'p1', 'p2'] })).toMatchObject({ puzzle: { id: 'p3' }, window: 150 });
    expect(await selectNear(repos.puzzles, 3000, { excludeIds: ['p0', 'p1', 'p2'] })).toMatchObject({ puzzle: { id: 'p3' }, window: null });
    expect(await selectNear(repos.puzzles, 650, { excludeIds: ['p0', 'p1', 'p2', 'p3'] })).toBeNull();
  });

  it('never serves a puzzle with a rated attempt and reports exhaustion', async () => {
    const data = createMemoryDataServices({ puzzles: bank([600, 610]), random: seededRandom(2) });
    await data.progress.initializeFromSelfAssessment('beginner');
    const repos = { puzzles: data.repos.puzzles, puzzleAttempts: data.repos.puzzleAttempts };
    const first = await selectNextRated(repos, 600);
    expect(first.kind).toBe('puzzle');
    if (first.kind !== 'puzzle') return;
    await data.progress.recordPuzzleAttempt(puzzleAttemptInput(first.puzzle, 'rated', { solved: true, firstTry: true, hintsUsed: 0, solutionShown: false }, 1000));
    const second = await selectNextRated(repos, 600);
    expect(second.kind === 'puzzle' && second.puzzle.id).not.toBe(first.puzzle.id);
    // Learning attempts do not block rated puzzles.
    if (second.kind === 'puzzle') {
      await data.progress.recordPuzzleAttempt(puzzleAttemptInput(second.puzzle, 'learning', { solved: true, firstTry: true, hintsUsed: 0, solutionShown: false }, 1000));
      expect(await selectNextRated(repos, 600)).toMatchObject({ kind: 'puzzle', puzzle: { id: second.puzzle.id } });
      expect(await selectNextRated(repos, 600, { excludeIds: [second.puzzle.id] })).toEqual({ kind: 'exhausted' });
    }
  });

  it('500 simulated rated attempts: within ±150 whenever possible, never a repeat', async () => {
    const rnd = seededRandom(42);
    // 900 puzzles, dense around 400–1200 and sparse above, so the windows must widen as the bank runs dry.
    const ratings = Array.from({ length: 900 }, (_, i) => (i < 800 ? 400 + Math.round(rnd() * 800) : 1300 + Math.round(rnd() * 1200)));
    const all = bank(ratings);
    const data = createMemoryDataServices({ puzzles: all, random: seededRandom(7) });
    await data.progress.initializeFromSelfAssessment('beginner');
    const repos = { puzzles: data.repos.puzzles, puzzleAttempts: data.repos.puzzleAttempts };
    const served = new Set<string>();
    const windowsUsed = new Map<number | null, number>();
    for (let i = 0; i < 500; i++) {
      const rating = (await data.repos.ratings.get('puzzle'))!.rating;
      const sel = await selectNextRated(repos, rating);
      expect(sel.kind).toBe('puzzle');
      if (sel.kind !== 'puzzle') return;
      const p = sel.puzzle;
      expect(served.has(p.id)).toBe(false);
      const center = Math.round(rating);
      const available = all.filter((x) => !served.has(x.id));
      const firstWindow = [150, 250, 400].find((w) => available.some((x) => Math.abs(x.rating - center) <= w)) ?? null;
      expect(sel.window).toBe(firstWindow); // widened only when every narrower window is empty
      if (firstWindow !== null) expect(Math.abs(p.rating - center)).toBeLessThanOrEqual(firstWindow);
      windowsUsed.set(sel.window, (windowsUsed.get(sel.window) ?? 0) + 1);
      served.add(p.id);
      // A learner who solves about 60 % of the puzzles.
      const solved = rnd() < 0.6;
      await data.progress.recordPuzzleAttempt(
        puzzleAttemptInput(p, 'rated', { solved, firstTry: solved, hintsUsed: 0, solutionShown: false }, 20_000),
      );
    }
    expect((await data.repos.puzzleAttempts.ratedPuzzleIds()).size).toBe(500);
    // Mostly the ±150 window; once the region around the rating is used up, the wider steps are exercised too.
    expect(windowsUsed.get(150)!).toBeGreaterThan(250);
    expect((windowsUsed.get(250) ?? 0) + (windowsUsed.get(400) ?? 0) + (windowsUsed.get(null) ?? 0)).toBeGreaterThan(0);
  });
});

describe('learning mode selection', () => {
  it('avoids seen puzzles and the current one, repeats only when everything was seen', async () => {
    const data = createMemoryDataServices({ puzzles: bank([600, 620]), random: seededRandom(3) });
    const repo = data.repos.puzzles;
    expect((await selectLearning(repo, 600, { seenIds: ['p0'] }))!.id).toBe('p1');
    expect((await selectLearning(repo, 600, { seenIds: ['p0', 'p1'], currentId: 'p1' }))!.id).toBe('p0');
    expect(await selectLearning(createMemoryDataServices().repos.puzzles, 600)).toBeNull();
  });
});

describe('theme training selection', () => {
  const themed = [
    puzzle('f1', 400, ['fork'], ['Italian_Game']),
    puzzle('f2', 600, ['fork', 'middlegame'], ['Italian_Game', 'Sicilian_Defense']),
    puzzle('f3', 800, ['fork'], ['Sicilian_Defense']),
    puzzle('k1', 600, ['pin']),
  ];

  it('maps difficulties to rating ranges around the user rating', () => {
    expect(difficultyRange('easy', 600)).toEqual({ ratingMin: 300, ratingMax: 500 });
    expect(difficultyRange('medium', 600)).toEqual({ ratingMin: 500, ratingMax: 700 });
    expect(difficultyRange('hard', 600)).toEqual({ ratingMin: 700, ratingMax: 900 });
    expect(difficultyRange('all', 600)).toEqual({});
  });

  it('counts and selects by theme, difficulty and opening', async () => {
    const repo = createMemoryDataServices({ puzzles: themed, random: seededRandom(4) }).repos.puzzles;
    expect(await countThemePuzzles(repo, { theme: 'fork', difficulty: 'all', userRating: 600 })).toBe(3);
    expect(await countThemePuzzles(repo, { theme: 'fork', difficulty: 'easy', userRating: 600 })).toBe(1);
    expect(await countThemePuzzles(repo, { theme: 'fork', difficulty: 'all', userRating: 600, openingTag: 'Sicilian_Defense' })).toBe(2);
    expect((await selectThemePuzzle(repo, { theme: 'fork', difficulty: 'hard', userRating: 600 }))!.id).toBe('f3');
    expect((await selectThemePuzzle(repo, { theme: 'fork', difficulty: 'medium', userRating: 600 }, { seenIds: ['f2'], currentId: 'f2' }))!.id).toBe('f2');
    expect(await selectThemePuzzle(repo, { theme: 'skewer', difficulty: 'all', userRating: 600 })).toBeNull();
    const fresh = await selectThemePuzzle(repo, { theme: 'fork', difficulty: 'all', userRating: 600 }, { seenIds: ['f1', 'f2'] });
    expect(fresh!.id).toBe('f3');
  });

  it('lists opening tags of a theme, most frequent first', async () => {
    const repo = createMemoryDataServices({ puzzles: themed }).repos.puzzles;
    expect(await openingTagsForTheme(repo, 'fork')).toEqual(['Italian_Game', 'Sicilian_Defense']);
    expect(await openingTagsForTheme(repo, 'skewer')).toEqual([]);
  });
});
