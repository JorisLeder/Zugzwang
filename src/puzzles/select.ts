/**
 * Puzzle selection (PRD P0-04, P0-05, P0-06, D-32).
 *
 * - Rated: window ±150 around the current puzzle rating, never a puzzle with a previous rated attempt; only when the
 *   window is empty it widens to ±250, ±400 and finally any rating (the UI shows a short notice). If every puzzle has
 *   a rated attempt the result is `exhausted` (the UI offers the learning mode).
 * - Learning: same windows around the rating, avoids puzzles seen in this session; repeats are allowed when nothing
 *   new is left (learning mode is unrated).
 * - Theme training: puzzles with the theme (and optional opening tag) in the difficulty range around the rating.
 */
import type { Puzzle, PuzzleQuery, PuzzleThemeId } from '@/core/puzzles';
import type { PuzzleAttemptRepository, PuzzleRepository } from '@/core/storage';

/** Rating windows tried in order (D-32); after the last one any rating is allowed. */
export const RATING_WINDOWS: readonly number[] = [150, 250, 400];

/** Repositories needed for selection. */
export interface PuzzleSelectionRepos {
  puzzles: PuzzleRepository;
  puzzleAttempts: PuzzleAttemptRepository;
}

/** Result of the rated selection. `window` is the half-width used, `null` = any rating (widest step). */
export type RatedSelection = { kind: 'puzzle'; puzzle: Puzzle; window: number | null } | { kind: 'exhausted' };

/** Filters shared by all selections. */
export interface SelectionFilter {
  themes?: PuzzleThemeId[];
  openingTag?: string;
}

type BaseQuery = Omit<PuzzleQuery, 'limit' | 'ratingMin' | 'ratingMax' | 'shuffle'>;

/** The unattempted puzzle closest to `center` regardless of rating (last widening step). */
async function closestAnyRating(repo: PuzzleRepository, center: number, base: BaseQuery): Promise<Puzzle | null> {
  const [above] = await repo.query({ ...base, ratingMin: center, limit: 1 });
  const belowCount = await repo.count({ ...base, ratingMax: center - 1 });
  const below = belowCount > 0 ? (await repo.query({ ...base, ratingMax: center - 1, limit: belowCount })).at(-1) : undefined;
  if (above && below) return above.rating - center <= center - below.rating ? above : below;
  return above ?? below ?? null;
}

/**
 * Random puzzle in the first non-empty window around `center` (then the closest of any rating).
 * Returns the puzzle and the window used (`null` = any rating), or `null` when nothing matches.
 */
export async function selectNear(
  repo: PuzzleRepository,
  center: number,
  opts: SelectionFilter & { excludeIds?: Iterable<string>; windows?: readonly number[] } = {},
): Promise<{ puzzle: Puzzle; window: number | null } | null> {
  const c = Math.round(center);
  const base: BaseQuery = { excludeIds: new Set(opts.excludeIds ?? []), themes: opts.themes, openingTag: opts.openingTag };
  for (const w of opts.windows ?? RATING_WINDOWS) {
    const [p] = await repo.query({ ...base, ratingMin: c - w, ratingMax: c + w, limit: 1, shuffle: true });
    if (p) return { puzzle: p, window: w };
  }
  const p = await closestAnyRating(repo, c, base);
  return p ? { puzzle: p, window: null } : null;
}

/**
 * Next rated puzzle for a user with puzzle rating `rating` (P0-04, D-32). Never returns a puzzle with a rated attempt
 * or one of `excludeIds` (e.g. the puzzle on screen whose attempt is not stored yet).
 */
export async function selectNextRated(
  repos: PuzzleSelectionRepos,
  rating: number,
  opts: { excludeIds?: Iterable<string> } = {},
): Promise<RatedSelection> {
  const rated = await repos.puzzleAttempts.ratedPuzzleIds();
  const exclude = new Set<string>([...rated, ...(opts.excludeIds ?? [])]);
  const found = await selectNear(repos.puzzles, rating, { excludeIds: exclude });
  return found ? { kind: 'puzzle', ...found } : { kind: 'exhausted' };
}

/**
 * Next learning-mode puzzle near `rating`: avoids `seenIds`; if every puzzle was seen, repeats are allowed
 * (only the puzzle on screen, `currentId`, is avoided). `null` only for an empty bank.
 */
export async function selectLearning(
  repo: PuzzleRepository,
  rating: number,
  opts: { seenIds?: Iterable<string>; currentId?: string } = {},
): Promise<Puzzle | null> {
  const seen = new Set(opts.seenIds ?? []);
  if (opts.currentId) seen.add(opts.currentId);
  const fresh = await selectNear(repo, rating, { excludeIds: seen });
  if (fresh) return fresh.puzzle;
  const again = await selectNear(repo, rating, { excludeIds: opts.currentId ? [opts.currentId] : [] });
  if (again) return again.puzzle;
  return (await selectNear(repo, rating))?.puzzle ?? null;
}

