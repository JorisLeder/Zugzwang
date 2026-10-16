/**
 * Playwright `test` that fails on any console error or uncaught page error (CONSTRAINTS §5: no console errors on the
 * main journeys). Use it instead of `@playwright/test`'s `test` in every spec:
 *   import { test, expect } from '../support/fixtures';
 * Allow specific messages with `test.use({ allowedConsoleErrors: [/regex/] })`. Frozen (WP-00).
 */
import { test as base, expect } from '@playwright/test';

/** Extra options of the fixture. */
export interface ConsoleGuardOptions {
  /** Console errors matching one of these are ignored. */
  allowedConsoleErrors: RegExp[];
}

export const test = base.extend<ConsoleGuardOptions & { consoleGuard: void }>({
  allowedConsoleErrors: [[], { option: true }],
  consoleGuard: [
    async ({ page, allowedConsoleErrors }, use, testInfo) => {
      const problems: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (allowedConsoleErrors.some((re) => re.test(text))) return;
        problems.push(`console.error: ${text}`);
      });
      page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
      await use();
      if (problems.length > 0 && testInfo.status === testInfo.expectedStatus) {
        throw new Error(`Console/page errors during the test:\n${problems.join('\n')}`);
      }
    },
    { auto: true },
  ],
});

export { expect };
