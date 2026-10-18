/**
 * Helpers for the WP-09 e2e tests (dashboard, onboarding, profile, statistics, settings): the onboarding flow, raw
 * IndexedDB seeding of the real Dexie database `zugzwang` (followed by a reload, because live queries only see writes
 * made through Dexie) and reads of the stored profile.
 */
import type { Locator, Page } from '@playwright/test';

export { completeOnboarding, type Assessment } from '../support/app';

/** The visible instance of an element that may exist twice (phone vs desktop layout). */
export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/** Today's `YYYY-MM-DD` in the browser's time zone (Playwright: Europe/Berlin). */
export async function todayKey(page: Page): Promise<string> {
  return page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
}

/** Puts rows into stores of the app's IndexedDB database (keys come from the rows), then reloads the page. */
export async function seed(page: Page, rows: Record<string, unknown[]>, opts: { reload?: boolean } = {}): Promise<void> {
  await page.evaluate(
    (input) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('zugzwang');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const stores = Object.keys(input);
          const tx = db.transaction(stores, 'readwrite');
          for (const store of stores) for (const row of input[store]!) tx.objectStore(store).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    rows,
  );
  if (opts.reload !== false) await page.reload();
}

/** Reads all rows of a store. */
export async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve) => {
        const req = indexedDB.open('zugzwang');
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(name)) {
            db.close();
            resolve([]);
            return;
          }
          const get = db.transaction(name).objectStore(name).getAll();
          get.onsuccess = () => {
            db.close();
            resolve(get.result as T[]);
          };
          get.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
    store,
  );
}

/** The stored profile. */
export async function storedProfile(page: Page): Promise<{ dailyGoalMinutes: number; onboardingCompleted: boolean; settings: Record<string, unknown> } | null> {
  const rows = await readStore<{ dailyGoalMinutes: number; onboardingCompleted: boolean; settings: Record<string, unknown> }>(page, 'profile');
  return rows[0] ?? null;
}

/** Client-side navigation through the router (no reload), via a temporary in-app link click. */
export async function navigateInApp(page: Page, url: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

/** A rating row. */
export function rating(kind: 'puzzle' | 'bot', value: number, gamesCount: number, updatedAt = new Date().toISOString()) {
  return { kind, rating: value, rd: 120, volatility: 0.06, gamesCount, updatedAt, provisional: false };
}
