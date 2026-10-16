/**
 * Board helpers using the selector contract of `@/ui/board` (BACKLOG 2.5):
 * `[data-testid=board]` (with `data-fen`, `data-orientation`), `[data-square=e4]`, `[data-piece=wP]`,
 * `[data-testid=promotion-q|r|b|n]`. Frozen (WP-00).
 */
import { expect, type Locator, type Page } from '@playwright/test';

type Promotion = 'q' | 'r' | 'b' | 'n';

/** The board root (first board on the page unless `index` is given). */
export function board(page: Page, index = 0): Locator {
  return page.getByTestId('board').nth(index);
}

/** One square of the board. */
export function square(page: Page, sq: string, index = 0): Locator {
  return board(page, index).locator(`[data-square="${sq}"]`);
}

/** Current FEN shown by the board. */
export async function readFen(page: Page, index = 0): Promise<string> {
  const fen = await board(page, index).getAttribute('data-fen');
  if (!fen) throw new Error('board has no data-fen');
  return fen;
}

/** Waits until the board shows a different FEN than `previous`; returns the new FEN. */
export async function waitForFenChange(page: Page, previous: string, index = 0): Promise<string> {
  await expect(board(page, index)).not.toHaveAttribute('data-fen', previous);
  return readFen(page, index);
}

async function choosePromotion(page: Page, promotion?: Promotion): Promise<void> {
  if (promotion) await page.getByTestId(`promotion-${promotion}`).click();
}

/** Moves by clicking the origin and then the target square (tap on touch projects). */
export async function clickMove(page: Page, from: string, to: string, promotion?: Promotion, index = 0): Promise<void> {
  const hasTouch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  for (const sq of [from, to]) {
    const target = square(page, sq, index);
    if (hasTouch) await target.tap();
    else await target.click();
  }
  await choosePromotion(page, promotion);
}

/** Moves by dragging the piece with the mouse (pointer events, works on both projects). */
export async function dragMove(page: Page, from: string, to: string, promotion?: Promotion, index = 0): Promise<void> {
  const a = await square(page, from, index).boundingBox();
  const b = await square(page, to, index).boundingBox();
  if (!a || !b) throw new Error(`squares ${from}/${to} not visible`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 4, a.y + a.height / 2 + 4, { steps: 2 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  // dnd-kit swallows the click that immediately follows a drop (capture listener removed on the next tick);
  // give it time before the next click (e.g. on a promotion button).
  await page.waitForTimeout(100);
  await choosePromotion(page, promotion);
}

/** Piece code (`wP`, `bK` …) on a square, or `null`. */
export async function pieceOn(page: Page, sq: string, index = 0): Promise<string | null> {
  const piece = square(page, sq, index).locator('[data-piece]');
  if ((await piece.count()) === 0) return null;
  return piece.first().getAttribute('data-piece');
}
