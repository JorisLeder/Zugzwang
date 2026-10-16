/**
 * The ONLY place that builds URLs (BACKLOG 2.3, D-01). Every package uses `paths.*()` for links and navigation and
 * `ROUTE_PATTERNS` for route definitions. Builder names are binding. Frozen (WP-00).
 */
import type { Fen } from '@/core/chess';

/** Route patterns for `RouteObject.path` (React Router 7). */
export const ROUTE_PATTERNS = {
  home: '/',
  onboarding: '/onboarding',
  login: '/login',
  authCallback: '/auth/callback',
  puzzles: '/puzzles',
  puzzlesRated: '/puzzles/rated',
  puzzlesLearn: '/puzzles/learn',
  puzzleThemes: '/puzzles/themes',
  puzzleTheme: '/puzzles/themes/:themeId',
  puzzlesDemo: '/puzzles/demo',
  play: '/play',
  playGame: '/play/game/:gameId',
  playFromPosition: '/play/position',
  learn: '/learn',
  course: '/learn/:courseId',
  lesson: '/learn/:courseId/:lessonId',
  analysis: '/analysis',
  analysisImport: '/analysis/import',
  analysisBoard: '/analysis/board',
  analysisGame: '/analysis/:gameId',
  profile: '/profile',
  stats: '/profile/stats',
  settings: '/settings',
} as const;

const enc = encodeURIComponent;

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** URL builders. */
export const paths = {
  /** `/` – Start (dashboard). */
  home: () => '/',
  /** `/onboarding` – first start: self-assessment and daily goal. */
  onboarding: () => '/onboarding',
  /** `/login` – cloud mode login. */
  login: () => '/login',
  /** `/auth/callback` – magic-link/OAuth redirect target. */
  authCallback: () => '/auth/callback',
  /** `/puzzles` – puzzle hub. */
  puzzles: () => '/puzzles',
  /** `/puzzles/rated` – rated puzzles. */
  puzzlesRated: () => '/puzzles/rated',
  /** `/puzzles/learn` – learning mode. */
  puzzlesLearn: () => '/puzzles/learn',
  /** `/puzzles/themes` – theme training overview. */
  puzzleThemes: () => '/puzzles/themes',
  /** `/puzzles/themes/:themeId` – training of one theme (Lichess key). */
  puzzleTheme: (themeId: string) => `/puzzles/themes/${enc(themeId)}`,
  /** `/puzzles/demo` – 5 demo puzzles without login. */
  puzzlesDemo: () => '/puzzles/demo',
  /** `/play` – bot list. */
  play: () => '/play',
  /** `/play/game/:gameId` – running or finished bot game. */
  playGame: (gameId: string) => `/play/game/${enc(gameId)}`,
  /** `/play/position?fen=` – play a position against a bot. */
  playFromPosition: (fen: Fen) => withQuery('/play/position', { fen }),
  /** `/learn` – Lernpfad. */
  learn: () => '/learn',
  /** `/learn/:courseId` – course. */
  course: (courseId: string) => `/learn/${enc(courseId)}`,
  /** `/learn/:courseId/:lessonId` – lesson player. */
  lesson: (courseId: string, lessonId: string) => `/learn/${enc(courseId)}/${enc(lessonId)}`,
  /** `/analysis` – analysed games. */
  analysis: () => '/analysis',
  /** `/analysis/import` – PGN import. */
  analysisImport: () => '/analysis/import',
  /** `/analysis/board?fen=&pgn=` – Analysebrett. */
  analysisBoard: ({ fen, pgn }: { fen?: Fen; pgn?: string } = {}) => withQuery('/analysis/board', { fen, pgn }),
  /** `/analysis/:gameId` – game review (deep link, P2-02). */
  analysisGame: (gameId: string) => `/analysis/${enc(gameId)}`,
  /** `/profile` – profile. */
  profile: () => '/profile',
  /** `/profile/stats` – statistics. */
  stats: () => '/profile/stats',
  /** `/settings` – Einstellungen. */
  settings: () => '/settings',
} as const;
