/**
 * npm run lighthouse – Lighthouse mobile performance (PRD P0-16: score ≥ 85) for the start page, rated puzzles, the
 * bot hub and a lesson, plus the PRD timings (first page usable ≤ 2.5 s on 4G, puzzle switch ≤ 300 ms, bot answer
 * ≤ 1 s without artificial think time).
 *
 * - Serves the production build (`dist/`, built first when missing or with `--build`) with `vite preview` over HTTPS
 *   (self-signed certificate from openssl, so the preview speaks HTTP/2 like any production host of a PWA; Chromium
 *   ignores the certificate). `--http1` serves plain HTTP/1.1 instead.
 * - Chromium from Playwright's browser directory (`PLAYWRIGHT_BROWSERS_PATH`, default `/opt/pw-browsers`; override
 *   with `CHROME_PATH`), headless, launched by chrome-launcher with its own profile.
 * - The app runs in local mode. Before measuring, the onboarding is completed once in that profile (Playwright over
 *   CDP), so every page renders its real content. Lighthouse keeps IndexedDB/localStorage (its default storage reset
 *   only clears service workers, Cache Storage and the HTTP cache), so each run is a cold load without the PWA cache.
 * - Score: Lighthouse default config = mobile (Moto G Power emulation, simulated "Slow 4G": 150 ms RTT,
 *   1.6 Mbit/s, 4× CPU slowdown). Each page runs `--runs` times (default 3); the median run is kept. Its TTI is
 *   reported as `ttiSlow4gMs`.
 * - First page usable on 4G (PRD NFR, ≤ 2.5 s): Lighthouse Time to Interactive under 4G throttling – the network of
 *   Chrome DevTools' "Fast 4G" preset (60 ms RTT, 9 Mbit/s) with the same mobile emulation and 4× CPU slowdown,
 *   again the median of `--runs` runs (`tti4gMs`).
 * - Timings in the running app (puzzle switch, bot answer): see `scripts/lib/timings.ts`.
 * - Reports: `.cache/lighthouse/<page>.json` (full LHR of the median score run), `<page>-4g.json` and `summary.json`.
 * - Exit code 1 when a page scores below 85, its 4G TTI exceeds 2.5 s or a timing misses its budget.
 *
 * Options: `--build` (rebuild first), `--runs N`, `--pages start,puzzles,play,lesson`, `--no-timings`, `--http1`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse, { type Result } from 'lighthouse';
import { preview } from 'vite';
import { paths } from '../src/app/paths';
import { measureTimings, type TimingResult } from './lib/timings';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, '.cache', 'lighthouse');

/** PRD P0-16. */
const MIN_SCORE = 85;
/** PRD NFR "Erste Seite in ≤ 2,5 s bedienbar (4G)": Lighthouse Time to Interactive under `THROTTLING_4G`. */
const MAX_TTI_MS = 2500;
/** Chrome DevTools "Fast 4G" network (latency × 2.75 and throughput × 0.9 as DevTools applies them), mobile CPU. */
const THROTTLING_4G = {
  rttMs: 60,
  throughputKbps: 9 * 1024,
  requestLatencyMs: 60 * 2.75,
  downloadThroughputKbps: 9 * 1024 * 0.9,
  uploadThroughputKbps: 1.5 * 1024 * 0.9,
  cpuSlowdownMultiplier: 4,
};

/** Measured pages (all in local mode after the onboarding). */
const PAGES = {
  start: paths.home(),
  puzzles: paths.puzzlesRated(),
  play: paths.play(),
  lesson: paths.lesson('brett-und-figuren', 'brett-und-feldnamen'),
} as const;
type PageKey = keyof typeof PAGES;

interface PageResult {
  page: PageKey;
  url: string;
  score: number;
  scores: number[];
  fcpMs: number;
  lcpMs: number;
  tbtMs: number;
  cls: number;
  speedIndexMs: number;
  /** TTI of the score run (Lighthouse "Slow 4G"). */
  ttiSlow4gMs: number;
  /** TTI under `THROTTLING_4G` (median). */
  tti4gMs: number;
  report: string;
}

type Lhr = Result;

