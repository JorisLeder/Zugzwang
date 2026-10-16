/**
 * App helpers for e2e tests. Frozen (WP-00).
 */
import type { Page } from '@playwright/test';

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
