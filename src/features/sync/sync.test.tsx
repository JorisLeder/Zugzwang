import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider } from '@/app/services';
import type { SyncState } from '@/core/storage';
import { createFakeAppServices, createMemoryDataServices } from '@/core/testing';
import { createValueStore } from '@/lib/observable';
import { ERROR_BANNER_DELAY_MS, SyncBanners } from './SyncBanners';
import { SyncStatusIndicator } from './SyncStatusIndicator';

function servicesWith(initial: SyncState) {
  const store = createValueStore<SyncState>(initial);
  const flush = vi.fn(async () => {});
  const dismissDeadLetters = vi.fn(async () => {});
  const data = { ...createMemoryDataServices(), sync: { state: () => store.get(), observe: () => store, flush, dismissDeadLetters } };
  return { services: createFakeAppServices({ data, config: { mode: initial.mode } }), store, flush, dismissDeadLetters };
}

const cloud = (status: SyncState['status'], extra: Partial<SyncState> = {}): SyncState => ({ mode: 'cloud', online: status !== 'offline', pending: 0, status, ...extra });

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('SyncStatusIndicator', () => {
  it.each([
    [cloud('synced'), 'Gespeichert'],
    [cloud('pending', { pending: 2 }), 'Speichern …'],
    [cloud('offline'), 'Offline'],
    [cloud('error', { pending: 1, error: '503' }), 'Nicht synchronisiert'],
    [cloud('error', { deadLetterCount: 2 }), 'Teilweise nicht gespeichert'],
    [{ mode: 'local', online: true, pending: 0, status: 'local-only' } as SyncState, 'Lokal'],
  ])('shows %o as "%s" (word + icon)', (state, label) => {
    const { services } = servicesWith(state);
    render(
      <ServicesProvider services={services}>
        <SyncStatusIndicator />
      </ServicesProvider>,
    );
    const button = screen.getByTestId('sync-status');
    expect(button).toHaveAttribute('data-status', state.status);
    expect(button).toHaveAccessibleName(`Speicherstatus: ${label}. Hilfe zum Speichern öffnen`);
    expect(within(button).getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('follows state changes live and opens the help with the current details', async () => {
    const user = userEvent.setup();
    const { services, store } = servicesWith(cloud('synced'));
    render(
      <ServicesProvider services={services}>
        <SyncStatusIndicator compact />
      </ServicesProvider>,
    );
    act(() => store.set(cloud('error', { pending: 3, error: 'x' })));
    expect(screen.getByTestId('sync-status')).toHaveAttribute('data-status', 'error');
    await user.click(screen.getByTestId('sync-status'));
    const dialog = await screen.findByRole('dialog', { name: 'Speichern und Synchronisieren' });
    expect(dialog).toHaveTextContent('Diese App läuft im Cloud-Modus.');
    expect(dialog).toHaveTextContent('3 Änderungen warten auf die Übertragung.');
    for (const title of ['Lokaler Modus', 'Cloud-Modus', 'Was synchronisiert wird', 'Offline und Konflikte', 'Cloud-Sync einrichten']) {
      expect(within(dialog).getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(dialog).toHaveTextContent('VITE_SUPABASE_URL');
  });
});

describe('SyncBanners', () => {
  it('local mode: banner once per session with help; dismissal is remembered', async () => {
    const user = userEvent.setup();
    const { services } = servicesWith({ mode: 'local', online: true, pending: 0, status: 'local-only' });
    const { unmount } = render(
      <ServicesProvider services={services}>
        <SyncBanners />
      </ServicesProvider>,
    );
    expect(screen.getByText('Lokaler Modus – Fortschritt nur auf diesem Gerät')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mehr erfahren' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Diese App läuft im lokalen Modus.');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByText('Lokaler Modus – Fortschritt nur auf diesem Gerät')).not.toBeInTheDocument();
    unmount();
    render(
      <ServicesProvider services={services}>
        <SyncBanners />
      </ServicesProvider>,
    );
    expect(screen.queryByText('Lokaler Modus – Fortschritt nur auf diesem Gerät')).not.toBeInTheDocument();
  });

  it('cloud mode: "Nicht synchronisiert" appears only when failures persist and offers a retry', async () => {
    vi.useFakeTimers();
    const { services, store, flush } = servicesWith(cloud('synced'));
    render(
      <ServicesProvider services={services}>
        <SyncBanners />
      </ServicesProvider>,
    );
    expect(screen.queryByText(/Nicht synchronisiert/)).not.toBeInTheDocument();
    act(() => store.set(cloud('error', { pending: 1, error: '503' })));
    act(() => vi.advanceTimersByTime(ERROR_BANNER_DELAY_MS - 100));
    expect(screen.queryByText(/Nicht synchronisiert/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText(/Nicht synchronisiert – es wird automatisch erneut versucht/)).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Jetzt erneut versuchen' }).click());
    expect(flush).toHaveBeenCalled();
    act(() => store.set(cloud('synced')));
    expect(screen.queryByText(/Nicht synchronisiert/)).not.toBeInTheDocument();
    // A new failure waits again.
    act(() => store.set(cloud('error', { pending: 1 })));
    expect(screen.queryByText(/Nicht synchronisiert/)).not.toBeInTheDocument();
  });

  it('DS-2: rejected entries show a banner without retry and never "Gespeichert"', () => {
    vi.useFakeTimers();
    const { services } = servicesWith(cloud('error', { deadLetterCount: 1 }));
    render(
      <ServicesProvider services={services}>
        <SyncBanners />
      </ServicesProvider>,
    );
    act(() => vi.advanceTimersByTime(ERROR_BANNER_DELAY_MS + 100));
    expect(screen.getByText(/Ein Teil deiner Änderungen hat der Server abgelehnt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jetzt erneut versuchen' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Gespeichert/)).not.toBeInTheDocument();
  });

  it('DS2-3: "Verwerfen" asks for confirmation, then discards the dead letters and the banner goes away', async () => {
    vi.useFakeTimers();
    const { services, store, dismissDeadLetters } = servicesWith(cloud('error', { deadLetterCount: 1 }));
    dismissDeadLetters.mockImplementation(async () => store.set(cloud('synced')));
    render(
      <ServicesProvider services={services}>
        <SyncBanners />
      </ServicesProvider>,
    );
    act(() => vi.advanceTimersByTime(ERROR_BANNER_DELAY_MS + 100));
    act(() => screen.getByRole('button', { name: 'Verwerfen' }).click());
    expect(dismissDeadLetters).not.toHaveBeenCalled();
    expect(screen.getByText(/konnten nicht auf dem Server gespeichert werden/)).toBeInTheDocument();
    // Cancel keeps everything.
    act(() => screen.getByRole('button', { name: 'Abbrechen' }).click());
    expect(dismissDeadLetters).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Verwerfen' })).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Verwerfen' }).click());
    await act(async () => screen.getByRole('button', { name: 'Ja, verwerfen' }).click());
    expect(dismissDeadLetters).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sync-banners')?.textContent ?? '').not.toMatch(/abgelehnt|Server gespeichert/);
  });
});
