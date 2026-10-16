/**
 * Playwright config (BACKLOG 2.9). Chromium only, from PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
 * (@playwright/test is pinned to 1.56.1 = Chromium revision 1194; never run `playwright install`).
 *
 * Server modes:
 * - default (`npm run e2e`): production build in mode `e2e` into `.build/e2e`, served by `vite preview`.
 * - `E2E_SERVER=dev`: Vite dev server in mode `e2e` (parallel-safe per-package runs, D-22).
 * Port: `E2E_PORT` (default 4173). Set `E2E_REUSE=1` to reuse a server that is already running on that port.
 */
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const useDevServer = process.env.E2E_SERVER === 'dev';
const baseURL = `http://localhost:${port}`;

const command = useDevServer
  ? `node scripts/copy-engine.mjs && vite --mode e2e --port ${port} --strictPort`
  : `node scripts/copy-engine.mjs && vite build --mode e2e --outDir .build/e2e --emptyOutDir && vite preview --outDir .build/e2e --port ${port} --strictPort`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command,
    url: baseURL,
    reuseExistingServer: process.env.E2E_REUSE === '1',
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
