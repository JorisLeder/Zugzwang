import { Navigate } from 'react-router';
import { paths } from '@/app/paths';

/** OAuth/magic-link callback – PLACEHOLDER (WP-00): local mode has nothing to complete. Owned by WP-08. */
export function Component() {
  return <Navigate to={paths.home()} replace />;
}
