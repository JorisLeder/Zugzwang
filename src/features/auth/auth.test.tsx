import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { ServicesProvider } from '@/app/services';
import { createFakeAppServices, createMemoryDataServices } from '@/core/testing';
import { AuthError } from '@/data/auth/authService';
import { createFakeDevice, FakeSupabaseServer, type FakeDevice } from '@/data/testing';
import { AccountSection } from './AccountSection';
import { AuthGate } from './AuthGate';
import { Component as AuthCallbackPage } from './pages/AuthCallbackPage';
import { Component as LoginPage } from './pages/LoginPage';

const devices: FakeDevice[] = [];
afterEach(async () => {
  for (const d of devices.splice(0)) {
    await d.data.settled();
    d.close();
  }
  sessionStorage.clear();
  vi.restoreAllMocks();
});

/** Mirrors the root route tree: gated routes inside AuthGate; login, callback and demo outside. */
function routes(extra: RouteObject[] = []): RouteObject[] {
  return [
    {
      element: (
        <AuthGate>
          <Outlet />
        </AuthGate>
      ),
      children: [
        { path: '/', element: <h1>Start</h1> },
        { path: '/play', element: <h1>Spielen</h1> },
        { path: '/onboarding', element: <h1>Willkommen</h1> },
        { path: '/settings', element: <AccountSection /> },
      ],
    },
    { path: '/puzzles/demo', element: <h1>Demo-Puzzles</h1> },
    { path: '/login', element: <LoginPage /> },
    { path: '/auth/callback', element: <AuthCallbackPage /> },
    ...extra,
  ];
}

function renderApp(services: ReturnType<typeof createFakeAppServices>, url: string) {
  const router = createMemoryRouter(routes(), { initialEntries: [url] });
  render(
    <ServicesProvider services={services}>
      <RouterProvider router={router} />
    </ServicesProvider>,
  );
  return router;
}

async function cloudServices(opts: { email?: string } = {}) {
  const server = new FakeSupabaseServer();
  const device = createFakeDevice(server, { email: opts.email });
  devices.push(device);
  await device.data.ready();
  return { server, device, services: createFakeAppServices({ data: device.data, config: { mode: 'cloud' } }) };
}

