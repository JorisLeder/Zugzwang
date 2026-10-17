/**
 * Routes of the lesson feature (D-03, WP-06): Lernpfad, course page and lesson player. Pages are lazy-loaded; the
 * root router imports this array statically.
 */
import type { RouteObject } from 'react-router';
import { ROUTE_PATTERNS } from '@/app/paths';

/** Route objects of this feature. */
export const routes: RouteObject[] = [
  {
    path: ROUTE_PATTERNS.learn,
    lazy: () => import('./pages/LearnPathPage'),
  },
  {
    path: ROUTE_PATTERNS.course,
    lazy: () => import('./pages/CoursePage'),
  },
  {
    path: ROUTE_PATTERNS.lesson,
    lazy: () => import('./pages/LessonPage'),
  },
];