const { values: args } = parseArgs({
  options: {
    build: { type: 'boolean', default: false },
    runs: { type: 'string', default: '3' },
    pages: { type: 'string', default: Object.keys(PAGES).join(',') },
    'no-timings': { type: 'boolean', default: false },
    http1: { type: 'boolean', default: false },
  },
});

/** Self-signed certificate for 127.0.0.1/localhost (cached in `.cache/lighthouse/cert`), or `null` without openssl. */
function certificate(): { key: Buffer; cert: Buffer } | null {
  const dir = join(OUT, 'cert');
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    const r = spawnSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'],
      { stdio: 'ignore' },
    );
    if (r.status !== 0) return null;
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/** Chromium binary: `CHROME_PATH`, else the newest `chromium-*` in Playwright's browser directory. */
function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const builds = existsSync(dir)
    ? readdirSync(dir)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    : [];
  for (const b of builds) {
    const bin = join(dir, b, 'chrome-linux', 'chrome');
    if (existsSync(bin)) return bin;
  }
  throw new Error(`No Chromium found in ${dir} (set CHROME_PATH). Never run "playwright install" here.`);
}

function ensureBuild(): void {
  if (!args.build && existsSync(join(DIST, 'index.html'))) return;
  console.log('Building the production bundle …');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('npm run build failed');
}

/** Completes the onboarding once in the profile, so the measured pages show their real content. */
async function seedProfile(port: number, base: string): Promise<void> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    const context = browser.contexts()[0]!;
    const page = await context.newPage();
    await page.goto(base + paths.home());
    await page.waitForURL(/\/onboarding$/, { timeout: 20_000 });
    await page.getByRole('radio', { name: /^Neuling/ }).click();
    await page.getByRole('radiogroup', { name: 'Tagesziel in Minuten' }).getByRole('radio', { name: '20', exact: true }).click();
    await page.getByRole('button', { name: 'Los geht’s' }).click();
    await page.waitForURL(/\/$/, { timeout: 20_000 });
    await page.getByRole('heading', { level: 1, name: 'Start' }).waitFor({ timeout: 20_000 });
    await unregisterServiceWorkers(page);
    await page.close();
  } finally {
    await browser.close(); // disconnects only; the default context (and its IndexedDB) stays in Chromium
  }
}

async function unregisterServiceWorkers(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  });
}

const median = <T>(xs: T[], key: (x: T) => number): T => [...xs].sort((a, b) => key(a) - key(b))[Math.floor(xs.length / 2)]!;

