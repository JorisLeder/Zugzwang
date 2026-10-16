/**
 * Routes of this feature (D-03). PLACEHOLDER written by WP-00 – owned by WP-03 from its wave.
 * Pages are lazy-loaded; the root router imports this array statically. Public routes carry `handle.public`.
 */
import type { RouteObject } from 'react-router';
import { ROUTE_PATTERNS } from '@/app/paths';

/** Route objects of this feature. */
export const routes: RouteObject[] = [
  {
    path: ROUTE_PATTERNS.puzzles,
    lazy: () => import('./pages/PuzzlesHubPage'),
  },
  {
    path: ROUTE_PATTERNS.puzzlesRated,
    lazy: () => import('./pages/RatedPuzzlesPage'),
  },
  {
    path: ROUTE_PATTERNS.puzzlesLearn,
    lazy: () => import('./pages/LearningPuzzlesPage'),
  },
  {
    path: ROUTE_PATTERNS.puzzleThemes,
    lazy: () => import('./pages/ThemesPage'),
  },
  {
    path: ROUTE_PATTERNS.puzzleTheme,
    lazy: () => import('./pages/ThemePage'),
  },
  {
    path: ROUTE_PATTERNS.puzzlesDemo,
    handle: { public: true },
    lazy: () => import('./pages/DemoPuzzlesPage'),
  },
];
