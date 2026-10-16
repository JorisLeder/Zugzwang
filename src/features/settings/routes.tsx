/**
 * Routes of the settings (D-03). PLACEHOLDER written by WP-00 – owned by WP-09 from wave 2.
 */
import type { RouteObject } from 'react-router';
import { ROUTE_PATTERNS } from '@/app/paths';

/** Route objects of this feature. */
export const routes: RouteObject[] = [
  {
    path: ROUTE_PATTERNS.settings,
    lazy: () => import('./pages/SettingsPage'),
  },
];
