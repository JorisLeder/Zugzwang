/**
 * Shell slot of the PWA package: offline banner (and the compact pill on board screens), update prompt
 * ("Neue Version verfügbar") and the one-time service-worker registration.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';
import { __testing } from './pwaState';

const register = vi.hoisted(() => vi.fn(async () => null));
vi.mock('./registerSW', () => ({ registerServiceWorker: register }));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

beforeEach(() => {
  __testing.reset();
  register.mockClear();
});

afterEach(() => {
  setOnline(true);
});

describe('OfflineBanner', () => {
  it('renders nothing while online and registers the service worker once', () => {
    const { container, rerender } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
    rerender(<OfflineBanner />);
    render(<OfflineBanner />);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('shows the offline banner while offline and hides it when back online', () => {
    render(<OfflineBanner />);
    setOnline(false);
    expect(screen.getByTestId('offline-banner')).toHaveTextContent('Du bist offline – Puzzles laufen weiter.');
    expect(screen.getByTestId('offline-pill')).toHaveTextContent('Du bist offline – Puzzles laufen weiter.');
    setOnline(true);
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });

  it('offers a waiting update and applies it on request', async () => {
    const apply = vi.fn(async () => undefined);
    render(<OfflineBanner />);
    act(() => __testing.needRefresh(apply));
    const banner = screen.getByTestId('update-banner');
    expect(banner).toHaveTextContent('Neue Version verfügbar.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('update-banner')).toHaveTextContent('Wird aktualisiert');
  });

  it('can postpone the update until the next version', () => {
    render(<OfflineBanner />);
    act(() => __testing.needRefresh(vi.fn(async () => undefined)));
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
    act(() => __testing.needRefresh(vi.fn(async () => undefined)));
    expect(screen.getByTestId('update-banner')).toBeInTheDocument();
  });
});
