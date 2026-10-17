/**
 * `/login` (P0-01): e-mail magic link and Google. Local mode needs no login (D-15) and says so. Logged-in users go
 * straight on. Without login only the demo puzzles are available.
 */
import { Mail } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { useSubscribable } from '@/lib/observable';
import { Page } from '@/ui/layout/Page';
import { Banner, Button, Card } from '@/ui/primitives';
import { BrandLogo } from '../BrandLogo';
import { authErrorMessage, peekNextPath } from '../session';
import { STRINGS_DE } from '../strings.de';

function LocalModeLogin() {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Banner tone="info">{STRINGS_DE.localMode}</Banner>
      <div>
        <Button asChild>
          <Link to={paths.home()}>{STRINGS_DE.toStart}</Link>
        </Button>
      </div>
    </div>
  );
}

function CloudLogin() {
  const { data } = useServices();
  const id = useId();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('email');
    try {
      await data.auth.signInWithEmailLink(email);
      setSentTo(email.trim());
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setError(null);
    setBusy('google');
    try {
      await data.auth.signInWithGoogle(); // the browser leaves for Google
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Card className="flex w-full max-w-md flex-col gap-5">
      <p className="text-body text-muted">{STRINGS_DE.loginIntro}</p>
      {sentTo ? (
        <div className="flex flex-col gap-3" role="status">
          <h2 className="text-h2 text-text">{STRINGS_DE.linkSentTitle}</h2>
          <p className="text-body text-text">{STRINGS_DE.linkSent(sentTo)}</p>
          <div>
            <Button variant="link" onClick={() => setSentTo(null)}>
              {STRINGS_DE.otherEmail}
            </Button>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={sendLink} noValidate>
          <label htmlFor={`${id}-email`} className="text-body-sm font-medium text-text">
            {STRINGS_DE.emailLabel}
          </label>
          <input
            id={`${id}-email`}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            placeholder={STRINGS_DE.emailPlaceholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface-2 px-3 text-body text-text placeholder:text-muted"
          />
          <Button type="submit" icon={<Mail />} loading={busy === 'email'} disabled={busy !== null} fullWidth>
            {busy === 'email' ? STRINGS_DE.sending : STRINGS_DE.sendLink}
          </Button>
        </form>
      )}
      <div className="flex items-center gap-3 text-caption text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {STRINGS_DE.or}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="secondary" onClick={() => void google()} loading={busy === 'google'} disabled={busy !== null} fullWidth>
        {busy === 'google' ? STRINGS_DE.redirecting : STRINGS_DE.google}
      </Button>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-body-sm text-danger-text">
          {error}
        </p>
      )}
      <p className="text-caption text-muted">{STRINGS_DE.sessionNote}</p>
      <div className="flex flex-col gap-1 border-t border-border pt-4 text-body-sm">
        <span className="text-muted">{STRINGS_DE.demoHint}</span>
        <Link to={paths.puzzlesDemo()} className="font-medium text-accent-text underline-offset-4 hover:underline">
          {STRINGS_DE.demoLink}
        </Link>
      </div>
    </Card>
  );
}

/** Login page. */
export function Component() {
  const { data } = useServices();
  const source = useMemo(() => data.auth.observe(), [data]);
  const session = useSubscribable(source, data.auth.session());
  const cloud = data.auth.mode === 'cloud';
  if (cloud && session) return <Navigate to={peekNextPath(paths.home())} replace />;
  return (
    <main id="main" className="min-h-dvh bg-bg text-text">
      <Page title={STRINGS_DE.loginTitle}>
        <div className="flex flex-col items-start gap-6">
          <BrandLogo />
          {cloud ? <CloudLogin /> : <LocalModeLogin />}
        </div>
      </Page>
    </main>
  );
}
