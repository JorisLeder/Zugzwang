/**
 * Root route tree (D-01, D-03). Feature route arrays are imported statically; their pages are lazy.
 * - Routes with `handle.bare` render without the shell (login, auth callback).
 * - Routes with `handle.public` are outside the `AuthGate` (login, auth callback, puzzle demo).
 * - Everything else is inside `AuthGate` and the shell. `*` = 404.
 * Frozen (WP-00).
 */
import { Outlet, type RouteObject } from 'react-router';
import { AuthGate } from '@/features/auth/AuthGate';
import { routes as analysisBoardRoutes } from '@/features/analysis-board/routes';
import { routes as authRoutes } from '@/features/auth/routes';
import { routes as dashboardRoutes } from '@/features/dashboard/routes';
import { routes as lessonRoutes } from '@/features/lessons/routes';
import { routes as onboardingRoutes } from '@/features/onboarding/routes';
import { routes as pgnImportRoutes } from '@/features/pgn-import/routes';
import { routes as playRoutes } from '@/features/play/routes';
import { routes as profileRoutes } from '@/features/profile/routes';
import { routes as puzzleRoutes } from '@/features/puzzles/routes';
import { routes as reviewRoutes } from '@/features/review/routes';
import { routes as settingsRoutes } from '@/features/settings/routes';
import { NotFoundPage } from './pages/NotFoundPage';
import { PageSpinner } from './pages/PageSpinner';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { AppShell } from './shell/AppShell';

/** Route handle flags used by the root router. */
export interface RouteHandle {
  /** Reachable without login (outside `AuthGate`). */
  public?: boolean;
  /** Rendered without the app shell. */
  bare?: boolean;
}

/** All feature routes. Order matters only for readability – React Router ranks static segments first. */
export const FEATURE_ROUTES: RouteObject[] = [
  ...dashboardRoutes,
  ...onboardingRoutes,
  ...puzzleRoutes,
  ...playRoutes,
  ...lessonRoutes,
  ...reviewRoutes,
  ...pgnImportRoutes,
  ...analysisBoardRoutes,
  ...profileRoutes,
  ...settingsRoutes,
  ...authRoutes,
];

const handleOf = (r: RouteObject): RouteHandle => (r.handle ?? {}) as RouteHandle;

function GatedOutlet() {
  return (
    <AuthGate>
      <Outlet />
    </AuthGate>
  );
}

/** Builds the route tree from the feature routes. */
export function buildRoutes(features: RouteObject[] = FEATURE_ROUTES): RouteObject[] {
  const bare = features.filter((r) => handleOf(r).bare);
  const shellPublic = features.filter((r) => handleOf(r).public && !handleOf(r).bare);
  const gated = features.filter((r) => !handleOf(r).public && !handleOf(r).bare);
  return [
    {
      id: 'root',
      errorElement: <RouteErrorPage />,
      hydrateFallbackElement: <PageSpinner />,
      children: [
        {
          element: <AppShell />,
          children: [{ element: <GatedOutlet />, children: gated }, ...shellPublic, { path: '*', element: <NotFoundPage /> }],
        },
        ...bare,
      ],
    },
  ];
}
