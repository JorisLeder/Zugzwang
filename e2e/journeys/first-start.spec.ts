/**
 * Core journey 1 – Erster Start (PRD Kern-Abläufe 1): a fresh app (local mode, no login) → self-assessment and daily
 * goal → start page with the first course, a fitting bot and a puzzle start rating that matches the
 * self-assessment; each of the three is one click away and leads to the right place. Fails on any console error.
 */
import { recommendBot } from '../../src/bots/recommend';
import { SELF_ASSESSMENT_OPTIONS } from '../../src/core/profile';
import { freshStart } from '../support/app';
import { expect, test } from '../support/fixtures';
import { expectDashboard, nav, visible } from './helpers';

test.describe('Kern-Ablauf 1: Erster Start', () => {
  test('onboarding → dashboard with first course, fitting bot and start rating; every item leads on', async ({ page }) => {
    test.setTimeout(60_000);
    const neuling = SELF_ASSESSMENT_OPTIONS.find((o) => o.id === 'newcomer')!;
    const bot = recommendBot(neuling.botRating);

    // A fresh app opens the onboarding instead of the start page.
    await freshStart(page, '/');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei Zugzwang' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Los geht’s' })).toBeVisible();
    for (const o of SELF_ASSESSMENT_OPTIONS) await expect(page.getByRole('radio', { name: new RegExp(`^${o.labelDe}`) })).toBeVisible();
    await page.getByRole('radio', { name: /^Neuling/ }).click();
    await page.getByRole('radiogroup', { name: 'Tagesziel in Minuten' }).getByRole('radio', { name: '10', exact: true }).click();
    await page.getByRole('button', { name: 'Los geht’s' }).click();

    // Start page: first course, fitting bot, start rating from the self-assessment, daily goal.
    await expectDashboard(page);
    await expect(page.getByTestId('dashboard-next-lesson-course')).toHaveText('Brett und Figuren');
    await expect(page.getByTestId('dashboard-next-lesson-title')).toHaveText('Brett und Feldnamen');
    await expect(page.getByTestId('dashboard-bot-name')).toHaveText(bot.name);
    await expect(page.getByTestId('dashboard-puzzle-rating-value')).toHaveText(String(neuling.puzzleRating));
    await expect(page.getByTestId('dashboard-puzzle-rating')).toContainText('Startwert nach deiner Selbsteinschätzung');
    await expect(page.getByTestId('dashboard-daily-goal-value')).toHaveAttribute('data-goal', '10');
    await expect(page.getByTestId('dashboard-resume')).toContainText('Noch nichts angefangen');

    // The onboarding is done: a reload stays on the start page.
    await page.reload();
    await expectDashboard(page);

    // First course → the lesson player of its first lesson.
    await page.getByTestId('dashboard-next-lesson').getByRole('link', { name: /Lektion starten/ }).click();
    await expect(page).toHaveURL(/\/learn\/brett-und-figuren\/brett-und-feldnamen$/);
    await expect(visible(page.getByTestId('lesson-player'))).toHaveAttribute('data-step-index', '0', { timeout: 10_000 });

    // Fitting bot → bot list with this bot marked "Passt zu dir"; its setup opens with one click.
    await nav(page, 'Start');
    await expectDashboard(page);
    await page.getByTestId('dashboard-bot').getByRole('link', { name: new RegExp(bot.name) }).click();
    await expect(page).toHaveURL(/\/play$/);
    const card = page.locator(`[data-bot-id="${bot.id}"]`);
    await expect(card).toContainText('Passt zu dir');
    await card.click();
    await expect(page.getByRole('dialog', { name: `Partie gegen ${bot.name}` })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Start rating → rated puzzles with that rating (no second self-assessment).
    await nav(page, 'Start');
    await expectDashboard(page);
    await page.getByTestId('dashboard-puzzle-rating').click();
    await expect(page).toHaveURL(/\/puzzles\/rated$/);
    await expect(page.getByTestId('rating-chip')).toHaveText(`Dein Rating ${neuling.puzzleRating}`, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Wie gut spielst du schon?' })).toHaveCount(0);
    await expect(page.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'user', { timeout: 10_000 });
  });
});
