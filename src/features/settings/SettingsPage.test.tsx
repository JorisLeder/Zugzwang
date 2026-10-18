/**
 * Settings page: every setting applies immediately (settings store + <html> attributes) and is persisted in the
 * profile; Dunkel/Hell only (no "System"); English UI language is "in Vorbereitung" (disabled); the notation switch
 * changes the example letters; the daily goal is saved in the profile; the account section stays on the page.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import { START_FEN } from '@/core/chess';
import { DEFAULT_SETTINGS } from '@/core/profile';
import { createFakeAppServices, createMemoryDataServices } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import { NOTATION_EXAMPLE_UCI, notationExample } from './notationExample';
import { Component as SettingsPage } from './pages/SettingsPage';

async function setup() {
  const data = createMemoryDataServices({ profile: { onboardingCompleted: true } });
  const services = createFakeAppServices({ data });
  render(
    <ServicesProvider services={services}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ServicesProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Einstellungen' });
  return data;
}

afterEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, hydrated: false });
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.board;
  delete document.documentElement.dataset.motion;
});

describe('notation example', () => {
  it('is a legal line checked by the rules layer', () => {
    const game = ChessGame.fromMoves(START_FEN, [...NOTATION_EXAMPLE_UCI]);
    expect(game.history().length).toBe(NOTATION_EXAMPLE_UCI.length);
    expect(notationExample().map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
  });
});

describe('settings page', () => {
  it('offers Dunkel/Hell only and applies the design immediately', async () => {
    const data = await setup();
    const theme = screen.getByRole('radiogroup', { name: 'Design' });
    expect(within(theme).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Dunkel', 'Hell']);
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    fireEvent.click(within(theme).getByRole('radio', { name: 'Hell' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    await waitFor(async () => expect((await data.repos.profile.get())?.settings.theme).toBe('light'));
  });

  it('switches the board design and keeps the default piece set', async () => {
    const data = await setup();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Brettdesign' })).getByRole('radio', { name: 'Holz' }));
    await waitFor(() => expect(document.documentElement.dataset.board).toBe('holz'));
    await waitFor(async () => expect((await data.repos.profile.get())?.settings.boardTheme).toBe('holz'));
    expect(screen.getByRole('img', { name: 'Vorschau Brettdesign Holz' })).toBeInTheDocument();
    const pieces = within(screen.getByRole('radiogroup', { name: 'Figuren' })).getAllByRole('radio');
    expect(pieces.map((p) => p.textContent)).toEqual(['Standard']);
  });

  it('toggles every switch and persists it', async () => {
    const data = await setup();
    const cases = [
      ['Koordinaten anzeigen', 'showCoordinates', true],
      ['Mögliche Züge anzeigen', 'showLegalMoves', true],
      ['Zugbestätigung', 'moveConfirmation', false],
      ['Töne', 'sound', true],
      ['Animationen', 'animations', true],
    ] as const;
    for (const [label, key, initial] of cases) {
      const sw = screen.getByRole('switch', { name: label });
      expect(sw).toHaveAttribute('aria-checked', String(initial));
      fireEvent.click(sw);
      expect(useSettingsStore.getState().settings[key]).toBe(!initial);
      await waitFor(async () => expect((await data.repos.profile.get())?.settings[key]).toBe(!initial));
      expect(screen.getByRole('switch', { name: label })).toHaveAttribute('aria-checked', String(!initial));
    }
    expect(document.documentElement.dataset.motion).toBe('off');
  });

  it('switches the notation and shows the letters in the example', async () => {
    const data = await setup();
    const example = screen.getByTestId('settings-notation-example');
    expect(example).toHaveTextContent('1. e4 e5 2. Sf3 Sc6 3. Lb5 a6 4. La4 Sf6 5. 0-0');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Notation' })).getByRole('radio', { name: 'Englisch (K Q R B N)' }));
    expect(example).toHaveTextContent('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O');
    await waitFor(async () => expect((await data.repos.profile.get())?.settings.notation).toBe('en'));
  });

  it('keeps German as the only selectable language', async () => {
    await setup();
    const language = screen.getByRole('radiogroup', { name: 'Sprache' });
    expect(within(language).getByRole('radio', { name: 'Deutsch' })).toHaveAttribute('aria-checked', 'true');
    expect(within(language).getByRole('radio', { name: 'Englisch (in Vorbereitung)' })).toBeDisabled();
  });

  it('saves the daily goal in the profile and keeps the account section', async () => {
    const data = await setup();
    const goal = screen.getByRole('radiogroup', { name: 'Tagesziel (Minuten)' });
    expect(within(goal).getByRole('radio', { name: '20 Min.' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(goal).getByRole('radio', { name: '60 Min.' }));
    await waitFor(async () => expect((await data.repos.profile.get())?.dailyGoalMinutes).toBe(60));
    expect(within(goal).getByRole('radio', { name: '60 Min.' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: /Daten exportieren/ })).toBeInTheDocument();
  });
});
