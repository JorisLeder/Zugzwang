/**
 * Routes of the Analysebrett (D-03). PLACEHOLDER written by WP-00 – owned by WP-01 from wave 1.
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
