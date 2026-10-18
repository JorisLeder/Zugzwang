/**
 * Core journey 2 – Tägliche Einheit (PRD Kern-Abläufe 2): start page → 10 rated puzzles (solutions read from the
 * bank JSON) → continue yesterday's lesson → daily goal reached. The app has no separate daily puzzle (Tagespuzzle)
 * yet, so the session starts with the rated puzzles. Active minutes are counted in real time (60 s per minute);
 * the browser clock is a Playwright fake clock that flows normally and is advanced to simulate the rest of the
 * session. Fails on any console error.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { completeOnboarding } from '../support/app';
import { expect, test } from '../support/fixtures';
import { currentPuzzle, panel, solve } from '../puzzles/helpers';
import { readStore, todayKey } from '../dashboard/helpers';
import { expectDashboard, lessonContent, nav, nextButton, player, walkLesson } from './helpers';

const GOAL = 10;
const LESSON = lessonContent('brett-und-figuren', 'brett-und-feldnamen');
/** Day 1 (onboarding, lesson started) and day 2 (the daily session), 10:00 in Berlin. */
const DAY_1 = new Date('2026-06-15T08:00:00Z');
const DAY_2 = new Date('2026-06-16T08:00:00Z');

/** Active minutes stored for today. */
async function minutesToday(page: Page): Promise<number> {
  const today = await todayKey(page);
  const rows = await readStore<{ date: string; minutes: number }>(page, 'dailyActivity');
  return rows.find((r) => r.date === today)?.minutes ?? 0;
}

test.describe('Kern-Ablauf 2: Tägliche Einheit', () => {
  // Desktop journey (1440×900); the phone runs of the journeys follow separately.
  test.skip(({ isMobile }) => isMobile, 'desktop journey');

  test('start page → 10 rated puzzles → continue the lesson → daily goal reached', async ({ page }) => {
    test.setTimeout(240_000);
    await page.clock.install({ time: DAY_1 });

    // Day 1: onboarding, first lesson started and left at step 3.
    await completeOnboarding(page, 'Neuling', GOAL);
    await page.getByTestId('dashboard-next-lesson').getByRole('link', { name: /Lektion starten/ }).click();
    await walkLesson(page, LESSON, 0, 2);
    await expect(player(page)).toHaveAttribute('data-step-index', '2');
    await nav(page, 'Start');
    await expectDashboard(page);

    // Day 2: the start page offers the lesson to continue and an empty daily goal.
    await page.clock.setSystemTime(DAY_2);
    await page.goto(paths.home());
    await expectDashboard(page);
    await expect(page.getByTestId('dashboard-daily-goal-value')).toHaveAttribute('data-minutes', '0');
    await expect(page.getByTestId('dashboard-daily-goal')).toContainText(`Noch ${GOAL} Min.`);
    const resume = page.getByTestId('dashboard-resume-main');
    await expect(resume).toHaveAttribute('data-kind', 'lesson');
    await expect(resume).toContainText(`Weiter bei Schritt 3 von ${LESSON.steps.length}`);
    const startRating = Number(await page.getByTestId('dashboard-puzzle-rating-value').innerText());

    // 10 rated puzzles, every one solved with the line from the bank.
    await page.getByTestId('dashboard-puzzle-rating').click();
    await expect(page).toHaveURL(/\/puzzles\/rated$/);
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const p = await currentPuzzle(page);
      expect(seen.has(p.id)).toBe(false);
      seen.add(p.id);
      await solve(page, p);
      await expect(page.getByTestId('puzzle-status')).toHaveText('Gelöst!');
      await expect(page.getByTestId('rating-result')).toContainText('+');
      if (i < 9) {
        await page.getByTestId('next-puzzle').click();
        await expect(panel(page)).not.toHaveAttribute('data-puzzle-id', p.id);
      }
    }

    // Back on the start page: 10 rated puzzles and a higher rating.
    await nav(page, 'Start');
    await expectDashboard(page);
    await expect(page.getByTestId('dashboard-puzzle-rating')).toContainText('10 bewertete Puzzles');
    expect(Number((await page.getByTestId('dashboard-puzzle-rating-value').innerText()).replace('.', ''))).toBeGreaterThan(startRating);

    // Continue the lesson at step 3 and finish it.
    await resume.getByRole('link', { name: /Lektion fortsetzen/ }).click();
    await expect(page).toHaveURL(paths.lesson('brett-und-figuren', LESSON.id));
    await expect(player(page)).toHaveAttribute('data-step-index', '2', { timeout: 10_000 });
    await walkLesson(page, LESSON, 2);
    await expect(page.getByTestId('lesson-end').filter({ visible: true })).toHaveAttribute('data-stars', '3');
    await expect(nextButton(page)).toHaveCount(0);

    // The rest of the 10 active minutes: keep interacting while the clock runs on (55 s per step, idle limit 60 s).
    for (let i = 0; i < 30 && (await minutesToday(page)) < GOAL; i++) {
      await page.keyboard.press('Shift');
      await page.clock.runFor(55_000);
    }
    expect(await minutesToday(page)).toBeGreaterThanOrEqual(GOAL);

    // The start page shows the reached daily goal.
    await nav(page, 'Start');
    await expectDashboard(page);
    await expect(page.getByTestId('dashboard-daily-goal')).toContainText('Geschafft! Tagesziel erreicht.');
    const minutes = Number(await page.getByTestId('dashboard-daily-goal-value').getAttribute('data-minutes'));
    expect(minutes).toBeGreaterThanOrEqual(GOAL);
    await expect(page.getByRole('progressbar', { name: `Tagesziel: ${minutes} von ${GOAL} Minuten` })).toBeVisible();
    await expect(page.getByTestId('dashboard-streak-value')).toHaveAttribute('data-trained-today', 'true');
  });
});
