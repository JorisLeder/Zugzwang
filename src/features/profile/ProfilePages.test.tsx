/**
 * Profile and statistics pages on the memory data layer: name, ratings, streak, daily goal (saved immediately), mode
 * and sync status, account section; statistics with rating curves, theme success, phase accuracy and mistakes from
 * seeded data (charts lazily loaded, table fallback) and their empty states.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import type { AnalysedMove, GameAnalysis, GamePhase, MoveClassification } from '@/core/analysis';
import { START_FEN, type Color } from '@/core/chess';
import type { MotifId } from '@/core/explain';
import { DEFAULT_SETTINGS } from '@/core/profile';
import { createFakeAppServices, createMemoryDataServices, type MemoryDataServices } from '@/core/testing';
import { Component as ProfilePage } from './pages/ProfilePage';
import { Component as StatsPage } from './pages/StatsPage';

const WAIT = { timeout: 4000 };

function renderPage(data: MemoryDataServices, page: 'profile' | 'stats') {
  const services = createFakeAppServices({ data });
  render(
    <ServicesProvider services={services}>
      <MemoryRouter>{page === 'profile' ? <ProfilePage /> : <StatsPage />}</MemoryRouter>
    </ServicesProvider>,
  );
}

async function onboarded() {
  const data = createMemoryDataServices({ timeZone: 'Europe/Berlin' });
  await data.progress.initializeFromSelfAssessment('club');
  await data.progress.saveProfile({ onboardingCompleted: true, dailyGoalMinutes: 20, displayName: 'Mia' });
  return data;
}

async function solve(data: MemoryDataServices, i: number, theme: string, solved: boolean, mode: 'rated' | 'theme' = 'rated') {
  await data.progress.recordPuzzleAttempt({
    puzzleId: `p${theme}${i}`,
    mode,
    solved,
    firstTry: solved,
    hintsUsed: 0,
    solutionShown: false,
    timeMs: 3000,
    themes: [theme],
    puzzleRating: 1000,
    puzzleRd: 80,
  });
}

function move(ply: number, color: Color, phase: GamePhase, accuracy: number, classification: MoveClassification, motifs?: MotifId[]): AnalysedMove {
  return {
    ply,
    color,
    san: 'e4',
    uci: 'e2e4',
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    evalBefore: { type: 'cp', value: 0 },
    evalAfter: { type: 'cp', value: 0 },
    bestMove: 'e2e4',
    bestMoveSan: 'e4',
    bestLine: [],
    playedLine: [],
    winPctBefore: 50,
    winPctAfter: 50,
    expectedPointsLoss: 0,
    accuracy,
    classification,
    phase,
    facts: motifs ? { kind: 'mistake', mover: color, fenBefore: START_FEN, bestLine: [], refutation: [], motifs: motifs.map((id) => ({ id, squares: [], pieces: [] })) } : undefined,
  } as AnalysedMove;
}

function analysis(gameId: string, moves: AnalysedMove[]): GameAnalysis {
  const counts = { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 };
  return {
    gameId,
    engineId: 'test',
    engineVersion: '1',
    depth: 12,
    createdAt: new Date().toISOString(),
    accuracy: { w: 70, b: 80 },
    counts: { w: { ...counts }, b: { ...counts } },
    moves,
    keyMoments: [],
    evalGraph: [],
  };
}

afterEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, hydrated: false });
});

describe('profile page', () => {
  it('shows name, ratings, streak, goal, mode and the account section', async () => {
    const data = await onboarded();
    data.testing.addActiveMinutes(7);
    renderPage(data, 'profile');
    expect(await screen.findByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Anzeigename')).toHaveValue('Mia');
    await waitFor(() => expect(screen.getByTestId('profile-puzzle-rating')).toHaveTextContent('1.000'), WAIT);
    expect(screen.getByTestId('profile-puzzle-rating')).toHaveTextContent('Startwert');
    expect(screen.getByTestId('profile-bot-rating')).toHaveTextContent('noch keine Wertung');
    expect(screen.getByTestId('profile-ratings')).toHaveTextContent('Clubspieler');
    await waitFor(() => expect(screen.getByTestId('profile-streak')).toHaveTextContent(/1/), WAIT);
    expect(screen.getByTestId('profile-goal')).toHaveTextContent('Heute: 7 von 20 Minuten');
    const sync = screen.getByTestId('profile-sync');
    expect(sync).toHaveAttribute('data-mode', 'local');
    expect(sync).toHaveTextContent('Lokaler Modus');
    expect(screen.getByRole('button', { name: /Daten exportieren/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /löschen/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '/settings');
  });

  it('saves the name and the daily goal immediately', async () => {
    const data = await onboarded();
    renderPage(data, 'profile');
    const input = await screen.findByLabelText('Anzeigename');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte gib einen Namen ein.');
    fireEvent.change(input, { target: { value: 'Jonas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(async () => expect((await data.repos.profile.get())?.displayName).toBe('Jonas'));

    const goal = screen.getByRole('radiogroup', { name: 'Tagesziel in Minuten' });
    fireEvent.click(within(goal).getByRole('radio', { name: '10' }));
    await waitFor(async () => expect((await data.repos.profile.get())?.dailyGoalMinutes).toBe(10));
    expect(await screen.findByText('Tagesziel gespeichert.')).toBeInTheDocument();
    expect(within(goal).getByRole('radio', { name: '10' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('statistics page', () => {
  it('shows rating curves, theme success, phase accuracy and frequent mistakes from stored data', async () => {
    const data = await onboarded();
    for (let i = 0; i < 4; i++) await solve(data, i, 'fork', i !== 1);
    for (let i = 0; i < 6; i++) await solve(data, i, 'pin', i < 2, 'theme');
    const game = await data.progress.createGame({
      source: 'bot',
      externalId: null,
      botId: 'pip',
      userColor: 'w',
      assistance: 'training',
      timeControl: { kind: 'none' },
      startFen: START_FEN,
      pgn: '',
      headers: {},
      status: 'finished',
      result: '0-1',
      endReason: 'checkmate',
      origin: { type: 'new' },
      activeDeviceId: null,
      activeHeartbeatAt: null,
      ratingBefore: null,
      ratingAfter: null,
      finishedAt: new Date().toISOString(),
    });
    const moves: AnalysedMove[] = [];
    for (let i = 0; i < 6; i++) moves.push(move(moves.length + 1, 'w', 'opening', 90, 'good'), move(moves.length + 2, 'b', 'opening', 20, 'blunder', ['fork']));
    moves.push(move(13, 'w', 'middlegame', 40, 'blunder', ['fork', 'hanging_piece']), move(15, 'w', 'middlegame', 60, 'mistake', ['fork']), move(17, 'w', 'endgame', 70, 'inaccuracy'));
    await data.progress.saveAnalysis(analysis(game.id, moves));

    renderPage(data, 'stats');
    const puzzleCurve = await screen.findByTestId('stats-rating-puzzle', {}, WAIT);
    expect(puzzleCurve).toHaveAttribute('data-count', '4');
    expect(puzzleCurve).toHaveTextContent('Aktuell');
    expect(screen.getByRole('slider', { name: /Puzzle-Rating: 4 Wertungen/ })).toBeInTheDocument();
    expect(screen.getByTestId('stats-rating-bot')).toHaveTextContent('Spiel Partien im Modus Wettkampf');

    // Table fallback of the rating curve.
    fireEvent.click(within(puzzleCurve).getByRole('button', { name: 'Als Tabelle anzeigen' }));
    expect(within(puzzleCurve).getAllByRole('row')).toHaveLength(5);

    const themes = screen.getByTestId('stats-themes-bars');
    const pin = themes.querySelector('[data-row="pin"]')!;
    expect(pin).toHaveAttribute('data-flagged', 'true');
    expect(pin).toHaveTextContent('33 %');
    expect(within(pin as HTMLElement).getByRole('link', { name: 'Fesselung trainieren' })).toHaveAttribute('href', '/puzzles/themes/pin');
    expect(themes.querySelector('[data-row="fork"]')).toHaveTextContent('75 %');

    const phases = screen.getByTestId('stats-phases-bars');
    expect(phases.querySelector('[data-row="opening"]')).toHaveAttribute('data-value', '90');
    expect(phases.querySelector('[data-row="middlegame"]')).toHaveAttribute('data-value', '50');
    expect(phases.querySelector('[data-row="middlegame"]')).toHaveTextContent('schwächste Phase');

    const types = screen.getByTestId('stats-mistake-types');
    expect(types.querySelector('[data-classification="blunder"]')).toHaveAttribute('data-count', '1');
    expect(types.querySelector('[data-classification="mistake"]')).toHaveAttribute('data-count', '1');
    expect(types.querySelector('[data-classification="inaccuracy"]')).toHaveAttribute('data-count', '1');
    const motifs = screen.getByTestId('stats-motifs').querySelectorAll('li');
    expect(motifs[0]).toHaveAttribute('data-motif', 'fork');
    expect(motifs[0]).toHaveAttribute('data-count', '2');
    expect(motifs[1]).toHaveAttribute('data-motif', 'hanging_piece');
  });

  it('explains every section when there is no data yet', async () => {
    renderPage(await onboarded(), 'stats');
    expect(await screen.findByTestId('stats-rating-puzzle', {}, WAIT)).toHaveTextContent('Löse bewertete Puzzles');
    expect(screen.getByTestId('stats-themes')).toHaveTextContent('Noch keine Puzzle-Versuche.');
    expect(screen.getByTestId('stats-phases')).toHaveTextContent('Noch keine analysierten Partien.');
    expect(screen.getByTestId('stats-mistakes')).toHaveTextContent('Noch keine Fehler gefunden');
  });
});
