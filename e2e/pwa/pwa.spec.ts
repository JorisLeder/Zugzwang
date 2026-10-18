/**
 * WP-09 e2e – PWA (AC5, PRD P0-16, NFR Offline).
 *
 * - Offline banner and offline puzzles: run on every server (dev and production build). The puzzle bank lives in
 *   IndexedDB, so puzzles keep working without network inside a loaded app.
 * - Manifest, service worker, installability and an offline reload: production build only (the service worker is
 *   disabled in the dev server). Run them with the default server mode, e.g. `E2E_PORT=5219 npx playwright test e2e/pwa`.
 */
import type { Page } from '@playwright/test';
import { paths } from '../../src/app/paths';
import type { Puzzle } from '../../src/core/puzzles';
import { ChessGame } from '../../src/lib/chess';
import { board, clickMove } from '../support/board';
import { expect, test } from '../support/fixtures';

const OFFLINE_TEXT = 'Du bist offline – Puzzles laufen weiter.';
const production = process.env.E2E_SERVER !== 'dev';

function panel(page: Page) {
  return page.getByTestId('puzzle-panel');
}

/** The puzzle on screen, read from the app's IndexedDB bank (works offline). */
async function currentPuzzle(page: Page): Promise<Puzzle> {
  await expect(panel(page)).toHaveAttribute('data-phase', 'user', { timeout: 15_000 });
  const id = await panel(page).getAttribute('data-puzzle-id');
  const puzzle = await page.evaluate(
    (pid) =>
      new Promise<unknown>((resolve) => {
        const req = indexedDB.open('zugzwang');
        req.onsuccess = () => {
          const get = req.result.transaction('puzzles').objectStore('puzzles').get(pid!);
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result ?? null);
          };
        };
        req.onerror = () => resolve(null);
      }),
    id,
  );
  if (!puzzle) throw new Error(`puzzle ${id} not in the local bank`);
  return puzzle as Puzzle;
}

/** Plays the learner's moves of the solution (the app plays the opponent's replies). */
async function solve(page: Page, p: Puzzle): Promise<void> {
  for (let ply = 1; ply < p.moves.length; ply += 2) {
    const fen = ChessGame.fromMoves(p.fen, p.moves.slice(0, ply)).fen();
    await expect(board(page)).toHaveAttribute('data-fen', fen, { timeout: 10_000 });
    await expect(panel(page)).toHaveAttribute('data-phase', 'user', { timeout: 10_000 });
    const uci = p.moves[ply]!;
    await clickMove(page, uci.slice(0, 2), uci.slice(2, 4), (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined);
  }
  await expect(panel(page)).toHaveAttribute('data-phase', 'done', { timeout: 10_000 });
}

/** Number of puzzles in the local bank. */
async function bankSize(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('zugzwang');
        req.onsuccess = () => {
          const count = req.result.transaction('puzzles').objectStore('puzzles').count();
          count.onsuccess = () => {
            req.result.close();
            resolve(count.result);
          };
        };
        req.onerror = () => resolve(0);
      }),
  );
}

test.describe('offline banner and offline puzzles (AC5)', () => {
  // Offline, the browser logs every failed request (e.g. the puzzle-bank manifest check) – expected here.
  test.use({ allowedConsoleErrors: [/net::ERR_INTERNET_DISCONNECTED/] });

  test('offline: banner on pages, compact hint on the board, puzzles keep working; online again: banner gone', async ({ page, context }) => {
    test.setTimeout(60_000);
    // Load the bank and the route modules while online (in the dev server modules are fetched on first use).
    await page.goto(paths.puzzlesLearn());
    await currentPuzzle(page);
    await page.locator('a[href="/puzzles"]').filter({ visible: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Puzzles' })).toBeVisible();
    const manifest = (await (await page.request.get('/data/puzzles/manifest.json')).json()) as { chunks: Array<{ count: number }> };
    await expect.poll(() => bankSize(page)).toBe(manifest.chunks.reduce((n, c) => n + c.count, 0));

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toHaveText(OFFLINE_TEXT);

    await page.getByRole('link', { name: /Lernmodus/ }).click();
    await expect(page.getByTestId('offline-banner')).toBeHidden();
    await expect(page.getByTestId('offline-pill')).toBeVisible();
    await expect(page.getByTestId('offline-pill')).toHaveText(OFFLINE_TEXT);
    const first = await currentPuzzle(page);
    await solve(page, first);
    await page.getByTestId('next-puzzle').click();
    const second = await currentPuzzle(page);
    expect(second.id).not.toBe(first.id);

    await context.setOffline(false);
    await expect(page.getByTestId('offline-pill')).toHaveCount(0);
  });
});

test.describe('installable PWA (AC5, production build)', () => {
  test.skip(!production, 'the service worker and the manifest link exist only in production builds');
  test.use({ allowedConsoleErrors: [/net::ERR_INTERNET_DISCONNECTED/] });

  test('valid manifest with icons, service worker registered and controlling, installable', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const res = await page.request.get(href!);
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as Record<string, unknown> & { icons: Array<{ src: string; sizes: string; purpose?: string; type: string }> };
    expect(manifest).toMatchObject({ name: 'Zugzwang', short_name: 'Zugzwang', lang: 'de', display: 'standalone', start_url: '/', scope: '/' });
    expect(String(manifest.description)).toMatch(/Schach lernen/);
    expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    for (const [sizes, purpose] of [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]) {
      const icon = manifest.icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
      expect(icon, `${sizes} ${purpose}`).toBeDefined();
      const img = await page.request.get(icon!.src);
      expect(img.ok()).toBe(true);
      expect(img.headers()['content-type']).toContain('image/png');
    }

    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { scope: reg.scope, script: reg.active?.scriptURL ?? '' };
    });
    expect(sw.script).toMatch(/\/sw\.js$/);
    expect(new URL(sw.scope).pathname).toBe('/');
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    // Chromium's own installability check (manifest + icons + service worker with a fetch handler).
    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: Array<{ errorId: string }> };
    expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
  });

  test('offline reload: app shell, routes, lessons and puzzles come from the service worker', async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.goto(paths.puzzlesLearn());
    await currentPuzzle(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('offline-pill')).toBeVisible();
    await solve(page, await currentPuzzle(page));

    // A lesson that was never opened: its content chunk is precached.
    await page.goto(paths.lesson('brett-und-figuren', 'brett-und-feldnamen'));
    await expect(page.getByTestId('lesson-player').filter({ visible: true }).first()).toHaveAttribute('data-step-index', '0', { timeout: 15_000 });
    await page.goto(paths.settings());
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toHaveText(OFFLINE_TEXT);
    await context.setOffline(false);
  });
});
