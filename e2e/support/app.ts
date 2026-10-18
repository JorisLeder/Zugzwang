/**
 * App helpers for e2e tests. Frozen (WP-00).
 */
import { expect, type Page } from '@playwright/test';

/**
 * Starts with an empty app: clears localStorage, sessionStorage and every IndexedDB database of the origin, then
 * navigates to `path` (default `/`).
 */
export async function freshStart(page: Page, path = '/'): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // storage may be unavailable
    }
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs.map(
        (db) =>
          new Promise<void>((resolve) => {
            if (!db.name) return resolve();
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }),
      ),
    );
  });
  await page.goto(path);
}

/** Whether the page scrolls horizontally (must be false at 360 px). */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

/** Self-assessment labels of the onboarding. */
export type Assessment = 'Neuling' | 'Einsteiger' | 'Clubspieler' | 'Fortgeschritten';

/**
 * Fresh app → redirected to the onboarding (the start page needs a completed one) → self-assessment and daily goal
 * → start page. Use it before tests that need the start page.
 */
export async function completeOnboarding(page: Page, choice: Assessment = 'Clubspieler', goal = 20): Promise<void> {
  await freshStart(page, '/');
  await fillOnboarding(page, choice, goal);
}

/** Like `completeOnboarding`, but keeps the data of the current app (opens `/`, which redirects to the onboarding). */
export async function finishOnboarding(page: Page, choice: Assessment = 'Clubspieler', goal = 20): Promise<void> {
  await page.goto('/');
  await fillOnboarding(page, choice, goal);
}

async function fillOnboarding(page: Page, choice: Assessment, goal: number): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Willkommen bei Zugzwang' })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).click();
  await page.getByRole('radiogroup', { name: 'Tagesziel in Minuten' }).getByRole('radio', { name: String(goal), exact: true }).click();
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
}
