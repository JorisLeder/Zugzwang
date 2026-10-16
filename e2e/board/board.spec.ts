/**
 * WP-01 board e2e (acceptance criteria 1–9) on the Analysebrett page, desktop (1440×900) and mobile (390×844, touch).
 */
import { START_FEN } from '../../src/core/chess';
import { paths } from '../../src/app/paths';
import { hasHorizontalScroll } from '../support/app';
import { board, clickMove, dragMove, pieceOn, readFen, square, waitForFenChange } from '../support/board';
import { expect, test } from '../support/fixtures';
import { countSounds, highlights, navigateInApp, rightClick, rightDrag, soundCount, visible } from './helpers';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

test.describe('AC1 moves: drag-and-drop, click-click and touch – only legal moves', () => {
  test('click/tap moves accept only legal moves', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await clickMove(page, 'g1', 'g3'); // illegal knight move
    expect(await readFen(page)).toBe(START_FEN);
    await clickMove(page, 'e7', 'e5'); // not White's turn
    expect(await readFen(page)).toBe(START_FEN);
    await clickMove(page, 'e2', 'e4');
    await waitForFenChange(page, START_FEN);
    expect(await readFen(page)).toBe(AFTER_E4);
    await clickMove(page, 'g8', 'f6');
    await waitForFenChange(page, AFTER_E4);
    expect(await pieceOn(page, 'f6')).toBe('bN');
  });

  test('drag-and-drop moves; illegal drops snap back; legal targets are shown while dragging', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await dragMove(page, 'b1', 'b3');
    expect(await readFen(page)).toBe(START_FEN);
    expect(await pieceOn(page, 'b1')).toBe('wN');
    await dragMove(page, 'b1', 'c3');
    await waitForFenChange(page, START_FEN);
    expect(await pieceOn(page, 'c3')).toBe('wN');
    expect(await pieceOn(page, 'b1')).toBeNull();
  });

  test('the selected piece shows its legal targets', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await square(page, 'g1').click();
    expect(await highlights(page, 'g1')).toContain('selected');
    expect(await highlights(page, 'f3')).toContain('move-target');
    expect(await highlights(page, 'h3')).toContain('move-target');
    expect(await highlights(page, 'e2')).not.toContain('move-target');
  });
});

