/**
 * App shell in jsdom: six areas with German labels, aria-current, navigation, 404, settings store → theme, account
 * section on the settings page.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/profile';
import { createFakeAppServices } from '@/core/testing';
import { App } from './App';
import { useSettingsStore } from './services';

const LABELS = ['Start', 'Puzzles', 'Spielen', 'Lernen', 'Analyse', 'Profil'];

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App services={createFakeAppServices()} />);
}

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, hydrated: false });
});

describe('App shell', () => {
  it('shows the six areas with German labels and marks the active one', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Start' })).toBeInTheDocument();
    const navs = screen.getAllByRole('navigation', { name: 'Hauptnavigation' });
    expect(navs).toHaveLength(2); // sidebar/rail (≥ 768 px) and tab bar (< 768 px); CSS shows one of them
    for (const nav of navs) {
      const links = within(nav).getAllByRole('link');
      expect(links.map((l) => l.textContent)).toEqual(LABELS);
      expect(within(nav).getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page');
      expect(within(nav).getByRole('link', { name: 'Puzzles' })).not.toHaveAttribute('aria-current');
    }
    expect(screen.getByRole('link', { name: 'Zum Inhalt springen' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '/settings');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('navigates between areas in one click', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'Start' });
    const nav = screen.getAllByRole('navigation', { name: 'Hauptnavigation' })[0]!;
    await userEvent.click(within(nav).getByRole('link', { name: 'Lernen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Lernpfad' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Lernen' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders deep links and the 404 page', async () => {
    renderAt('/analysis/game-123');
    // The review page loads the game of the URL; this id does not exist on the (empty) device.
    expect(await screen.findByRole('heading', { level: 1, name: 'Partie nicht gefunden' })).toBeInTheDocument();
    expect(screen.getByText('Diese Partie gibt es auf diesem Gerät nicht (mehr).')).toBeInTheDocument();
  });

  it('shows a 404 page for unknown paths', async () => {
    renderAt('/gibt-es-nicht');
    expect(await screen.findByRole('heading', { level: 1, name: 'Seite nicht gefunden' })).toBeInTheDocument();
  });

  it('switches to the light theme via the settings store', async () => {
    renderAt('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Einstellungen' });
    expect(screen.getByRole('heading', { level: 2, name: 'Konto und Daten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daten exportieren' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Hell' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(useSettingsStore.getState().settings.theme).toBe('light');
    const nav = screen.getAllByRole('navigation', { name: 'Hauptnavigation' })[0]!;
    expect(within(nav).getByRole('link', { name: 'Profil' })).toHaveAttribute('aria-current', 'page');
  });
});
