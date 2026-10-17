/**
 * Data layer in local mode (no Supabase variables): no login, local profile on the first start, mode visible,
 * progress kept in IndexedDB across reloads (WP-08 acceptance 6).
 */
import type { Page } from '@playwright/test';
import { freshStart, hasHorizontalScroll } from '../support/app';
import { expect, test } from '../support/fixtures';

const LOCAL_BANNER = 'Lokaler Modus – Fortschritt nur auf diesem Gerät';

/** The stored profile (raw IndexedDB read of the `zugzwang` database). */
async function storedProfile(page: Page): Promise<{ id: string; settings: { boardTheme: string } } | null> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('zugzwang');
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('profile')) {
            db.close();
            resolve(null);
            return;
          }
          const get = db.transaction('profile').objectStore('profile').getAll();
          get.onsuccess = () => {
            db.close();
            resolve((get.result[0] as never) ?? null);
          };
          get.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      }),
  );
}

test.describe('local mode', () => {
  test('no login: pages open directly, the local profile is created on the first start, the mode is visible', async ({ page, isMobile }) => {
    await freshStart(page, '/play');
    await expect(page.getByRole('heading', { level: 1, name: 'Spielen' })).toBeVisible();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByText(LOCAL_BANNER)).toBeVisible();
    if (!isMobile) {
      const status = page.getByTestId('sync-status');
      await expect(status).toHaveAttribute('data-status', 'local-only');
      await expect(status).toBeVisible();
      await expect(status).toContainText('Lokal');
    }
    await expect.poll(async () => (await storedProfile(page))?.id ?? null).not.toBeNull();

    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeVisible();
    await expect(page.getByText('Lokaler Modus: Eine Anmeldung ist nicht nötig.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('E-Mail-Adresse')).toHaveCount(0);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.getByRole('link', { name: 'Zur Startseite' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();

    await page.goto('/auth/callback?code=irrelevant');
    await expect(page).toHaveURL(/\/$/);
  });

  test('progress is stored in IndexedDB and survives a reload', async ({ page }) => {
    await freshStart(page, '/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expect.poll(async () => (await storedProfile(page))?.id ?? null).not.toBeNull();
    const before = (await storedProfile(page))!;
    await page.getByRole('radiogroup', { name: 'Brettdesign' }).getByRole('radio', { name: 'Holz' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-board', 'holz');
    await expect.poll(async () => (await storedProfile(page))?.settings.boardTheme).toBe('holz');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-board', 'holz');
    const after = (await storedProfile(page))!;
    expect(after.id).toBe(before.id); // same local identity, nothing re-created

    // A second tab of the same browser sees the same data.
    const other = await page.context().newPage();
    await other.goto('/settings');
    await expect(other.locator('html')).toHaveAttribute('data-board', 'holz');
    await other.close();
  });

  test('local-mode banner: help explains the modes; dismissed for the rest of the session', async ({ page }) => {
    await freshStart(page, '/');
    const banner = page.getByRole('status').filter({ hasText: LOCAL_BANNER });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Mehr erfahren' }).click();
    const dialog = page.getByRole('dialog', { name: 'Speichern und Synchronisieren' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Lokaler Modus' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Cloud-Sync einrichten' })).toBeVisible();
    await expect(dialog).toContainText('Diese App läuft im lokalen Modus.');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await banner.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByText(LOCAL_BANNER)).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Start' })).toBeVisible();
    await expect(page.getByText(LOCAL_BANNER)).toBeHidden();
  });

  test('the sync status opens the help (desktop sidebar)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the sidebar is hidden below 768 px');
    await freshStart(page, '/');
    await page.getByTestId('sync-status').click();
    const dialog = page.getByRole('dialog', { name: 'Speichern und Synchronisieren' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('sync-help-status')).toContainText('Lokal');
  });
});
