/**
 * W3-2 console-error sweep (desktop and mobile project): with real data (onboarding, an imported game with its
 * review, a running bot game) every route is opened in turn; any console error, uncaught page error, failed request
 * or HTTP error response fails the test. Only the intentionally unreachable external hosts (Lichess cloud eval,
 * Supabase in cloud mode) may fail; requests cancelled by a navigation or an AbortController (`net::ERR_ABORTED`) are
 * no failures.
 */
import { expect, test } from '../support/fixtures';
import { allRoutes, openRoute, prepareApp } from './helpers';

/** External hosts that the test environment cannot reach on purpose. */
const UNREACHABLE_HOSTS = [/(^|\.)lichess\.org$/, /(^|\.)supabase\.co$/];

const allowed = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return UNREACHABLE_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
};

test.describe('Fehler-Durchlauf über alle Routen', () => {
  test('keine Konsolenfehler und keine fehlgeschlagenen Anfragen', async ({ page }) => {
    test.setTimeout(240_000);
    const problems: string[] = [];
    let where = 'Vorbereitung';
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`${where}: console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`${where}: pageerror: ${err.message}`));
    page.on('requestfailed', (req) => {
      // Cancelled on purpose: in-flight module loads when the test navigates on, or an AbortController of the app.
      if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
      if (!allowed(req.url())) problems.push(`${where}: request failed: ${req.method()} ${req.url()} (${req.failure()?.errorText ?? '?'})`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400 && !allowed(res.url())) problems.push(`${where}: HTTP ${res.status()}: ${res.request().method()} ${res.url()}`);
    });

    const data = await prepareApp(page);
    const routes = allRoutes(data);
    for (const route of routes) {
      where = route.url;
      await openRoute(page, route);
    }
    where = 'Ende';
    expect(problems, `console errors or failed requests on ${routes.length} routes`).toEqual([]);
  });
});
