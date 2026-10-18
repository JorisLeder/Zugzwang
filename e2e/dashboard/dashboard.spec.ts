/**
 * WP-09 e2e – first start and dashboard (PRD Kern-Ablauf 1, P0-14) on the real Dexie data layer:
 * - AC1: first start → onboarding → dashboard with the first course, a fitting bot and the puzzle start rating;
 * - AC2: all dashboard items with values from stored data; "Weiter, wo du aufgehört hast" resumes a game and a lesson.
 * Runs on desktop and mobile.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { recommendBot } from '../../src/bots/recommend';
import { board, clickMove, readFen } from '../support/board';
import { expect, test } from '../support/fixtures';
import { completeOnboarding, navigateInApp, rating, readStore, seed, storedProfile, todayKey, visible } from './helpers';

/** Back to the dashboard without a reload (board screens hide the tab bar on phones). */
async function goHome(page: Page) {
  await navigateInApp(page, paths.home());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
}

test.describe('first start (AC1)', () => {
  test('onboarding → dashboard with the first course, a fitting bot and the puzzle start rating', async ({ page }) => {
    await completeOnboarding(page, 'Neuling', 30);

    await expect(page.getByTestId('dashboard-puzzle-rating-value')).toHaveText('400');
    await expect(page.getByTestId('dashboard-puzzle-rating')).toContainText('Startwert nach deiner Selbsteinschätzung');
    await expect(page.getByTestId('dashboard-bot-rating-value')).toHaveText('noch keine Wertung');
    await expect(page.getByTestId('dashboard-next-lesson-course')).toHaveText('Brett und Figuren');
    await expect(page.getByTestId('dashboard-next-lesson-title')).toHaveText('Brett und Feldnamen');
    await expect(page.getByTestId('dashboard-bot-name')).toHaveText(recommendBot(200).name);
    await expect(page.getByTestId('dashboard-daily-goal-value')).toHaveAttribute('data-goal', '30');

    const profile = await storedProfile(page);
    expect(profile).toMatchObject({ onboardingCompleted: true, dailyGoalMinutes: 30 });

    // Completed onboarding is not shown again; the first course is one click away.
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId('dashboard-next-lesson').getByRole('link', { name: /Lektion starten/ }).click();
    await expect(page).toHaveURL(/\/learn\/brett-und-figuren\/brett-und-feldnamen$/);
  });

  test('the dashboard redirects to the onboarding until it is completed', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto(paths.profile());
    await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});

test.describe('dashboard (AC2)', () => {
  test('shows ratings, streak, daily goal and "Als Nächstes trainieren" from stored data', async ({ page }) => {
    await completeOnboarding(page, 'Clubspieler', 20);
    const today = await todayKey(page);
    const now = new Date().toISOString();
    await seed(page, {
      ratings: [rating('puzzle', 1234, 6, now), rating('bot', 1105, 3, now)],
      dailyActivity: [{ date: today, minutes: 12, puzzles: 6, games: 0, lessons: 0, goalReached: false }],
      themeStats: [
        { theme: 'pin', attempts: 6, successes: 2 },
        { theme: 'fork', attempts: 10, successes: 9 },
      ],
    });

    await expect(page.getByTestId('dashboard-puzzle-rating-value')).toHaveText('1.234');
    await expect(page.getByTestId('dashboard-puzzle-rating')).toContainText('6 bewertete Puzzles');
    await expect(page.getByTestId('dashboard-bot-rating-value')).toHaveText('1.105');
    await expect(page.getByTestId('dashboard-bot-rating')).toContainText('3 gewertete Partien');
    await expect(page.getByTestId('dashboard-streak-value')).toHaveAttribute('data-days', '1');
    await expect(page.getByTestId('dashboard-daily-goal-value')).toHaveAttribute('data-minutes', '12');
    await expect(page.getByRole('progressbar', { name: 'Tagesziel: 12 von 20 Minuten' })).toBeVisible();
    await expect(page.getByTestId('dashboard-daily-goal')).toContainText('Noch 8 Min.');
    await expect(page.getByTestId('dashboard-bot-name')).toHaveText(recommendBot(1105).name);
    await expect(page.getByTestId('dashboard-next-lesson-title')).not.toBeEmpty();

    const train = page.getByTestId('dashboard-train-text');
    await expect(train).toHaveAttribute('data-reason', 'weak_theme');
    await expect(train).toContainText('Fesselung: 33');
    await page.getByTestId('dashboard-train-next').getByRole('link', { name: 'Fesselung trainieren' }).click();
    await expect(page).toHaveURL(/\/puzzles\/themes\/pin$/);

    // Every area is one click away from the tiles.
    await goHome(page);
    await page.getByTestId('dashboard-puzzle-rating').click();
    await expect(page).toHaveURL(/\/puzzles\/rated$/);
    await goHome(page);
    await page.getByTestId('dashboard-streak').click();
    await expect(page).toHaveURL(/\/profile\/stats$/);
  });

  test('"Weiter, wo du aufgehört hast" resumes a lesson and a running game', async ({ page }) => {
    test.setTimeout(60_000);
    await completeOnboarding(page, 'Clubspieler', 20);
    await expect(page.getByTestId('dashboard-resume')).toContainText('Noch nichts angefangen');

    // Start the next lesson from the dashboard and stop at step 3.
    await page.getByTestId('dashboard-next-lesson').getByRole('link', { name: /Lektion starten/ }).click();
    const player = visible(page.getByTestId('lesson-player'));
    await expect(player).toHaveAttribute('data-step-index', '0', { timeout: 10_000 });
    await page.getByTestId('lesson-next').click();
    await expect(player).toHaveAttribute('data-step-index', '1');
    await page.getByTestId('lesson-next').click();
    await expect(player).toHaveAttribute('data-step-index', '2');
    const lessonUrl = page.url();

    await goHome(page);
    const main = page.getByTestId('dashboard-resume-main');
    await expect(main).toHaveAttribute('data-kind', 'lesson');
    await expect(main).toContainText(/Weiter bei Schritt 3 von \d+/);
    await main.getByRole('link', { name: /Lektion fortsetzen/ }).click();
    await expect(page).toHaveURL(lessonUrl);
    await expect(visible(page.getByTestId('lesson-player'))).toHaveAttribute('data-step-index', '2', { timeout: 10_000 });
    await expect(visible(page.getByTestId('resume-notice'))).toContainText('Du machst bei Schritt 3 weiter.');

    // Start a game against Pip, play one move, wait for the reply.
    await page.goto(paths.play());
    await page.getByRole('button', { name: /Pip/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: 'Training' }).click();
    await dialog.getByRole('radio', { name: 'Weiß' }).click();
    await dialog.getByRole('button', { name: 'Partie starten' }).click();
    await expect(board(page)).toBeVisible();
    await clickMove(page, 'e2', 'e4');
    await expect(page.getByTestId('game-status')).toHaveText(/Du bist am Zug/, { timeout: 15_000 });
    const gameUrl = page.url();
    const fen = await readFen(page);
    // Moves are written asynchronously – wait until both are stored before leaving the page with a full load.
    const gameId = decodeURIComponent(gameUrl.split('/').pop()!);
    await expect
      .poll(async () => (await readStore<{ gameId: string }>(page, 'gameMoves')).filter((e) => e.gameId === gameId).length)
      .toBe(2);

    // The running game comes first; the lesson is listed below.
    await page.goto('/');
    await expect(main).toHaveAttribute('data-kind', 'game');
    await expect(main).toContainText('Partie gegen Pip');
    await expect(main).toContainText('2 Halbzüge gespielt');
    await expect(page.getByTestId('dashboard-resume-more').first()).toHaveAttribute('data-kind', 'lesson');
    await main.getByRole('link', { name: /Partie fortsetzen/ }).click();
    await expect(page).toHaveURL(gameUrl);
    await expect(board(page)).toHaveAttribute('data-fen', fen);
  });
});
