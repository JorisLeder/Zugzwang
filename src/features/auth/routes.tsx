/**
 * Auth routes (D-03): `/login` and `/auth/callback` are public and rendered without the shell (`handle.bare`).
 * PLACEHOLDER written by WP-00 – owned by WP-08 from wave 1.
 */
import type { RouteObject } from 'react-router';
import { ROUTE_PATTERNS } from '@/app/paths';

/** Route objects of this feature. */
export const routes: RouteObject[] = [
  {
    path: ROUTE_PATTERNS.login,
    handle: { public: true, bare: true },
    lazy: () => import('./pages/LoginPage'),
  },
  {
    path: ROUTE_PATTERNS.authCallback,
    handle: { public: true, bare: true },
    lazy: () => import('./pages/AuthCallbackPage'),
  },
];