async function runs(port: number, url: string, key: PageKey, n: number, throttling?: typeof THROTTLING_4G): Promise<Lhr[]> {
  const out: Lhr[] = [];
  for (let i = 0; i < n; i++) {
    const r = await lighthouse(url, {
      port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      ...(throttling ? { throttling } : {}),
    });
    if (!r) throw new Error(`Lighthouse returned nothing for ${url}`);
    const { lhr } = r;
    if (lhr.runtimeError) throw new Error(`${key}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
    if (new URL(lhr.finalDisplayedUrl).pathname !== PAGES[key]) throw new Error(`${key}: redirected to ${lhr.finalDisplayedUrl}`);
    out.push(lhr);
  }
  return out;
}

const scoreOf = (lhr: Lhr) => Math.round((lhr.categories.performance?.score ?? 0) * 100);
const metric = (lhr: Lhr, id: string) => lhr.audits[id]?.numericValue ?? NaN;

async function audit(port: number, base: string, key: PageKey, n: number): Promise<PageResult> {
  const url = base + PAGES[key];
  const scored = await runs(port, url, key, n);
  const lhr = median(scored, scoreOf);
  const report = join(OUT, `${key}.json`);
  writeFileSync(report, JSON.stringify(lhr, null, 2));
  const fast = await runs(port, url, key, n, THROTTLING_4G);
  const lhr4g = median(fast, (l) => metric(l, 'interactive'));
  writeFileSync(join(OUT, `${key}-4g.json`), JSON.stringify(lhr4g, null, 2));
  return {
    page: key,
    url: PAGES[key],
    score: scoreOf(lhr),
    scores: scored.map(scoreOf),
    fcpMs: Math.round(metric(lhr, 'first-contentful-paint')),
    lcpMs: Math.round(metric(lhr, 'largest-contentful-paint')),
    tbtMs: Math.round(metric(lhr, 'total-blocking-time')),
    cls: Number(metric(lhr, 'cumulative-layout-shift').toFixed(3)),
    speedIndexMs: Math.round(metric(lhr, 'speed-index')),
    ttiSlow4gMs: Math.round(metric(lhr, 'interactive')),
    tti4gMs: Math.round(metric(lhr4g, 'interactive')),
    report,
  };
}

async function main(): Promise<void> {
  const n = Math.max(1, Number(args.runs) || 1);
  const keys = args.pages.split(',').map((s) => s.trim()) as PageKey[];
  for (const k of keys) if (!(k in PAGES)) throw new Error(`Unknown page "${k}" (${Object.keys(PAGES).join(', ')})`);
  ensureBuild();
  mkdirSync(OUT, { recursive: true });

  const https = args.http1 ? null : certificate();
  if (!args.http1 && !https) console.warn('openssl failed – serving plain HTTP/1.1.');
  const server = await preview({
    root: ROOT,
    logLevel: 'warn',
    preview: { host: '127.0.0.1', port: 4319, strictPort: false, ...(https ? { https } : {}) },
  });
  const base = (server.resolvedUrls?.local[0] ?? `${https ? 'https' : 'http'}://127.0.0.1:4319/`).replace(/\/$/, '');
  const profile = mkdtempSync(join(tmpdir(), 'zz-lighthouse-'));
  const chrome = await chromeLauncher.launch({
    chromePath: chromePath(),
    userDataDir: profile,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--lang=de-DE', ...(https ? ['--ignore-certificate-errors'] : [])],
  });
  let failed = false;
  try {
    await seedProfile(chrome.port, base);
    const pages: PageResult[] = [];
    for (const key of keys) {
      const r = await audit(chrome.port, base, key, n);
      pages.push(r);
      console.log(
        `${key.padEnd(8)} ${String(r.score).padStart(3)} (runs ${r.scores.join('/')})  FCP ${r.fcpMs} ms  LCP ${r.lcpMs} ms  ` +
          `TBT ${r.tbtMs} ms  CLS ${r.cls}  SI ${r.speedIndexMs} ms  TTI ${r.ttiSlow4gMs} ms (Slow 4G) / ${r.tti4gMs} ms (4G)`,
      );
    }
    let timings: TimingResult[] = [];
    if (!args['no-timings']) {
      timings = await measureTimings(chrome.port, base);
      for (const t of timings) console.log(`${t.name.padEnd(28)} ${t.valueMs} ms (budget ${t.budgetMs} ms) ${t.detail}`);
    }
    const lowScores = pages.filter((p) => p.score < MIN_SCORE);
    const slowTti = pages.filter((p) => p.tti4gMs > MAX_TTI_MS);
    const slowTimings = timings.filter((t) => t.valueMs > t.budgetMs);
    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          protocol: https ? 'h2' : 'http/1.1',
          minScore: MIN_SCORE,
          maxTtiMs: MAX_TTI_MS,
          throttling4g: THROTTLING_4G,
          runsPerPage: n,
          pages,
          timings,
        },
        null,
        2,
      ),
    );
    for (const p of lowScores) console.error(`FAIL ${p.page}: performance ${p.score} < ${MIN_SCORE}`);
    for (const p of slowTti) console.error(`FAIL ${p.page}: TTI (4G) ${p.tti4gMs} ms > ${MAX_TTI_MS} ms`);
    for (const t of slowTimings) console.error(`FAIL ${t.name}: ${t.valueMs} ms > ${t.budgetMs} ms`);
    failed = lowScores.length + slowTti.length + slowTimings.length > 0;
    console.log(`Reports: ${OUT}`);
  } finally {
    chrome.kill();
    await server.close();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chromium may still be writing to its profile while it exits; the OS cleans up the temp dir.
    }
  }
  if (failed) process.exitCode = 1;
}

await main();
