/**
 * PWA options for vite-plugin-pwa (imported by vite.config.ts; PRD P0-16, NFR Offline).
 *
 * - Manifest: German name/description, icons 192/512 + maskable 512 (`public/icons/`), theme and background colour
 *   read from the design tokens (`--zz-bg` of the default dark theme), `display: standalone`.
 * - Service worker (Workbox `generateSW`): precaches the app shell (HTML, JS, CSS, fonts), every lazily loaded route
 *   and lesson-content chunk (so opened courses work offline), the engine (`engine/*.js` + `.wasm`), the puzzle bank
 *   (`data/puzzles/*.json` – the bank is also kept in IndexedDB) and the bot avatars. Navigations fall back to
 *   `index.html` (SPA routes offline).
 * - Registration happens in the app (`src/features/pwa/`, `injectRegister: false`) with `registerType: 'prompt'`:
 *   a new version waits until the learner accepts "Neue Version verfügbar". The service worker is never active in
 *   the dev server (`devOptions.enabled: false`), so it cannot interfere with development or dev-server e2e runs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Fallback colour if the token file cannot be read (same value as `--zz-bg`). */
const FALLBACK_BG = '#171614';

/** Reads a colour token of the default (dark) theme from `src/styles/tokens.css`. */
export function tokenColor(name: string, fallback: string, css?: string): string {
  let source = css;
  if (source === undefined) {
    try {
      source = readFileSync(fileURLToPath(new URL('./src/styles/tokens.css', import.meta.url)), 'utf8');
    } catch {
      return fallback;
    }
  }
  const match = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\b`).exec(source);
  return match?.[1] ?? fallback;
}

/** Page background of the dark default theme – used for the splash screen and the browser UI. */
export const PWA_BACKGROUND = tokenColor('--zz-bg', FALLBACK_BG);

/** Files precached by the service worker (relative to the build output). */
export const PRECACHE_GLOBS = [
  '**/*.{js,css,html,woff2}',
  'favicon.svg',
  'icons/*.png',
  'avatars/**/*.svg',
  'engine/*.{js,wasm}',
  'data/puzzles/**/*.json',
];

/** Largest precached file (the engine's wasm is about 1.8 MB; bank chunks stay well below). */
export const MAX_PRECACHE_FILE_BYTES = 8 * 1024 * 1024;

export const pwaOptions: Partial<VitePWAOptions> = {
  injectRegister: false,
  registerType: 'prompt',
  strategies: 'generateSW',
  devOptions: { enabled: false },
  // The icons are precached by `PRECACHE_GLOBS` (avoids duplicate precache entries).
  includeManifestIcons: false,
  manifest: {
    id: '/',
    name: 'Zugzwang',
    short_name: 'Zugzwang',
    description: 'Schach lernen mit Puzzles, Lektionen, Bots und Partieanalyse – auf Deutsch, auch offline.',
    lang: 'de',
    dir: 'ltr',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    orientation: 'any',
    categories: ['education', 'games'],
    background_color: PWA_BACKGROUND,
    theme_color: PWA_BACKGROUND,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: PRECACHE_GLOBS,
    maximumFileSizeToCacheInBytes: MAX_PRECACHE_FILE_BYTES,
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
  },
};
