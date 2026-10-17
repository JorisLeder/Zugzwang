/**
 * Helpers for the lesson e2e tests (WP-06). Every flow uses only the fixture course `fixture-course` (D-52), which the
 * loader adds in e2e builds – content in `content/lessons/` may change in parallel. Wave 1 (D-50): the data layer is
 * in memory, so a flow stays inside one page load (client-side navigation only).
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { board } from '../support/board';

export const COURSE = 'fixture-course';

/** The visible instance of an element that exists twice (phone vs desktop header). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** The lesson player region. */
export function player(page: Page): Locator {
  return visible(page.getByTestId('lesson-player'));
}

/** Waits until the player shows step `index` of the given type. */
export async function expectStep(page: Page, type: string, index: number): Promise<void> {
  await expect(player(page)).toHaveAttribute('data-step-index', String(index), { timeout: 10_000 });
  await expect(visible(page.getByTestId('lesson-step'))).toHaveAttribute('data-step-type', type);
}

/** "Weiter" in the action bar. */
export function nextButton(page: Page): Locator {
  return page.getByTestId('lesson-next');
}

/** Passes the fixture skip test (two quiz questions) from the Lernpfad and returns to the Lernpfad. */
export async function passSkipTest(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Einstufungstest starten' }).click();
  await expectStep(page, 'quiz', 0);
  await page.getByRole('button', { name: 'Schachmatt', exact: true }).click();
  await nextButton(page).click();
  await expectStep(page, 'quiz', 1);
  await page.getByRole('button', { name: /Er wird in eine Dame, einen Turm/ }).click();
  await nextButton(page).click();
  await expect(page.getByTestId('lesson-end')).toHaveAttribute('data-passed', 'true');
  await page.getByTestId('lesson-primary').click();
  await expect(page.locator('[data-stage-id="1"]')).not.toHaveAttribute('data-status', 'locked');
}

const FILES = 'abcdefgh';

/** Current keyboard cursor square of the board. */
async function cursor(page: Page): Promise<string> {
  const sq = await page.getByTestId('board-cursor').getAttribute('data-square-cursor');
  if (!sq) throw new Error('board has no cursor');
  return sq;
}

/** Moves the board's keyboard cursor to `target` (white at the bottom). */
async function cursorTo(page: Page, target: string): Promise<void> {
  const from = await cursor(page);
  const dx = FILES.indexOf(target[0]!) - FILES.indexOf(from[0]!);
  const dy = Number(target[1]) - Number(from[1]);
  for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? 'ArrowUp' : 'ArrowDown');
  await expect(page.getByTestId('board-cursor')).toHaveAttribute('data-square-cursor', target);
}

/** Plays a move with the keyboard only (board focus, cursor keys, Enter). */
export async function keyboardMove(page: Page, from: string, to: string): Promise<void> {
  await board(page).focus();
  await cursorTo(page, from);
  await page.keyboard.press('Enter');
  await cursorTo(page, to);
  await page.keyboard.press('Enter');
}
