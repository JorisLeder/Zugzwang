/**
 * Component tests of the lesson pages with the fixture course (D-52: `config.e2e` adds it to the catalog) on the
 * memory data layer. A remount on the same data services stands in for "leave and reopen" (wave 1, D-50).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import { DEFAULT_SETTINGS, type SelfAssessment } from '@/core/profile';
import { createFakeAppServices, createMemoryDataServices, FIXTURE_BOTS, type MemoryDataServices } from '@/core/testing';
import { Component as CoursePage } from './pages/CoursePage';
import { Component as LearnPathPage } from './pages/LearnPathPage';
import { Component as LessonPage } from './pages/LessonPage';

const WAIT = { timeout: 4000 };
const COURSE = 'fixture-course';

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{`${loc.pathname}${loc.search}`}</p>;
}

interface SetupOptions {
  data?: MemoryDataServices;
  assessment?: SelfAssessment;
  e2e?: boolean;
}

async function setup(url: string, { data: shared, assessment, e2e = true }: SetupOptions = {}) {
  const data = shared ?? createMemoryDataServices({ timeZone: 'Europe/Berlin' });
  if (assessment) await data.progress.initializeFromSelfAssessment(assessment);
  const services = createFakeAppServices({ data, config: { e2e } });
  const router = createMemoryRouter(
    [
      { path: '/learn', element: <LearnPathPage /> },
      { path: '/learn/:courseId', element: <CoursePage /> },
      { path: '/learn/:courseId/:lessonId', element: <LessonPage /> },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [url] },
  );
  const view = render(
    <ServicesProvider services={services}>
      <RouterProvider router={router} />
    </ServicesProvider>,
  );
  return { data: data as MemoryDataServices, router, services, unmount: view.unmount };
}

afterEach(() => {
  useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS });
});

function square(sq: string): HTMLElement {
  return document.querySelector(`[data-testid="board"] [data-square="${sq}"]`) as HTMLElement;
}

async function move(uci: string) {
  fireEvent.click(square(uci.slice(0, 2)));
  fireEvent.click(square(uci.slice(2, 4)));
  await act(async () => {});
}

const player = () => screen.getByTestId('lesson-player');
const stepType = () => screen.getByTestId('lesson-step').getAttribute('data-step-type');
const nextButton = () => screen.getByTestId('lesson-next');

async function waitForStep(type: string, index?: number) {
  await waitFor(() => expect(stepType()).toBe(type), WAIT);
  if (index !== undefined) expect(player()).toHaveAttribute('data-step-index', String(index));
}

/** Walks the first fixture lesson; `mistakes` adds one wrong move and one wrong quiz answer, `hints` one hint. */
async function walkFixtureLesson({ mistakes = false, hints = false } = {}) {
  // 1 Erklärung
  await waitForStep('explanation', 0);
  expect(screen.getByTestId('step-text')).toHaveTextContent('Der schwarze König steht hinter seinen eigenen Bauern');
  fireEvent.click(nextButton());
  // 2 Demo: Vor/Zurück with comments
  await waitForStep('demo', 1);
  expect(screen.getByTestId('demo-comment')).toHaveTextContent('Ausgangsstellung');
  fireEvent.click(screen.getByRole('button', { name: 'Vor' }));
  expect(screen.getByTestId('demo-comment')).toHaveTextContent('Zug 1 von 2: a5');
  fireEvent.click(screen.getByRole('button', { name: 'Vor' }));
  expect(screen.getByTestId('demo-comment')).toHaveTextContent('Td8 – Matt!');
  fireEvent.click(nextButton());
  // 3 Finde den Zug (mate in two, opponent reply auto-played)
  await waitForStep('find_move', 2);
  expect(nextButton()).toBeDisabled();
  if (hints) {
    fireEvent.click(screen.getByTestId('hint-button'));
    expect(screen.getByTestId('find-move-hint')).toHaveTextContent('Ein sofortiges Schach hilft hier nicht');
  }
  if (mistakes) {
    await move('a1a8');
    expect(screen.getByTestId('find-move-status')).toHaveTextContent('Nicht ganz');
    await waitFor(() => expect(screen.getByTestId('lesson-step')).toHaveAttribute('data-phase', 'user'), WAIT);
  }
  await move('f6g6');
  await waitFor(() => expect(screen.getByTestId('lesson-step')).toHaveAttribute('data-phase', 'user'), WAIT);
  expect(screen.getByTestId('board')).toHaveAttribute('data-fen', '6k1/8/6K1/8/8/8/8/R7 w - - 2 2');
  await move('a1a8');
  await waitFor(() => expect(screen.getByTestId('lesson-step')).toHaveAttribute('data-phase', 'done'), WAIT);
  expect(nextButton()).toBeEnabled();
  fireEvent.click(nextButton());
  // 4 Quiz
  await waitForStep('quiz', 3);
  if (mistakes) {
    fireEvent.click(screen.getByRole('button', { name: 'Schachmatt' }));
    expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('Der schwarze König steht nicht im Schach.');
    expect(nextButton()).toBeDisabled();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Patt – die Partie ist remis' }));
  expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('Schwarz hat keinen regelgemäßen Zug');
  fireEvent.click(nextButton());
  // 5 Ausspielen against the (fake) bot: 1.Kb6 Kb8 (forced) 2.Rh8#
  await waitForStep('play_out', 4);
  expect(screen.getByTestId('moves-left')).toHaveTextContent('Noch 3 Züge');
  await move('c6b6');
  await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-fen', expect.stringMatching(/^1k6\/8\/1K6/)), WAIT);
  await move('h1h8');
  await waitFor(() => expect(screen.getByTestId('lesson-step')).toHaveAttribute('data-outcome', 'success'), WAIT);
  fireEvent.click(nextButton());
  await screen.findByTestId('lesson-end');
}

describe('Lernpfad', () => {
  it('shows stages 0–4, planned stages, the locked Stufe 1 and the skip test for a new learner', async () => {
    await setup('/learn');
    expect(await screen.findByRole('heading', { level: 2, name: 'Stufe 0 · Neuling' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Lernpfad' })).toBeInTheDocument();
    for (const name of ['Stufe 0 · Neuling', 'Stufe 1 · Einsteiger', 'Stufe 2 · Clubspieler', 'Stufe 3 · Fortgeschritten', 'Stufe 4 · Experte']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    const stage1 = document.querySelector('[data-stage-id="1"]') as HTMLElement;
    expect(stage1).toHaveAttribute('data-status', 'locked');
    expect(within(stage1).getByText(/bestehe den Einstufungstest/)).toBeInTheDocument();
    expect(document.querySelector(`[data-course-id="${COURSE}"]`)).toHaveAttribute('data-status', 'locked');
    expect(document.querySelector('[data-stage-id="4"]')).toHaveAttribute('data-status', 'planned');
    expect(within(document.querySelector('[data-stage-id="4"]') as HTMLElement).getByText('Diese Stufe ist in Vorbereitung.')).toBeInTheDocument();
    expect(await screen.findByTestId('skip-test')).toHaveTextContent('Einstufungstest starten');
  });

  it('opens Stufe 1 by the self-assessment and highlights the next lesson', async () => {
    await setup('/learn', { assessment: 'beginner' });
    await waitFor(() => expect(document.querySelector(`[data-course-id="${COURSE}"]`)).toHaveAttribute('data-status', 'open'));
    expect(document.querySelector(`[data-course-id="${COURSE}"]`)).toHaveAttribute('data-next', 'true');
    expect(screen.getByText('Freigeschaltet durch deine Selbsteinschätzung.')).toBeInTheDocument();
    const hero = await screen.findByTestId('next-lesson');
    await waitFor(() => expect(hero).toHaveTextContent('Das Grundreihenmatt'));
    expect(within(hero).getByRole('link', { name: /Lektion starten/ })).toHaveAttribute('href', `/learn/${COURSE}/fixture-lesson`);
    expect(screen.queryByTestId('skip-test')).not.toBeInTheDocument();
  });

  it('never shows the fixture course outside e2e builds (D-52)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await setup('/learn', { e2e: false });
    await screen.findByRole('heading', { level: 2, name: 'Stufe 0 · Neuling' });
    expect(document.querySelector(`[data-course-id="${COURSE}"]`)).toBeNull();
    warn.mockRestore();
  });
});

describe('Kurs', () => {
  it('lists the lessons in order: first open, second locked, course test locked until all lessons are done', async () => {
    await setup(`/learn/${COURSE}`, { assessment: 'beginner' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Testkurs: Grundreihe' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-lesson-id="fixture-lesson"]')).toHaveAttribute('data-status', 'new'));
    expect(document.querySelector('[data-lesson-id="fixture-lesson-2"]')).toHaveAttribute('data-status', 'locked');
    expect(document.querySelector('[data-lesson-id="fixture-lesson-2"]')).toHaveTextContent('Schließe zuerst „Das Grundreihenmatt“ ab.');
    expect(document.querySelector('[data-lesson-id="fixture-test"]')).toHaveTextContent('Schließe zuerst alle Lektionen ab.');
  });

  it('a locked lesson opened directly shows the lock and a way to the required lesson', async () => {
    await setup(`/learn/${COURSE}/fixture-lesson-2`, { assessment: 'beginner' });
    expect(await screen.findByText('Diese Lektion ist noch gesperrt')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-locked-action')).toHaveAttribute('href', `/learn/${COURSE}/fixture-lesson`);
  });
});

describe('Lektion', () => {
  it('walks through all five step types, saves progress per step and ends with 3 stars (AC 1, 3, 5)', async () => {
    const { data, services } = await setup(`/learn/${COURSE}/fixture-lesson`, { assessment: 'beginner' });
    const record = vi.spyOn(data.progress, 'recordLessonProgress');
    await walkFixtureLesson();
    expect(record).toHaveBeenCalledTimes(5);
    expect(record.mock.calls.map(([p]) => p.currentStep)).toEqual([1, 2, 3, 4, 5]);
    expect(record.mock.calls[4]![0]).toMatchObject({ completed: true, stars: 3, mistakes: 0, hintsUsed: 0 });
    expect(await data.repos.lessonProgress.get('fixture-lesson')).toMatchObject({ completed: true, stars: 3 });
    const end = screen.getByTestId('lesson-end');
    expect(within(end).getByRole('img', { name: /3 von 3/ })).toBeInTheDocument();
    expect(end).toHaveTextContent('Ohne Fehler und ohne Hinweise');
    // Verzahnung: next lesson, matching puzzles, practice game (bot rating 600 for "Einsteiger" → nearest bot).
    await waitFor(() => expect(screen.getByTestId('lesson-primary')).toHaveAttribute('href', `/learn/${COURSE}/fixture-lesson-2`));
    expect(screen.getByTestId('lesson-primary')).toHaveTextContent('Nächste Lektion');
    expect(screen.getByTestId('matching-puzzles')).toHaveAttribute('href', '/puzzles/themes/backRankMate');
    expect(screen.getByTestId('matching-puzzles')).toHaveTextContent('Passende Puzzles');
    const botRating = (await data.repos.ratings.get('bot'))!.rating;
    const nearest = [...services.botRoster].sort((a, b) => Math.abs(a.elo - botRating) - Math.abs(b.elo - botRating) || a.elo - b.elo)[0]!;
    await waitFor(() => expect(screen.getByTestId('practice-game')).toHaveAttribute('data-bot-id', nearest.id));
    fireEvent.click(screen.getByTestId('practice-game'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/play\/game\//));
    const games = await data.repos.games.list();
    expect(games[0]).toMatchObject({ botId: nearest.id, origin: { type: 'lesson', ref: 'fixture-lesson' } });
  });

  it('counts mistakes and hints: 1 hint + 2 mistakes → 1 star; the best result is kept (D-13)', async () => {
    const { data } = await setup(`/learn/${COURSE}/fixture-lesson`, { assessment: 'beginner' });
    await walkFixtureLesson({ mistakes: true, hints: true });
    const end = screen.getByTestId('lesson-end');
    expect(end).toHaveAttribute('data-stars', '1');
    expect(end).toHaveTextContent('2 Fehler · 1 Hinweis');
    expect(await data.repos.lessonProgress.get('fixture-lesson')).toMatchObject({ completed: true, stars: 1, mistakes: 2, hintsUsed: 1 });
    // Repeat without mistakes → 3 stars stored.
    fireEvent.click(screen.getByRole('button', { name: 'Lektion wiederholen' }));
    await walkFixtureLesson();
    expect(screen.getByTestId('lesson-end')).toHaveAttribute('data-stars', '3');
    await waitFor(async () => expect((await data.repos.lessonProgress.get('fixture-lesson'))!.stars).toBe(3));
  });

  it('Ausspielen: missing the goal within maxMoves fails, counts a mistake and can be retried', async () => {
    const data = createMemoryDataServices({ timeZone: 'Europe/Berlin' });
    await data.progress.initializeFromSelfAssessment('beginner');
    await data.progress.recordLessonProgress({
      lessonId: 'fixture-lesson',
      lessonVersion: 1,
      currentStep: 4,
      completed: false,
      stars: 0,
      mistakes: 0,
      hintsUsed: 0,
      updatedAt: '2026-10-17T10:00:00.000Z',
      completedAt: null,
    });
    await setup(`/learn/${COURSE}/fixture-lesson`, { data });
    await waitForStep('play_out', 4);
    const step = () => screen.getByTestId('lesson-step');
    for (const [i, uci] of ['h1h2', 'h2h1', 'h1h2'].entries()) {
      await waitFor(() => expect(screen.getByTestId('play-out-status')).toHaveTextContent('Du bist am Zug.'), WAIT);
      await move(uci);
      if (i < 2) await waitFor(() => expect(screen.getByTestId('moves-left')).toHaveTextContent(i === 0 ? 'Noch 2 Züge' : 'Noch 1 Zug'), WAIT);
    }
    await waitFor(() => expect(step()).toHaveAttribute('data-outcome', 'fail'), WAIT);
    expect(screen.getByTestId('play-out-status')).toHaveTextContent('Du hattest 3 Züge.');
    expect(step()).toHaveTextContent('Noch kein Matt.');
    expect(nextButton()).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('play-out-retry')).toHaveFocus());
    fireEvent.click(screen.getByTestId('play-out-retry'));
    await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-fen', 'k7/8/2K5/8/8/8/8/7R w - - 0 1'));
    await move('c6b6');
    await waitFor(() => expect(screen.getByTestId('board')).toHaveAttribute('data-fen', expect.stringMatching(/^1k6\/8\/1K6/)), WAIT);
    await move('h1h8');
    await waitFor(() => expect(step()).toHaveAttribute('data-outcome', 'success'), WAIT);
    fireEvent.click(nextButton());
    expect(await screen.findByTestId('lesson-end')).toHaveAttribute('data-stars', '2');
  });

  it('resumes at the saved step after leaving (remount on the same data) and can start over (AC 2)', async () => {
    const first = await setup(`/learn/${COURSE}/fixture-lesson`, { assessment: 'beginner' });
    await waitForStep('explanation', 0);
    fireEvent.click(nextButton());
    await waitForStep('demo', 1);
    fireEvent.click(nextButton());
    await waitForStep('find_move', 2);
    // Completed steps can be reviewed; "Weiter" brings the learner back.
    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitForStep('demo', 1);
    expect(screen.getByText('Du schaust dir einen erledigten Schritt an.')).toBeInTheDocument();
    fireEvent.click(nextButton());
    await waitForStep('find_move', 2);
    await move('a1a8'); // a mistake on step 3 – saved only when the step is completed
    await waitFor(async () => expect((await first.data.repos.lessonProgress.get('fixture-lesson'))!.currentStep).toBe(2));
    first.unmount();

    await setup(`/learn/${COURSE}/fixture-lesson`, { data: first.data });
    await waitForStep('find_move', 2);
    expect(screen.getByTestId('resume-notice')).toHaveTextContent('Du machst bei Schritt 3 weiter.');
    expect(screen.getAllByTestId('lesson-header')[0]).toHaveTextContent('Schritt 3 von 5');
    fireEvent.click(screen.getByRole('button', { name: 'Von vorn beginnen' }));
    await waitForStep('explanation', 0);
    expect(screen.queryByTestId('resume-notice')).not.toBeInTheDocument();
  });

  it('keyboard: Enter = Weiter, ←/→ on explanations, ←/→ through the demo moves (AC 6)', async () => {
    await setup(`/learn/${COURSE}/fixture-lesson`, { assessment: 'beginner' });
    await waitForStep('explanation', 0);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitForStep('demo', 1);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('demo-comment')).toHaveTextContent('Zug 1 von 2');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('demo-comment')).toHaveTextContent('Ausgangsstellung');
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitForStep('find_move', 2);
    // Enter does nothing while the exercise is unsolved; H shows a hint.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(stepType()).toBe('find_move');
    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.getByTestId('find-move-hint')).toBeInTheDocument();
  });
});

describe('Tests', () => {
  async function completeLessons(data: MemoryDataServices) {
    for (const id of ['fixture-lesson', 'fixture-lesson-2']) {
      await data.progress.recordLessonProgress({
        lessonId: id,
        lessonVersion: 1,
        currentStep: 5,
        completed: true,
        stars: 3,
        mistakes: 0,
        hintsUsed: 0,
        updatedAt: '2026-10-17T10:00:00.000Z',
        completedAt: '2026-10-17T10:00:00.000Z',
      });
    }
  }

  async function answerCourseTest({ firstQuizWrong }: { firstQuizWrong: boolean }) {
    await waitForStep('quiz', 0);
    if (firstQuizWrong) fireEvent.click(screen.getByRole('button', { name: 'Ein Patt am Brettrand.' }));
    fireEvent.click(screen.getByRole('button', { name: /Ein Matt auf der Grundreihe/ }));
    fireEvent.click(nextButton());
    await waitForStep('find_move', 1);
    await move('d1d8');
    await waitFor(() => expect(screen.getByTestId('lesson-step')).toHaveAttribute('data-phase', 'done'), WAIT);
    fireEvent.click(nextButton());
    await waitForStep('quiz', 2);
    fireEvent.click(screen.getByRole('button', { name: 'Schachmatt' }));
    fireEvent.click(nextButton());
    await screen.findByTestId('lesson-end');
  }

  it('course test: 2 of 3 first tries (67 %) fails the 80 % threshold, 3 of 3 passes and completes the course (AC 4)', async () => {
    const data = createMemoryDataServices({ timeZone: 'Europe/Berlin' });
    await data.progress.initializeFromSelfAssessment('beginner');
    await completeLessons(data);
    await setup(`/learn/${COURSE}/fixture-test`, { data });
    await answerCourseTest({ firstQuizWrong: true });
    expect(screen.getByTestId('lesson-end')).toHaveAttribute('data-passed', 'false');
    expect(screen.getByTestId('test-score')).toHaveTextContent('2 von 3 Aufgaben auf Anhieb richtig (67');
    expect(screen.getByTestId('lesson-end')).toHaveTextContent('Zum Bestehen brauchst du 80');
    expect(await data.repos.lessonProgress.get('fixture-test')).toMatchObject({ completed: false });
    fireEvent.click(screen.getByTestId('lesson-primary'));
    await answerCourseTest({ firstQuizWrong: false });
    expect(screen.getByTestId('lesson-end')).toHaveAttribute('data-passed', 'true');
    expect(screen.getByTestId('lesson-end')).toHaveTextContent('Du hast den Kurs „Testkurs: Grundreihe“ abgeschlossen.');
    await waitFor(async () => expect(await data.repos.lessonProgress.get('fixture-test')).toMatchObject({ completed: true, score: 1 }));
  });

  it('skip test: passing sets profile.stageZeroSkipped and opens Stufe 1 (AC 4, D-38)', async () => {
    const { data, router } = await setup(`/learn/${COURSE}/fixture-skip-test`);
    await waitForStep('quiz', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Schachmatt' }));
    fireEvent.click(nextButton());
    await waitForStep('quiz', 1);
    fireEvent.click(screen.getByRole('button', { name: /Er wird in eine Dame, einen Turm/ }));
    fireEvent.click(nextButton());
    expect(await screen.findByTestId('lesson-end')).toHaveAttribute('data-passed', 'true');
    expect(screen.getByTestId('test-score')).toHaveTextContent('2 von 2');
    await waitFor(async () => expect((await data.repos.profile.get())?.stageZeroSkipped).toBe(true));
    expect(screen.getByTestId('lesson-primary')).toHaveTextContent('Zu Stufe 1');
    await act(() => router.navigate('/learn'));
    await waitFor(() => expect(document.querySelector('[data-stage-id="1"]')).toHaveAttribute('data-status', 'open'));
    expect(screen.getByText('Freigeschaltet durch den Einstufungstest.')).toBeInTheDocument();
    expect(screen.getByTestId('skip-test-passed')).toBeInTheDocument();
  });

  it('skip test: failing keeps Stufe 1 locked and offers Stufe 0', async () => {
    const { data } = await setup(`/learn/${COURSE}/fixture-skip-test`);
    await waitForStep('quiz', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Patt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schachmatt' }));
    fireEvent.click(nextButton());
    await waitForStep('quiz', 1);
    fireEvent.click(screen.getByRole('button', { name: /Er wird in eine Dame, einen Turm/ }));
    fireEvent.click(nextButton());
    expect(await screen.findByTestId('lesson-end')).toHaveAttribute('data-passed', 'false');
    expect(screen.getByTestId('lesson-primary')).toHaveTextContent('Mit Stufe 0 beginnen');
    expect((await data.repos.profile.get())?.stageZeroSkipped ?? false).toBe(false);
  });
});

describe('practice bot without a bot rating', () => {
  it('uses the stage range (Stufe 1 → 400–800)', async () => {
    const data = createMemoryDataServices({ timeZone: 'Europe/Berlin', profile: { selfAssessment: 'beginner', onboardingCompleted: true } });
    await data.progress.recordLessonProgress({
      lessonId: 'fixture-lesson-2',
      lessonVersion: 1,
      currentStep: 1,
      completed: false,
      stars: 0,
      mistakes: 0,
      hintsUsed: 0,
      updatedAt: '2026-10-17T10:00:00.000Z',
      completedAt: null,
    });
    await setup(`/learn/${COURSE}/fixture-lesson-2`, { data });
    await waitForStep('quiz', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Td8' }));
    fireEvent.click(nextButton());
    await screen.findByTestId('lesson-end');
    const expected = [...FIXTURE_BOTS].sort((a, b) => a.elo - b.elo).find((b) => b.elo >= 400 && b.elo <= 800) ?? FIXTURE_BOTS[0]!;
    await waitFor(() => expect(screen.getByTestId('practice-game')).toHaveAttribute('data-bot-id', expected.id));
  });
});
