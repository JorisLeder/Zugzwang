/**
 * Routes of this feature (D-03). PLACEHOLDER written by WP-00 – owned by WP-09 from its wave.
 * Pages are lazy-loaded; the root router imports this array statically. Public routes carry `handle.public`.
 */
import type { RouteObject } from 'react-router';
import { ROUTE_PATTERNS } from '@/app/paths';

/** Route objects of this feature. */
export const routes: RouteObject[] = [
  {
    path: ROUTE_PATTERNS.onboarding,
    lazy: () => import('./pages/OnboardingPage'),
  },
];
