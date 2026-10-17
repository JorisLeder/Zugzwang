/**
 * WP-04 e2e: bot list and setup, playing against a real bot (Stockfish worker), assistance levels, coach warning,
 * resignation/result, play from FEN, 360 px layout and keyboard moves. Runs on desktop and mobile.
 * Wave 1 (D-50): the data layer is in memory – flows stay inside one page load (client-side navigation only); the reload
 * and second-page tests are `fixme` until WP-08 is integrated.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import { hasHorizontalScroll } from '../support/app';
import { board, clickMove, pieceOn, readFen, waitForFenChange } from '../support/board';
import { expect, test } from '../support/fixtures';

/** 1.e4 e5 2.? d5 – White's queen on d1 can be hung with Qg4 (Bc8xg4). */
const QUEEN_HANG_FEN = 'rnbqkbnr/ppp2ppp/8/3pp3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';

/** The visible instance of a control that exists twice (phone top bar vs desktop panel header). */
function visibleButton(page: Page, name: string | RegExp) {
  return page.getByRole('button', { name }).filter({ visible: true }).first();
}

/** Chooses a bot on /play, sets level and colour and starts the game. */
async function startFromHub(page: Page, botName: RegExp, level: 'Wettkampf' | 'Training' | 'Coach', color: 'Weiß' | 'Schwarz') {
  await page.goto(paths.play());
  await page.getByRole('button', { name: botName }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: level }).click();
  await dialog.getByRole('radio', { name: color }).click();
  await dialog.getByRole('button', { name: 'Partie starten' }).click();
  await expect(board(page)).toBeVisible();
}

/** Waits until the user is to move (the bot has answered). */
async function waitForUserTurn(page: Page) {
  await expect(page.getByTestId('game-status')).toHaveText(/Du bist am Zug|Schach! Dein König/, { timeout: 15_000 });
}

