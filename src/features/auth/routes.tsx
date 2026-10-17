/**
 * Auth routes (D-03): `/login` (e-mail link, Google; local mode: notice) and `/auth/callback` (completes the
 * redirect) are public and rendered without the shell (`handle.bare`).
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
