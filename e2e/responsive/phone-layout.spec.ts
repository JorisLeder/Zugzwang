/**
 * W3-2 phone checks (mobile project: touch, DPR 3) at 360 and 390 px, over every route with real data:
 * - no horizontal scrolling and nothing cut off at the sides;
 * - screens with the shell: the bottom tab bar sits at the bottom edge, has six unobstructed areas of ≥ 44 px and hides
 *   no content when scrolled to the end;
 * - board screens (tab bar gives way to the action bar): every touch target ≥ 44 × 44 px (in every panel tab and in
 *   the ⋮ menu), the action bar hides no panel content, and the "‹" back link leads to a screen with the tab bar.
 * All problems of a width are collected and reported together.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import {
  allRoutes,
  coveredContent,
  elementsOutsideViewport,
  horizontalOverflow,
  isBoardScreen,
  MIN_TARGET,
  openRoute,
  PHONES,
  prepareApp,
  smallTouchTargets,
  tabBarProblems,
  type AppRoute,
} from './helpers';

/** Waits up to ~2 s for the layout to settle without horizontal overflow; returns the remaining overflow. */
async function settledOverflow(page: Page): Promise<number> {
  let overflow = await horizontalOverflow(page);
  for (let i = 0; i < 10 && overflow > 1; i++) {
    await page.waitForTimeout(200);
    overflow = await horizontalOverflow(page);
  }
  return overflow;
}

/** Board screen: touch targets, action bar, back link → tab bar. */
async function boardScreenProblems(page: Page, route: AppRoute): Promise<string[]> {
  const problems: string[] = [];
  if (await page.getByRole('navigation', { name: 'Hauptnavigation' }).filter({ visible: true }).count()) {
    problems.push('tab bar shown on a board screen');
  }
  const targets = async (when: string) => {
    for (const t of await smallTouchTargets(page)) problems.push(`touch target ${t.what} ${t.width}×${t.height} px (< ${MIN_TARGET})${when}`);
  };
  await targets('');
  problems.push(...(await coveredContent(page, '[data-testid="action-bar"]', 'aside[aria-label="Seitenleiste"]')));

  // Every panel tab, and the ⋮ menu of the top bar.
  const tabs = page.locator('aside[aria-label="Seitenleiste"] [role="tab"]').filter({ visible: true });
  for (let i = 0; i < (await tabs.count()); i++) {
    const tab = tabs.nth(i);
    if ((await tab.getAttribute('aria-selected')) === 'true' || (await tab.isDisabled())) continue;
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await targets(` in tab "${(await tab.innerText()).trim()}"`);
    problems.push(...(await coveredContent(page, '[data-testid="action-bar"]', 'aside[aria-label="Seitenleiste"]')));
  }
  const more = page.locator('header').getByRole('button', { name: 'Weitere Aktionen' }).filter({ visible: true });
  if ((await more.count()) === 1) {
    await more.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await targets(' with the ⋮ menu open');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  }

  const back = page.locator('header a[aria-label^="Zurück"]').filter({ visible: true });
  if ((await back.count()) !== 1) return [...problems, 'no "‹" back link in the top bar'];
  const target = await back.getAttribute('href');
  if (target === new URL(page.url()).pathname) return [...problems, `back link points to the screen itself (${target})`];
  const from = new URL(page.url()).pathname;
  await back.click();
  // An unfinished rated puzzle asks before leaving (it then counts as not solved).
  const leave = page.getByRole('dialog', { name: 'Puzzle verlassen?' });
  await expect.poll(async () => new URL(page.url()).pathname !== from || (await leave.isVisible()), { message: `back link of ${route.url}` }).toBe(true);
  if (await leave.isVisible()) {
    for (const t of await smallTouchTargets(page)) problems.push(`touch target ${t.what} ${t.width}×${t.height} px (< ${MIN_TARGET}) with the leave dialog`);
    await leave.getByRole('button', { name: 'Verlassen' }).click();
    await expect.poll(() => new URL(page.url()).pathname, { message: `back link of ${route.url}` }).not.toBe(from);
  }
  // The back link leads to the area hub, where the tab bar is available again (one more step at most).
  const tabBar = page.getByRole('navigation', { name: 'Hauptnavigation' }).filter({ visible: true });
  await expect(tabBar.or(page.locator('header a[aria-label^="Zurück"]').filter({ visible: true })).first()).toBeVisible();
  if ((await tabBar.count()) === 0) problems.push(`no tab bar after the back link (${page.url()})`);
  return problems;
}

test.describe('Handy: alle Routen bei 360 und 390 px', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone checks run in the mobile project');

  for (const phone of PHONES) {
    test(`${phone.width} px: kein horizontales Scrollen, Tab-Leiste erreichbar, Touch-Ziele ≥ 44 px`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize(phone);
      await page.goto('/');
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'touch emulation (pointer: coarse)').toBe(true);
      const data = await prepareApp(page);
      const problems: string[] = [];
      let boardScreens = 0;
      for (const route of allRoutes(data)) {
        await openRoute(page, route);
        const at = (p: string) => `${route.url}: ${p}`;
        const overflow = await settledOverflow(page);
        if (overflow > 1) problems.push(at(`horizontal scroll (${overflow} px)`));
        for (const e of await elementsOutsideViewport(page)) problems.push(at(`cut off at the side: ${e}`));
        if (route.bare) continue;
        if (await isBoardScreen(page)) {
          boardScreens++;
          problems.push(...(await boardScreenProblems(page, route)).map(at));
        } else {
          problems.push(...(await tabBarProblems(page)).map(at));
        }
      }
      expect(boardScreens, 'board screens visited').toBeGreaterThanOrEqual(9);
      expect([...new Set(problems)], `phone problems at ${phone.width} px`).toEqual([]);
    });
  }
});