test.describe('AC2 promotion', () => {
  for (const piece of ['q', 'r', 'b', 'n'] as const) {
    test(`Black promotes to ${piece} (no auto-queen)`, async ({ page }) => {
      const start = '7K/8/8/8/8/8/p7/7k b - - 0 1';
      await page.goto(paths.analysisBoard({ fen: start }));
      await clickMove(page, 'a2', 'a1');
      for (const p of ['q', 'r', 'b', 'n']) await expect(page.getByTestId(`promotion-${p}`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Dame' })).toBeFocused();
      await page.getByTestId(`promotion-${piece}`).click();
      await waitForFenChange(page, start);
      expect(await pieceOn(page, 'a1')).toBe(`b${piece.toUpperCase()}`);
    });
  }

  test('cancel restores the pawn (click outside), then White promotes to a rook', async ({ page }) => {
    const start = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    await page.goto(paths.analysisBoard({ fen: start }));
    await clickMove(page, 'a7', 'a8');
    const picker = page.getByTestId('promotion-picker');
    await expect(picker).toBeVisible();
    const box = (await picker.boundingBox())!;
    await page.mouse.click(box.x + box.width - 10, box.y + box.height - 10);
    await expect(picker).toBeHidden();
    expect(await pieceOn(page, 'a7')).toBe('wP');
    expect(await readFen(page)).toBe(start);
    await clickMove(page, 'a7', 'a8', 'r');
    await waitForFenChange(page, start);
    expect(await pieceOn(page, 'a8')).toBe('wR');
  });
});

test.describe('AC3 castling and en passant (chess.js)', () => {
  test('castling on both sides, also by dropping the king on its rook', async ({ page }) => {
    const start = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    await page.goto(paths.analysisBoard({ fen: start }));
    await clickMove(page, 'e1', 'g1');
    const afterWhite = await waitForFenChange(page, start);
    expect(await pieceOn(page, 'g1')).toBe('wK');
    expect(await pieceOn(page, 'f1')).toBe('wR');
    await dragMove(page, 'e8', 'a8'); // king onto its own rook = long castling
    await waitForFenChange(page, afterWhite);
    expect(await pieceOn(page, 'c8')).toBe('bK');
    expect(await pieceOn(page, 'd8')).toBe('bR');
  });

  test('no castling out of check or through an attacked square', async ({ page }) => {
    const inCheck = '4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    await page.goto(paths.analysisBoard({ fen: inCheck }));
    expect(await highlights(page, 'e1')).toContain('check');
    await clickMove(page, 'e1', 'g1');
    await clickMove(page, 'e1', 'c1');
    expect(await readFen(page)).toBe(inCheck);

    const attacked = '5rk1/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    await page.goto(paths.analysisBoard({ fen: attacked }));
    await clickMove(page, 'e1', 'g1'); // f1 is attacked by the rook on f8
    expect(await readFen(page)).toBe(attacked);
    await clickMove(page, 'e1', 'c1');
    await waitForFenChange(page, attacked);
    expect(await pieceOn(page, 'c1')).toBe('wK');
    expect(await pieceOn(page, 'd1')).toBe('wR');
  });

  test('en passant only on the immediately following move', async ({ page }) => {
    const start = 'rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
    await page.goto(paths.analysisBoard({ fen: start }));
    await clickMove(page, 'd7', 'd5');
    const afterD5 = await waitForFenChange(page, start);
    await clickMove(page, 'e5', 'd6');
    await waitForFenChange(page, afterD5);
    expect(await pieceOn(page, 'd6')).toBe('wP');
    expect(await pieceOn(page, 'd5')).toBeNull();

    await page.goto(paths.analysisBoard({ fen: start }));
    await clickMove(page, 'd7', 'd5');
    let fen = await waitForFenChange(page, start);
    await clickMove(page, 'h2', 'h3');
    fen = await waitForFenChange(page, fen);
    await clickMove(page, 'h7', 'h6');
    fen = await waitForFenChange(page, fen);
    await clickMove(page, 'e5', 'd6'); // too late
    expect(await readFen(page)).toBe(fen);
    expect(await pieceOn(page, 'd5')).toBe('bP');
  });
});

test.describe('AC4 arrows and marks', () => {
  test('right-drag arrows and right-click marks in four colours; left click clears', async ({ page, isMobile }) => {
    test.skip(isMobile, 'right mouse button only on desktop (no long-press menus on touch in V1, DESIGN §4.4)');
    await page.goto(paths.analysisBoard());
    await rightDrag(page, 'e2', 'e4');
    const arrow = board(page).locator('[data-arrow="e2-e4"]');
    await expect(arrow).toHaveAttribute('data-arrow-source', 'user');
    await expect(arrow).toHaveAttribute('data-arrow-kind', 'default');
    await rightDrag(page, 'g1', 'f3', ['Shift']);
    await expect(board(page).locator('[data-arrow="g1-f3"]')).toHaveAttribute('data-arrow-kind', 'green');
    await rightClick(page, 'd4');
    await rightClick(page, 'd5', ['Shift']);
    await rightClick(page, 'c4', ['Alt']);
    await rightClick(page, 'c5', ['Control']);
    expect(await highlights(page, 'd4')).toContain('user-mark-default');
    expect(await highlights(page, 'd5')).toContain('user-mark-green');
    expect(await highlights(page, 'c4')).toContain('user-mark-blue');
    expect(await highlights(page, 'c5')).toContain('user-mark-yellow');
    // Arrows are filled with the token colours (computed, so the board tokens resolve).
    const fill = await arrow.evaluate((el) => getComputedStyle(el).fill);
    expect(fill).toBe('rgba(242, 163, 58, 0.85)');
    // Right click on a marked square removes the mark; a left click clears everything.
    await rightClick(page, 'd4');
    expect(await highlights(page, 'd4')).not.toContain('user-mark-default');
    await square(page, 'a3').click();
    await expect(board(page).locator('[data-arrow-source="user"]')).toHaveCount(0);
    expect(await highlights(page, 'd5')).toEqual([]);
    expect(await readFen(page)).toBe(START_FEN);
  });
});

test.describe('AC5 flip, coordinates, last move and check highlight', () => {
  test('flip turns board and coordinates; last move and check are highlighted', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    await expect(square(page, 'a1')).toContainText('a');
    await expect(square(page, 'a1')).toContainText('1');
    await visible(page.getByRole('button', { name: 'Brett drehen' })).click();
    await expect(board(page)).toHaveAttribute('data-orientation', 'black');
    // Black at the bottom: files are written on rank 8, ranks on the h-file.
    await expect(square(page, 'h8')).toContainText('h');
    await expect(square(page, 'h1')).toContainText('1');
    const h1 = (await square(page, 'h1').boundingBox())!;
    const a8 = (await square(page, 'a8').boundingBox())!;
    expect(h1.y).toBeLessThan(a8.y);
    // Fool's mate: last move and the mated king are highlighted.
    await clickMove(page, 'f2', 'f3');
    await clickMove(page, 'e7', 'e5');
    await clickMove(page, 'g2', 'g4');
    await clickMove(page, 'd8', 'h4');
    await expect(page.getByTestId('position-status')).toContainText('Schachmatt – Schwarz gewinnt');
    expect(await highlights(page, 'd8')).toContain('last-move');
    expect(await highlights(page, 'h4')).toContain('last-move');
    expect(await highlights(page, 'e1')).toContain('check');
    // No more moves after mate.
    const fen = await readFen(page);
    await clickMove(page, 'a2', 'a3');
    expect(await readFen(page)).toBe(fen);
  });

  test('board design Holz switches the square colours', async ({ page }) => {
    await page.goto(paths.settings());
    await page.getByRole('radio', { name: 'Holz' }).click();
    await navigateInApp(page, paths.analysisBoard());
    await expect(board(page)).toBeVisible();
    const light = await square(page, 'a8').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(light).toBe('rgb(237, 214, 176)');
  });
});

test.describe('AC6 sounds', () => {
  test('moves play sounds when "Töne" is on and never when it is off', async ({ page }) => {
    await countSounds(page);
    await page.goto(paths.analysisBoard());
    await clickMove(page, 'e2', 'e4');
    await waitForFenChange(page, START_FEN);
    await expect.poll(() => soundCount(page)).toBeGreaterThan(0);
    // Switch the sounds off in the ⋮ menu.
    await visible(page.getByRole('button', { name: 'Weitere Aktionen' })).click();
    const toggle = page.getByRole('menuitemcheckbox', { name: 'Töne' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    const before = await soundCount(page);
    await clickMove(page, 'e7', 'e5');
    await waitForFenChange(page, AFTER_E4);
    await clickMove(page, 'g1', 'f3');
    await page.waitForTimeout(200);
    expect(await soundCount(page)).toBe(before);
    await visible(page.getByRole('button', { name: 'Weitere Aktionen' })).click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Töne' })).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('AC7 sizes', () => {
  test('usable at 360 px without horizontal overflow, squares ≥ 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(paths.analysisBoard());
    await expect(board(page)).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    const b = (await board(page).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(352);
    expect(b.width).toBeLessThanOrEqual(360);
    expect((await square(page, 'e4').boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await clickMove(page, 'e2', 'e4');
    await waitForFenChange(page, START_FEN);
    await visible(page.getByRole('button', { name: 'Stellung aufbauen' })).click();
    await expect(page.getByRole('application', { name: 'Stellungseditor' })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test('usable at 2560 px: board capped at 960 px, no overflow', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a 2560 px viewport is a desktop size');
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto(paths.analysisBoard());
    const b = (await board(page).boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(960);
    expect(b.width).toBeGreaterThanOrEqual(640);
    expect(b.width % 8).toBe(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await clickMove(page, 'd2', 'd4');
    await waitForFenChange(page, START_FEN);
  });
});

test.describe('AC8 keyboard', () => {
  test('select and move pieces with the keyboard only', async ({ page }) => {
    await page.goto(paths.analysisBoard());
    const b = board(page);
    await expect(b).toHaveAttribute('tabindex', '0');
    await b.focus();
    // Cursor starts on the own king (e1).
    await expect(b).toHaveAttribute('aria-activedescendant', /-sq-e1$/);
    await page.keyboard.press('ArrowUp');
    await expect(b).toHaveAttribute('aria-activedescendant', /-sq-e2$/);
    await expect(page.getByTestId('board-cursor')).toHaveAttribute('data-square-cursor', 'e2');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await waitForFenChange(page, START_FEN);
    expect(await readFen(page)).toBe(AFTER_E4);
    // The move is announced in German.
    await expect(page.getByTestId('board-announcer')).toHaveText('Weiß: Bauer nach e4.');
    // Black replies with the knight g8–f6: cursor from e4 to g8, then to f6.
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight']) await page.keyboard.press(key);
    await expect(page.getByTestId('board-cursor')).toHaveAttribute('data-square-cursor', 'g8');
    await page.keyboard.press('Enter');
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowLeft']) await page.keyboard.press(key);
    await page.keyboard.press('Enter');
    await waitForFenChange(page, AFTER_E4);
    expect(await pieceOn(page, 'f6')).toBe('bN');
    // F flips the board while it has the focus.
    await page.keyboard.press('f');
    await expect(b).toHaveAttribute('data-orientation', 'black');
  });

  test('promotion with the keyboard', async ({ page }) => {
    const start = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    await page.goto(paths.analysisBoard({ fen: start }));
    await board(page).focus();
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowUp'); // a1 → a7
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('promotion-q')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('promotion-b')).toBeFocused();
    await page.keyboard.press('Enter');
    await waitForFenChange(page, start);
    expect(await pieceOn(page, 'a8')).toBe('wB');
    await expect(board(page)).toBeFocused();
  });
});

test.describe('AC9 notation', () => {
  test('move list in German letters by default and English after the setting changes', async ({ page }) => {
    await page.goto(paths.analysisBoard({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Qe7 *' }));
    await page.getByRole('tab', { name: 'Züge' }).click();
    const list = page.getByRole('list', { name: 'Zugliste' });
    await expect(list.getByRole('button')).toHaveText(['e4', 'e5', 'Sf3', 'Sc6', 'Lc4', 'Lc5', '0-0', 'De7']);
    await page.goto(paths.settings());
    await page.getByRole('radio', { name: 'Englisch (K Q R B N)' }).click();
    await navigateInApp(page, paths.analysisBoard({ pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Qe7 *' }));
    await page.getByRole('tab', { name: 'Züge' }).click();
    await expect(page.getByRole('list', { name: 'Zugliste' }).getByRole('button')).toHaveText(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Qe7']);
  });
});
