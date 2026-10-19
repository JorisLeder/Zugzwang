/**
 * Shell slot (D-03): wraps every route except `/login`, `/auth/callback` and `/puzzles/demo`.
 * Local mode: everyone passes (no login, D-15). Cloud mode: logged-out users are sent to `/login` (the page they
 * wanted is restored after the login). Also renders the sync banners above the content.
 */
import { useMemo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import type { AuthSession } from '@/core/storage';
import { useSubscribable } from '@/lib/observable';
import { SyncBanners } from '@/features/sync/SyncBanners';
import { Spinner } from '@/ui/primitives/Spinner';
import { rememberNextPath } from './session';
import { STRINGS_DE } from './strings.de';

/** Props of `AuthGate`. */
export interface AuthGateProps {
  children: ReactNode;
}

const UNKNOWN = Symbol('unknown');

/** Lets logged-in users (and everyone in local mode) through. */
export function AuthGate({ children }: AuthGateProps) {
  const { data } = useServices();
  const location = useLocation();
  const source = useMemo(() => data.auth.observe(), [data]);
  const session = useSubscribable<AuthSession | null | typeof UNKNOWN>(source, data.auth.mode === 'local' ? data.auth.session() : UNKNOWN);

  if (data.auth.mode === 'cloud') {
    if (session === UNKNOWN) {
      return (
        <div className="flex min-h-[50dvh] items-center justify-center text-muted">
          <Spinner size={28} label={STRINGS_DE.checkingSession} />
        </div>
      );
    }
    if (!session) {
      rememberNextPath(`${location.pathname}${location.search}${location.hash}`);
      return <Navigate to={paths.login()} replace />;
    }
  }
  return (
    <>
      <SyncBanners />
      {children}
    </>
  );
}
