/**
 * WP-09 e2e – settings (AC4): every setting applies immediately and survives a reload (persisted in the profile);
 * the notation switch changes the letters of the move list.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { board, clickMove, square } from '../support/board';
import { expect, test } from '../support/fixtures';
import { navigateInApp, storedProfile, visible } from './helpers';

const PGN = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Qe7 *';

async function openSettings(page: Page) {
  await page.goto(paths.settings());
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
}

function toggle(page: Page, group: string, option: string) {
  return page.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name: option, exact: true });
}

async function moveListTexts(page: Page): Promise<string[]> {
  await visible(page.getByRole('tab', { name: 'Züge' })).click();
  return visible(page.getByRole('list', { name: 'Zugliste' })).getByRole('button').allTextContents();
}

test.describe('settings (AC4)', () => {
  test('design, board design, switches and daily goal apply immediately and survive a reload', async ({ page }) => {
    await openSettings(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radiogroup', { name: 'Design', exact: true }).getByRole('radio')).toHaveText(['Dunkel', 'Hell']);

    await toggle(page, 'Design', 'Hell').click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await toggle(page, 'Brettdesign', 'Holz').click();
    await expect(html).toHaveAttribute('data-board', 'holz');
    const switches = ['Koordinaten anzeigen', 'Mögliche Züge anzeigen', 'Töne', 'Animationen', 'Zugbestätigung'];
    for (const name of switches) await page.getByRole('switch', { name }).click();
    await toggle(page, 'Tagesziel (Minuten)', '60 Min.').click();
    await expect(toggle(page, 'Sprache', 'Englisch (in Vorbereitung)')).toBeDisabled();

    await expect.poll(async () => (await storedProfile(page))?.dailyGoalMinutes).toBe(60);
    await expect
      .poll(async () => (await storedProfile(page))?.settings)
      .toMatchObject({ theme: 'light', boardTheme: 'holz', showCoordinates: false, showLegalMoves: false, sound: false, animations: false, moveConfirmation: true });

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(html).toHaveAttribute('data-board', 'holz');
    await expect(toggle(page, 'Design', 'Hell')).toHaveAttribute('aria-checked', 'true');
    await expect(toggle(page, 'Brettdesign', 'Holz')).toHaveAttribute('aria-checked', 'true');
    for (const name of switches.slice(0, 4)) await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: 'Zugbestätigung' })).toHaveAttribute('aria-checked', 'true');
    await expect(toggle(page, 'Tagesziel (Minuten)', '60 Min.')).toHaveAttribute('aria-checked', 'true');

    // The board follows: no coordinates, no legal-move dots.
    await navigateInApp(page, paths.analysisBoard());
    await expect(board(page)).toBeVisible();
    await expect(square(page, 'a1')).not.toContainText('a');
    await square(page, 'g1').click();
    await expect(square(page, 'g1').locator('[data-highlights~="selected"]')).toHaveCount(1);
    await expect(square(page, 'f3').locator('[data-highlights~="move-target"]')).toHaveCount(0);
  });

  test('coordinates and legal-move dots show by default', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await expect(square(page, 'a1')).toContainText('a');
    await square(page, 'g1').click();
    await expect(square(page, 'f3').locator('[data-highlights~="move-target"]')).toHaveCount(1);
  });

  test('the notation switch changes the letters of the move list and the example', async ({ page }) => {
    await page.goto(paths.analysisBoard({ pgn: PGN }));
    await expect.poll(() => moveListTexts(page)).toEqual(['e4', 'e5', 'Sf3', 'Sc6', 'Lc4', 'Lc5', '0-0', 'De7']);

    await navigateInApp(page, paths.settings());
    const example = page.getByTestId('settings-notation-example');
    await expect(example).toContainText('2. Sf3 Sc6 3. Lb5');
    await toggle(page, 'Notation', 'Englisch (K Q R B N)').click();
    await expect(example).toContainText('2. Nf3 Nc6 3. Bb5');

    await navigateInApp(page, paths.analysisBoard({ pgn: PGN }));
    await expect.poll(() => moveListTexts(page)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Qe7']);
    await page.reload();
    await expect.poll(() => moveListTexts(page)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Qe7']);
  });

  test('move confirmation asks before a move is played in a game', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('switch', { name: 'Zugbestätigung' }).click();
    await expect.poll(async () => (await storedProfile(page))?.settings.moveConfirmation).toBe(true);
    await navigateInApp(page, paths.play());
    await page.getByRole('button', { name: /Pip/ }).click();
    const setup = page.getByRole('dialog');
    await setup.getByRole('radio', { name: 'Training' }).click();
    await setup.getByRole('radio', { name: 'Weiß' }).click();
    await setup.getByRole('button', { name: 'Partie starten' }).click();
    await expect(board(page)).toBeVisible();
    await clickMove(page, 'e2', 'e4');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
