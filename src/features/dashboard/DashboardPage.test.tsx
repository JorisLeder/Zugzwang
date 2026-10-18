/**
 * Component tests of the dashboard and the onboarding on the memory data layer: first start redirect, onboarding →
 * dashboard with first course, fitting bot and start rating, values from stored data, resume targets, empty states.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import { BOT_ROSTER, recommendBot } from '@/bots';
import { START_FEN } from '@/core/chess';
import { DEFAULT_SETTINGS, type SelfAssessment } from '@/core/profile';
import { createFakeAppServices, createMemoryDataServices, type MemoryDataServices } from '@/core/testing';
import { Component as OnboardingPage } from '@/features/onboarding/pages/OnboardingPage';
import { Component as DashboardPage } from './pages/DashboardPage';

const WAIT = { timeout: 4000 };

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname}</p>;
}

function setup(data: MemoryDataServices, url = '/') {
  const services = createFakeAppServices({ data, botRoster: BOT_ROSTER, config: { e2e: false } });
  const router = createMemoryRouter(
    [
      { path: '/', element: <DashboardPage /> },
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [url] },
  );
  render(
    <ServicesProvider services={services}>
      <RouterProvider router={router} />
    </ServicesProvider>,
  );
  return router;
}

async function onboarded(choice: SelfAssessment = 'club', patch: Record<string, unknown> = {}) {
  const data = createMemoryDataServices({ timeZone: 'Europe/Berlin', deviceId: 'device-a' });
  await data.progress.initializeFromSelfAssessment(choice);
  await data.progress.saveProfile({ onboardingCompleted: true, selfAssessment: choice, dailyGoalMinutes: 20, ...patch });
  return data;
}

afterEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, hydrated: false });
});

describe('first start', () => {
  it('redirects to the onboarding while it is not completed', async () => {
    const router = setup(createMemoryDataServices());
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'), WAIT);
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen bei Zugzwang' })).toBeInTheDocument();
  });

  it('onboarding sets ratings and goal, then the dashboard shows first course, fitting bot and start rating', async () => {
    const data = createMemoryDataServices({ timeZone: 'Europe/Berlin' });
    const router = setup(data, '/onboarding');
    await screen.findByRole('heading', { level: 1, name: 'Willkommen bei Zugzwang' });

    fireEvent.click(screen.getByRole('button', { name: 'Los geht’s' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wähle zuerst aus');

    fireEvent.click(screen.getByRole('radio', { name: /Neuling/ }));
    expect(screen.getByRole('radio', { name: '20' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '30' }));
    fireEvent.click(screen.getByRole('button', { name: 'Los geht’s' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'), WAIT);
    const profile = await data.repos.profile.get();
    expect(profile).toMatchObject({ onboardingCompleted: true, selfAssessment: 'newcomer', dailyGoalMinutes: 30 });
    expect((await data.repos.ratings.get('puzzle'))?.rating).toBe(400);
    expect((await data.repos.ratings.get('bot'))?.rating).toBe(200);

    expect(await screen.findByTestId('dashboard-puzzle-rating-value', {}, WAIT)).toHaveTextContent('400');
    expect(screen.getByTestId('dashboard-puzzle-rating')).toHaveTextContent('Startwert nach deiner Selbsteinschätzung');
    expect(screen.getByTestId('dashboard-bot-rating-value')).toHaveTextContent('noch keine Wertung');
    expect(await screen.findByTestId('dashboard-next-lesson-course', {}, WAIT)).toHaveTextContent('Brett und Figuren');
    const bot = recommendBot(200, BOT_ROSTER)!;
    expect(await screen.findByTestId('dashboard-bot-name', {}, WAIT)).toHaveTextContent(bot.name);
    expect(screen.getByTestId('dashboard-daily-goal-value')).toHaveAttribute('data-goal', '30');
  });

  it('keeps ratings that already count attempts', async () => {
    const data = createMemoryDataServices();
    await data.progress.initializeFromSelfAssessment('advanced');
    await data.progress.recordPuzzleAttempt({
      puzzleId: 'p1',
      mode: 'rated',
      solved: true,
      firstTry: true,
      hintsUsed: 0,
      solutionShown: false,
      timeMs: 4000,
      themes: ['fork'],
      puzzleRating: 1500,
      puzzleRd: 80,
    });
    const before = (await data.repos.ratings.get('puzzle'))!.rating;
    setup(data, '/onboarding');
    fireEvent.click(await screen.findByRole('radio', { name: /Neuling/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Los geht’s' }));
    await screen.findByTestId('dashboard-puzzle-rating-value', {}, WAIT);
    expect((await data.repos.ratings.get('puzzle'))!.rating).toBe(before);
  });

  it('shows a short note instead of the form once the onboarding is done', async () => {
    setup(await onboarded(), '/onboarding');
    expect(await screen.findByTestId('onboarding-done')).toHaveTextContent('Du bist schon eingerichtet');
  });
});

describe('dashboard', () => {
  it('shows values from stored data and every area one click away', async () => {
    const data = await onboarded('club', { displayName: 'Mia', dailyGoalMinutes: 30 });
    data.testing.addActiveMinutes(12);
    for (let i = 0; i < 6; i++) {
      await data.progress.recordPuzzleAttempt({
        puzzleId: `p${i}`,
        mode: 'theme',
        solved: i < 2,
        firstTry: i < 2,
        hintsUsed: 0,
        solutionShown: false,
        timeMs: 3000,
        themes: ['pin'],
        puzzleRating: 1000,
        puzzleRd: 80,
      });
    }
    setup(data);
    expect(await screen.findByText('Hallo Mia! Dein Training auf einen Blick.', {}, WAIT)).toBeInTheDocument();
    expect(await screen.findByTestId('dashboard-puzzle-rating-value')).toHaveTextContent('1.000');
    const goal = await screen.findByTestId('dashboard-daily-goal-value');
    expect(goal).toHaveAttribute('data-minutes', '12');
    expect(goal).toHaveAttribute('data-goal', '30');
    expect(screen.getByRole('progressbar', { name: 'Tagesziel: 12 von 30 Minuten' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('dashboard-streak-value')).toHaveAttribute('data-days', '1'), WAIT);

    // Weakest theme with ≥ 5 attempts and < 60 % → theme training.
    const train = await screen.findByTestId('dashboard-train-text', {}, WAIT);
    expect(train).toHaveAttribute('data-reason', 'weak_theme');
    expect(train).toHaveTextContent('Fesselung');
    expect(within(screen.getByTestId('dashboard-train-next')).getByRole('link', { name: 'Fesselung trainieren' })).toHaveAttribute('href', '/puzzles/themes/pin');

    // Resume: the last puzzle mode (theme training of the shared theme).
    const resume = await screen.findByTestId('dashboard-resume-main', {}, WAIT);
    expect(resume).toHaveAttribute('data-kind', 'puzzles');
    expect(within(resume).getByRole('link')).toHaveAttribute('href', '/puzzles/themes/pin');

    // Tiles link to their areas.
    expect(screen.getByTestId('dashboard-puzzle-rating')).toHaveAttribute('href', '/puzzles/rated');
    expect(screen.getByTestId('dashboard-bot-rating')).toHaveAttribute('href', '/play');
    expect(screen.getByTestId('dashboard-daily-goal')).toHaveAttribute('href', '/profile');
  });

  it('resumes a running game first, then the lesson in progress', async () => {
    const data = await onboarded('club');
    const game = await data.progress.createGame({
      source: 'bot',
      externalId: null,
      botId: BOT_ROSTER[3]!.id,
      userColor: 'w',
      assistance: 'training',
      timeControl: { kind: 'none' },
      startFen: START_FEN,
      pgn: '',
      headers: {},
      status: 'active',
      result: '*',
      endReason: null,
      origin: { type: 'new' },
      activeDeviceId: null,
      activeHeartbeatAt: null,
      ratingBefore: null,
      ratingAfter: null,
      finishedAt: null,
    });
    await data.progress.appendGameEvent({ gameId: game.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    await data.progress.recordLessonProgress({
      lessonId: 'gabel',
      lessonVersion: 1,
      currentStep: 2,
      completed: false,
      stars: 0,
      mistakes: 0,
      hintsUsed: 0,
      updatedAt: new Date().toISOString(),
      completedAt: null,
    });
    setup(data);
    const main = await screen.findByTestId('dashboard-resume-main', {}, WAIT);
    expect(main).toHaveAttribute('data-kind', 'game');
    expect(main).toHaveTextContent(`Partie gegen ${BOT_ROSTER[3]!.name}`);
    await waitFor(() => expect(main).toHaveTextContent('1 Halbzug gespielt'), WAIT);
    expect(within(main).getByRole('link', { name: /Partie fortsetzen/ })).toHaveAttribute('href', `/play/game/${game.id}`);
    const more = await screen.findAllByTestId('dashboard-resume-more');
    expect(more[0]).toHaveAttribute('data-kind', 'lesson');
    expect(more[0]).toHaveAttribute('href', '/learn/taktik-grundlagen/gabel');
    await waitFor(() => expect(more[0]).toHaveTextContent(/Weiter bei Schritt 3 von \d+/), WAIT);
  });

  it('empty state: nothing started yet → rated puzzles; no rated games → "noch keine Wertung" and a fitting bot', async () => {
    const data = await onboarded('beginner');
    setup(data);
    const resume = await screen.findByTestId('dashboard-resume', {}, WAIT);
    expect(await within(resume).findByText('Noch nichts angefangen', {}, WAIT)).toBeInTheDocument();
    expect(within(resume).getByRole('link', { name: 'Puzzles starten' })).toHaveAttribute('href', '/puzzles/rated');
    expect(screen.getByTestId('dashboard-bot-rating-value')).toHaveTextContent('noch keine Wertung');
    expect(await screen.findByTestId('dashboard-bot-name', {}, WAIT)).toHaveTextContent(recommendBot(400, BOT_ROSTER)!.name);
    // No weak theme, no analysed game → the next lesson is recommended.
    expect(await screen.findByTestId('dashboard-train-text', {}, WAIT)).toHaveAttribute('data-reason', 'next_lesson');
  });
});
