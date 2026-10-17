/**
 * `/auth/callback`: completes the magic-link / OAuth redirect (code exchange), then continues to the page the user
 * wanted (or the start page). The same URL is handled only once (React strict mode runs effects twice; codes are
 * single use).
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import type { AuthService } from '@/core/storage';
import { Page } from '@/ui/layout/Page';
import { Banner, Button, Spinner } from '@/ui/primitives';
import { BrandLogo } from '../BrandLogo';
import { authErrorMessage, takeNextPath } from '../session';
import { STRINGS_DE } from '../strings.de';

const handled = new WeakMap<AuthService, Map<string, Promise<void>>>();

function completeOnce(auth: AuthService, url: string): Promise<void> {
  let perAuth = handled.get(auth);
  if (!perAuth) handled.set(auth, (perAuth = new Map()));
  let p = perAuth.get(url);
  if (!p) perAuth.set(url, (p = auth.handleCallback(url)));
  return p;
}

function CloudCallback() {
  const { data } = useServices();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const url = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    let active = true;
    completeOnce(data.auth, url).then(
      () => {
        if (active) navigate(takeNextPath(paths.home()), { replace: true });
      },
      (e: unknown) => {
        if (active) setError(authErrorMessage(e));
      },
    );
    return () => {
      active = false;
    };
  }, [data, url, navigate]);

  if (error) {
    return (
      <Page title={STRINGS_DE.callbackFailedTitle}>
        <div className="flex max-w-xl flex-col gap-4">
          <BrandLogo />
          <Banner tone="danger">{error}</Banner>
          <div>
            <Button asChild>
              <Link to={paths.login()}>{STRINGS_DE.backToLogin}</Link>
            </Button>
          </div>
        </div>
      </Page>
    );
  }
  return (
    <Page title={STRINGS_DE.callbackTitle}>
      <div className="flex items-center gap-3 text-muted">
        <Spinner size={24} label={STRINGS_DE.callbackTitle} />
      </div>
    </Page>
  );
}

/** Callback page. */
export function Component() {
  const { data } = useServices();
  return (
    <main id="main" className="min-h-dvh bg-bg text-text">
      {data.auth.mode === 'cloud' ? <CloudCallback /> : <Navigate to={paths.home()} replace />}
    </main>
  );
}
