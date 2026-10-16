/**
 * Routes of the Analysebrett (D-03, WP-01).
 */
import type { RouteObject } from 'react-router';
import { ROUTE_PATTERNS } from '@/app/paths';

/** Route objects of this feature. */
export const routes: RouteObject[] = [
  {
    path: ROUTE_PATTERNS.analysisBoard,
    lazy: () => import('./pages/AnalysisBoardPage'),
  },
];