describe('AuthGate', () => {
  it('local mode: no login – every page is reachable and the local mode is visible', async () => {
    const router = renderApp(createFakeAppServices(), '/play');
    expect(await screen.findByRole('heading', { name: 'Spielen' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/play');
    expect(screen.getByText('Lokaler Modus – Fortschritt nur auf diesem Gerät')).toBeInTheDocument();
  });

  it('cloud mode, logged out: gated pages redirect to /login; the demo stays reachable; the target is restored after login', async () => {
    const user = userEvent.setup();
    const { server, services } = await cloudServices();
    const router = renderApp(services, '/play');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');

    await router.navigate('/puzzles/demo');
    expect(await screen.findByRole('heading', { name: 'Demo-Puzzles' })).toBeInTheDocument();

    await router.navigate('/login');
    await user.type(await screen.findByLabelText('E-Mail-Adresse'), 'lea@example.com');
    await user.click(screen.getByRole('button', { name: 'Anmeldelink senden' }));
    expect(await screen.findByText(/Wir haben dir einen Anmeldelink an lea@example.com geschickt/)).toBeInTheDocument();
    const link = new URL(server.lastMagicLink('lea@example.com')!);
    expect(link.pathname).toBe('/auth/callback');

    await router.navigate(`${link.pathname}${link.search}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/play'));
    expect(await screen.findByRole('heading', { name: 'Spielen' })).toBeInTheDocument();
    expect(services.data.auth.session()?.email).toBe('lea@example.com');
  });

  it('cloud mode, logged in: passes through; the login page forwards to the start page', async () => {
    const { services } = await cloudServices({ email: 'lea@example.com' });
    const router = renderApp(services, '/play');
    expect(await screen.findByRole('heading', { name: 'Spielen' })).toBeInTheDocument();
    expect(screen.queryByText(/Lokaler Modus/)).not.toBeInTheDocument();
    await router.navigate('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('LoginPage', () => {
  it('local mode explains that no login is needed', async () => {
    renderApp(createFakeAppServices(), '/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByText(/Eine Anmeldung ist nicht nötig/)).toBeInTheDocument();
    expect(screen.queryByLabelText('E-Mail-Adresse')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/');
  });

  it('validates the e-mail address and shows German errors', async () => {
    const user = userEvent.setup();
    const { server, services } = await cloudServices();
    renderApp(services, '/login');
    await user.type(await screen.findByLabelText('E-Mail-Adresse'), 'lea@');
    await user.click(screen.getByRole('button', { name: 'Anmeldelink senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte gib eine gültige E-Mail-Adresse ein.');
    expect(screen.getByLabelText('E-Mail-Adresse')).toHaveAttribute('aria-invalid', 'true');
    server.failNext({ count: 1, status: 429, message: 'rate limit' });
    await user.clear(screen.getByLabelText('E-Mail-Adresse'));
    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'lea@example.com');
    await user.click(screen.getByRole('button', { name: 'Anmeldelink senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Zu viele Versuche');
    expect(screen.getByRole('link', { name: 'Demo-Puzzles ausprobieren' })).toHaveAttribute('href', '/puzzles/demo');
    expect(screen.getByText('Du bleibst 30 Tage angemeldet.')).toBeInTheDocument();
  });

  it('Google sign-in starts the OAuth redirect; the callback completes it', async () => {
    const user = userEvent.setup();
    const { server, services } = await cloudServices();
    const router = renderApp(services, '/login');
    await user.click(await screen.findByRole('button', { name: 'Mit Google anmelden' }));
    await waitFor(() => expect(server.oauthRedirects).toHaveLength(1));
    const url = new URL(server.oauthRedirects[0]!);
    await router.navigate(`${url.pathname}${url.search}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(services.data.auth.session()?.provider).toBe('google');
  });
});

describe('AuthCallbackPage', () => {
  it('shows an error with a way back when the link is invalid', async () => {
    const { services } = await cloudServices();
    renderApp(services, '/auth/callback?code=abgelaufen');
    expect(await screen.findByRole('heading', { name: 'Anmeldung fehlgeschlagen' })).toBeInTheDocument();
    expect(screen.getByText(/Link ist vielleicht abgelaufen/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück zur Anmeldung' })).toHaveAttribute('href', '/login');
  });

  it('DS-6: a link opened without the PKCE verifier explains to use the same browser or request a new link', async () => {
    const { services, device } = await cloudServices();
    vi.spyOn(device.data.auth, 'handleCallback').mockRejectedValue(new AuthError('pkce-verifier', 'x'));
    renderApp(services, '/auth/callback?code=fremd');
    expect(
      await screen.findByText('Öffne den Link im selben Browser oder in der App, in der du ihn angefordert hast, oder fordere einen neuen Link an.'),
    ).toBeInTheDocument();
  });

  it('local mode: forwards to the start page', async () => {
    const router = renderApp(createFakeAppServices(), '/auth/callback?code=x');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('AccountSection', () => {
  it('local mode: exports a JSON file and deletes all data after typing the confirmation word', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices({ profile: { displayName: 'Lea' } });
    const services = createFakeAppServices({ data });
    const createObjectURL = vi.fn((_b: Blob) => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const router = renderApp(services, '/settings');

    await user.click(await screen.findByRole('button', { name: 'Daten exportieren' }));
    await screen.findByText('Export heruntergeladen');
    expect(click).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0];
    expect(JSON.parse(await blob.text()).profile.displayName).toBe('Lea');
    expect(screen.queryByRole('button', { name: 'Abmelden' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Alle Daten löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Alle Daten löschen?' });
    const confirm = screen.getByRole('button', { name: 'Endgültig löschen' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Tippe „LÖSCHEN“ zur Bestätigung'), 'löschen');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(await data.repos.profile.get()).toBeNull();
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });

  it('cloud mode: shows the account, signs out and deletes the account via the server function', async () => {
    const user = userEvent.setup();
    const { server, services, device } = await cloudServices({ email: 'lea@example.com' });
    const router = renderApp(services, '/settings');
    expect(await screen.findByText('Angemeldet als lea@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Konto löschen' }));
    await user.type(await screen.findByLabelText('Tippe „LÖSCHEN“ zur Bestätigung'), 'LÖSCHEN');
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(server.functionCalls.map((c) => c.name)).toEqual(['delete-account']);
    expect(device.data.auth.session()).toBeNull();
  });

  it('cloud mode: sign-out returns to the login page (nothing pending: no question)', async () => {
    const user = userEvent.setup();
    const { services, device } = await cloudServices({ email: 'lea@example.com' });
    await device.data.settled();
    expect(device.data.sync.state().pending).toBe(0);
    const router = renderApp(services, '/settings');
    await user.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(services.data.auth.session()).toBeNull();
  });

  it('DS-3: with unsynced entries the sign-out asks first; "Trotzdem abmelden" signs out, cancel keeps the session', async () => {
    const user = userEvent.setup();
    const { services, device } = await cloudServices({ email: 'lea@example.com' });
    const router = renderApp(services, '/settings');
    const state = vi.spyOn(device.data.sync, 'state').mockReturnValue({ mode: 'cloud', online: false, pending: 2, status: 'offline' });
    const flush = vi.spyOn(device.data.sync, 'flush').mockResolvedValue();
    await user.click(await screen.findByRole('button', { name: 'Abmelden' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nicht alles ist synchronisiert' });
    expect(dialog).toHaveTextContent('2 Änderungen wurden noch nicht übertragen');
    expect(services.data.auth.session()).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(services.data.auth.session()).not.toBeNull();

    // "Erst synchronisieren": the flush leaves entries behind → stay, show the hint.
    await user.click(screen.getByRole('button', { name: 'Abmelden' }));
    await user.click(await screen.findByRole('button', { name: 'Erst synchronisieren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das Synchronisieren hat nicht geklappt');
    expect(flush).toHaveBeenCalled();
    expect(services.data.auth.session()).not.toBeNull();

    // Once the flush empties the outbox, the sign-out follows.
    state.mockReturnValue({ mode: 'cloud', online: true, pending: 0, status: 'synced' });
    await user.click(screen.getByRole('button', { name: 'Erst synchronisieren' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(services.data.auth.session()).toBeNull();
  });

  it('DS-3: "Trotzdem abmelden" signs out without syncing', async () => {
    const user = userEvent.setup();
    const { services, device } = await cloudServices({ email: 'lea@example.com' });
    const router = renderApp(services, '/settings');
    vi.spyOn(device.data.sync, 'state').mockReturnValue({ mode: 'cloud', online: false, pending: 1, status: 'offline' });
    await user.click(await screen.findByRole('button', { name: 'Abmelden' }));
    expect(await screen.findByRole('dialog', { name: 'Nicht alles ist synchronisiert' })).toHaveTextContent('1 Änderung wurde noch nicht übertragen');
    await user.click(screen.getByRole('button', { name: 'Trotzdem abmelden' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(services.data.auth.session()).toBeNull();
  });
});