test.describe('bot list and setup (P0-07)', () => {
  test('≥ 10 bots, five below 800, with avatar, Elo and style; setup offers levels and colours', async ({ page }) => {
    await page.goto(paths.play());
    await expect(page.getByRole('heading', { level: 1, name: 'Spielen' })).toBeVisible();
    const cards = page.locator('[data-bot-id]');
    await expect(cards).toHaveCount(14);
    const beginners = page.locator('section', { has: page.getByRole('heading', { name: 'Zum Einstieg (bis 800)' }) }).locator('[data-bot-id]');
    await expect(beginners).toHaveCount(5);
    // Avatars load (own SVGs).
    const avatar = page.locator('[data-bot-id="pip"] img');
    await expect(avatar).toHaveAttribute('src', '/avatars/bots/pip.svg');
    expect(await avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: /^Kalle, 700 Elo, Fallensteller/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Partie gegen Kalle' });
    await expect(dialog.getByRole('radio', { name: 'Wettkampf' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Training' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Coach' })).toBeVisible();
    await dialog.getByRole('radio', { name: 'Wettkampf' }).click();
    await expect(dialog.getByText('Zählt fürs Bot-Rating: ja')).toBeVisible();
    await dialog.getByRole('radio', { name: 'Training' }).click();
    await expect(dialog.getByText('Zählt fürs Bot-Rating: nein')).toBeVisible();
    for (const c of ['Weiß', 'Zufall', 'Schwarz']) await expect(dialog.getByRole('radio', { name: c })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});

test.describe('playing a game (P0-07, P0-09, criterion 4/6)', () => {
  test('Wettkampf: the bot answers, resigning shows the result with a German reason and leads to the analysis', async ({ page }) => {
    await startFromHub(page, /^Pip, 100 Elo/, 'Wettkampf', 'Weiß');
    await expect(page.getByTestId('game-status')).toHaveText('Du bist am Zug.');
    await expect(page.getByTestId('eval-bar')).toHaveCount(0);
    await expect(visibleButton(page, 'Zurücknehmen')).toHaveCount(0);
    const start = await readFen(page);
    await clickMove(page, 'e2', 'e4');
    await waitForFenChange(page, start);
    await waitForUserTurn(page);
    const fen = await readFen(page);
    expect(fen.split(' ')[1]).toBe('w');
    expect(fen.split(' ')[5]).toBe('2');
    await visibleButton(page, 'Aufgeben').click();
    const confirm = page.getByRole('dialog', { name: 'Partie wirklich aufgeben?' });
    await confirm.getByRole('button', { name: 'Aufgeben' }).click();
    const result = page.getByRole('dialog', { name: 'Verloren' });
    await expect(result.getByTestId('game-result-reason')).toHaveText('Du hast aufgegeben.');
    await expect(result.getByText(/^Bot-Rating \d+/)).toBeVisible();
    await result.getByRole('button', { name: 'Analyse ansehen' }).click();
    await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]+$/);
  });

  test('Training: eval bar, hint (piece, then arrow) and takeback of own move plus reply', async ({ page }) => {
    await startFromHub(page, /^Emil, 400 Elo/, 'Training', 'Weiß');
    await expect(page.getByTestId('eval-bar').filter({ visible: true })).toHaveCount(1);
    const start = await readFen(page);
    await clickMove(page, 'd2', 'd4');
    await waitForFenChange(page, start);
    await waitForUserTurn(page);
    await visibleButton(page, 'Hinweis').click();
    await expect(page.getByTestId('hint-text')).toHaveText(/^Schau dir dein/, { timeout: 10_000 });
    await visibleButton(page, 'Noch ein Hinweis').click();
    await expect(page.getByTestId('hint-text')).toHaveText(/^Der beste Zug ist/);
    await expect(page.locator('[data-arrow-kind="best"]')).toHaveCount(1);
    await visibleButton(page, 'Zurücknehmen').click();
    await expect(board(page)).toHaveAttribute('data-fen', start);
    expect(await pieceOn(page, 'd2')).toBe('wP');
  });

  test('Schwarz: the bot opens with a move from its repertoire', async ({ page }) => {
    await startFromHub(page, /^Frieda, 1200 Elo/, 'Training', 'Schwarz');
    await expect(board(page)).toHaveAttribute('data-orientation', 'black');
    await waitForUserTurn(page);
    // Frieda's white repertoire starts with 1.d4.
    expect(await pieceOn(page, 'd4')).toBe('wP');
  });
});

test.describe('Coach (P0-08, criterion 5)', () => {
  test('warns before hanging the queen, with a reason; "Nochmal überlegen" keeps the position', async ({ page }) => {
    await page.goto(paths.playFromPosition(QUEEN_HANG_FEN));
    await page.getByRole('radio', { name: 'Coach' }).click();
    await page.getByRole('radio', { name: 'Weiß' }).click();
    await page.getByRole('button', { name: 'Partie starten' }).click();
    await expect(board(page)).toBeVisible();
    await expect(page.getByTestId('game-panel')).toHaveAttribute('data-coach-ready', 'true', { timeout: 20_000 });
    await clickMove(page, 'd1', 'g4');
    const warning = page.getByTestId('coach-warning');
    await expect(warning).toBeVisible({ timeout: 10_000 });
    await expect(warning).toContainText('Bist du sicher?');
    // The reason names the moves in German notation (Dg4 / Lxg4 …).
    expect((await warning.innerText()).length).toBeGreaterThan('Bist du sicher?'.length + 5);
    await expect(page.getByRole('button', { name: 'Nochmal überlegen' })).toBeFocused();
    await page.getByRole('button', { name: 'Nochmal überlegen' }).click();
    await expect(warning).toHaveCount(0);
    expect(await readFen(page)).toBe(QUEEN_HANG_FEN);
    expect(await pieceOn(page, 'd1')).toBe('wQ');
    // A good move is played without a warning.
    await clickMove(page, 'g1', 'f3');
    await waitForFenChange(page, QUEEN_HANG_FEN);
    await expect(page.getByTestId('coach-warning')).toHaveCount(0);
  });
});

test.describe('play from position (criterion 8)', () => {
  test('an invalid FEN shows a German error', async ({ page }) => {
    await page.goto(paths.playFromPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1'));
    await expect(page.getByTestId('fen-error')).toHaveText(/^Diese Stellung geht nicht: /);
    await expect(page.getByRole('button', { name: 'Partie starten' })).toHaveCount(0);
  });

  test('a valid FEN can be played against the bot (side to move preselected)', async ({ page }) => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1';
    await page.goto(paths.playFromPosition(''));
    await page.getByLabel('FEN der Stellung').fill(fen);
    await page.getByRole('button', { name: 'Stellung laden' }).click();
    await expect(page.getByText('Schwarz ist am Zug.')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Wettkampf' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Partie starten' }).click();
    await expect(board(page)).toHaveAttribute('data-fen', fen);
    await expect(board(page)).toHaveAttribute('data-orientation', 'black');
    await clickMove(page, 'e8', 'd7');
    await waitForFenChange(page, fen);
    await waitForUserTurn(page);
  });
});

test.describe('360 px and keyboard (criterion 9)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('hub and game screen fit 360 px; moves work with the keyboard', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'keyboard flow runs on the desktop project (360 px viewport set here)');
    await page.goto(paths.play());
    expect(await hasHorizontalScroll(page)).toBe(false);
    await startFromHub(page, /^Lotte, 250 Elo/, 'Coach', 'Weiß');
    expect(await hasHorizontalScroll(page)).toBe(false);
    const start = await readFen(page);
    const b = board(page);
    await b.focus();
    await page.keyboard.press('ArrowUp'); // e1 → e2
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await waitForFenChange(page, start);
    expect(await pieceOn(page, 'e4')).toBe('wP');
    await waitForUserTurn(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});

test.describe('resume and two devices (P0-09, criterion 7)', () => {
  test('a reload resumes the game at the same move', async ({ page }) => {
    test.fixme(true, 'needs WP-08 persistence – enabled in the integration round');
    await startFromHub(page, /^Pip, 100 Elo/, 'Training', 'Weiß');
    const start = await readFen(page);
    await clickMove(page, 'e2', 'e4');
    await waitForFenChange(page, start);
    await waitForUserTurn(page);
    const fen = await readFen(page);
    await page.reload();
    await expect(board(page)).toHaveAttribute('data-fen', fen);
  });

  test('a second page asks to take over; the first one becomes read-only', async ({ page, context }) => {
    test.fixme(true, 'needs WP-08 persistence – enabled in the integration round');
    await startFromHub(page, /^Pip, 100 Elo/, 'Training', 'Weiß');
    const url = page.url();
    const second = await context.newPage();
    await second.goto(url);
    const dialog = second.getByRole('dialog', { name: 'Partie läuft auf einem anderen Gerät – hier übernehmen?' });
    await dialog.getByRole('button', { name: 'Hier übernehmen' }).click();
    await expect(page.getByText('Du spielst diese Partie jetzt auf einem anderen Gerät weiter.', { exact: false })).toBeVisible();
    await expect(board(page)).toHaveAttribute('data-fen', await readFen(second));
  });
});
