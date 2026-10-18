/**
 * WP-09 e2e – P0-16 (AC6): every route is usable at 360, 390, 768, 1440 and 2560 px without horizontal scrolling.
 * One test per route; the page is loaded once and then resized through the widths. The desktop project checks all
 * widths, the mobile project (touch, DPR 3) the two phone widths.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { START_FEN } from '../../src/core/chess';
import { hasHorizontalScroll } from '../support/app';
import { expect, test } from '../support/fixtures';
import { completeOnboarding, rating, seed, todayKey } from './helpers';

const WIDTHS = [360, 390, 768, 1440, 2560];
const PHONE_WIDTHS = [360, 390];

const ROUTES: string[] = [
  paths.onboarding(),
  paths.login(),
  paths.puzzles(),
  paths.puzzlesRated(),
  paths.puzzlesLearn(),
  paths.puzzleThemes(),
  paths.puzzleTheme('fork'),
  paths.puzzlesDemo(),
  paths.play(),
  paths.playGame('responsive-game'),
  paths.playFromPosition(START_FEN),
  paths.learn(),
  paths.course('brett-und-figuren'),
  paths.lesson('brett-und-figuren', 'brett-und-feldnamen'),
  paths.analysis(),
  paths.analysisImport(),
  paths.analysisBoard({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *' }),
  paths.analysisGame('responsive-game'),
  paths.profile(),
  paths.stats(),
  paths.settings(),
];

async function checkWidths(page: Page, widths: number[]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 2560 ? 1440 : 900 });
    await expect.poll(() => hasHorizontalScroll(page), { message: `horizontal scroll at ${width} px on ${page.url()}` }).toBe(false);
    await expect(page.locator('h1').first()).toBeVisible();
  }
}

test.describe('all routes without horizontal scroll (AC6)', () => {
  test('dashboard with data', async ({ page }, testInfo) => {
    await completeOnboarding(page, 'Clubspieler');
    await seed(page, {
      ratings: [rating('puzzle', 1234, 6), rating('bot', 1105, 3)],
      dailyActivity: [{ date: await todayKey(page), minutes: 25, puzzles: 6, games: 1, lessons: 2, goalReached: true }],
      themeStats: [{ theme: 'discoveredAttack', attempts: 9, successes: 2 }],
    });
    await expect(page.getByTestId('dashboard-train-text')).toBeVisible();
    await checkWidths(page, testInfo.project.name === 'mobile' ? PHONE_WIDTHS : WIDTHS);
  });

  for (const route of ROUTES) {
    test(`route ${route}`, async ({ page }, testInfo) => {
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
      await checkWidths(page, testInfo.project.name === 'mobile' ? PHONE_WIDTHS : WIDTHS);
    });
  }
});
