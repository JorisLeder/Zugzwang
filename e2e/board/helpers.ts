/**
 * Helpers for the board/Analysebrett e2e tests (WP-01). The generic board helpers live in `e2e/support/board.ts`.
 */
import type { Locator, Page } from '@playwright/test';
import { board, square } from '../support/board';

/** Highlight tokens of a square (`data-highlights` on the inner square element). */
export async function highlights(page: Page, sq: string): Promise<string[]> {
  const value = await square(page, sq).locator('[role="button"]').first().getAttribute('data-highlights');
  return (value ?? '').split(' ').filter(Boolean);
}

/** Client-side navigation (keeps the in-memory wave-1 data layer and settings, D-50). */
export async function navigateInApp(page: Page, url: string): Promise<void> {
  await page.evaluate((u) => {
    window.history.pushState({}, '', u);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

/** The visible instance of a control that exists twice (phone top bar vs desktop panel header). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** Right-drag from one square to another (desktop arrows). */
export async function rightDrag(page: Page, from: string, to: string, modifiers: Array<'Shift' | 'Alt' | 'Control'> = []): Promise<void> {
  const a = await square(page, from).boundingBox();
  const b = await square(page, to).boundingBox();
  if (!a || !b) throw new Error('squares not visible');
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  for (const m of modifiers) await page.keyboard.up(m);
}

/** Right click on a square (desktop marks). */
export async function rightClick(page: Page, sq: string, modifiers: Array<'Shift' | 'Alt' | 'Control'> = []): Promise<void> {
  await square(page, sq).click({ button: 'right', modifiers });
}

/** Installs a counter of synthesised sounds (oscillators started) before the app loads. */
export async function countSounds(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __zzSounds: number; AudioContext: typeof AudioContext };
    w.__zzSounds = 0;
    const Original = w.AudioContext;
    if (!Original) return;
    w.AudioContext = class extends Original {
      override createOscillator(): OscillatorNode {
        w.__zzSounds += 1;
        return super.createOscillator();
      }
    };
  });
}

/** Number of oscillators started so far (see `countSounds`). */
export function soundCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __zzSounds: number }).__zzSounds);
}

export { board, square };
