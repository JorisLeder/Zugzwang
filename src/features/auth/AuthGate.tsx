/**
 * Shell slot (D-03): wraps every route except `/login`, `/auth/callback` and `/puzzles/demo`.
 * PLACEHOLDER written by WP-00 (passes through) – WP-08 implements the cloud-mode login gate WITHOUT changing the
 * signature.
 */
import type { ReactNode } from 'react';

/** Props of `AuthGate`. */
export interface AuthGateProps {
  children: ReactNode;
}

/** Lets logged-in users (and everyone in local mode) through. */
export function AuthGate({ children }: AuthGateProps) {
  return <>{children}</>;
}