/** Difficulty filter of Themen-Training (BACKLOG WP-03). */
export type ThemeDifficulty = 'easy' | 'medium' | 'hard' | 'all';

/** All difficulties in display order. */
export const THEME_DIFFICULTIES: readonly ThemeDifficulty[] = ['easy', 'medium', 'hard', 'all'];

/** Minimum number of puzzles of a theme in "Leicht"; below it the easiest puzzles of the theme are served instead. */
export const MIN_EASY_PUZZLES = 20;

/** Rating ceiling of "Leicht" for very low ratings (so the range is never empty for beginners around 200). */
const EASY_FLOOR_MAX = 300;

/**
 * Rating range of a difficulty around the user's rating: Leicht −300…−100 (ceiling at least 300), Mittel ±100,
 * Schwer +100…+300, Alle.
 */
export function difficultyRange(difficulty: ThemeDifficulty, userRating: number): { ratingMin?: number; ratingMax?: number } {
  const r = Math.round(userRating);
  switch (difficulty) {
    case 'easy':
      return { ratingMin: r - 300, ratingMax: Math.max(r - 100, EASY_FLOOR_MAX) };
    case 'medium':
      return { ratingMin: r - 100, ratingMax: r + 100 };
    case 'hard':
      return { ratingMin: r + 100, ratingMax: r + 300 };
    default:
      return {};
  }
}

/** Query filter for theme training. */
export interface ThemeFilter {
  theme: PuzzleThemeId;
  difficulty: ThemeDifficulty;
  userRating: number;
  openingTag?: string;
}

type ThemeQuery = Omit<PuzzleQuery, 'limit' | 'shuffle' | 'excludeIds'>;

/**
 * The query behind a theme filter, shared by the counts (theme cards) and the selection (theme page) so both agree.
 * "Leicht" with fewer than `MIN_EASY_PUZZLES` puzzles in its range falls back to the easiest `MIN_EASY_PUZZLES` puzzles
 * of the theme (rating ascending; ties at the 20th rating stay in), so a theme with puzzles is never empty.
 */
export async function themeQuery(repo: PuzzleRepository, f: ThemeFilter): Promise<ThemeQuery> {
  const base: ThemeQuery = { themes: [f.theme], openingTag: f.openingTag, ...difficultyRange(f.difficulty, f.userRating) };
  if (f.difficulty !== 'easy') return base;
  if ((await repo.count(base)) >= MIN_EASY_PUZZLES) return base;
  const easiest = await repo.query({ themes: base.themes, openingTag: f.openingTag, limit: MIN_EASY_PUZZLES });
  const last = easiest.at(-1);
  return last ? { themes: base.themes, openingTag: f.openingTag, ratingMax: last.rating } : base;
}

/** Number of puzzles matching a theme filter. */
export async function countThemePuzzles(repo: PuzzleRepository, f: ThemeFilter): Promise<number> {
  return repo.count(await themeQuery(repo, f));
}

/**
 * Random puzzle for theme training; avoids `seenIds` and repeats only when the filter has nothing new.
 * `null` when the filter matches no puzzle at all (empty state "Keine Puzzles für diesen Filter").
 */
export async function selectThemePuzzle(
  repo: PuzzleRepository,
  f: ThemeFilter,
  opts: { seenIds?: Iterable<string>; currentId?: string } = {},
): Promise<Puzzle | null> {
  const base = await themeQuery(repo, f);
  const seen = new Set(opts.seenIds ?? []);
  if (opts.currentId) seen.add(opts.currentId);
  const [fresh] = await repo.query({ ...base, excludeIds: seen, limit: 1, shuffle: true });
  if (fresh) return fresh;
  const [again] = await repo.query({ ...base, excludeIds: opts.currentId ? [opts.currentId] : [], limit: 1, shuffle: true });
  if (again) return again;
  const [any] = await repo.query({ ...base, limit: 1, shuffle: true });
  return any ?? null;
}

/** Opening tags (Lichess, e.g. `Italian_Game`) of the puzzles of a theme, most frequent first. */
export async function openingTagsForTheme(repo: PuzzleRepository, theme: PuzzleThemeId): Promise<string[]> {
  const total = await repo.count({ themes: [theme] });
  if (total === 0) return [];
  const puzzles = await repo.query({ themes: [theme], limit: total });
  const counts = new Map<string, number>();
  for (const p of puzzles) for (const t of p.openingTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}
