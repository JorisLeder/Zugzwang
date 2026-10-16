/**
 * PWA options for vite-plugin-pwa (imported by vite.config.ts).
 *
 * PLACEHOLDER written by WP-00 – owned by WP-09 from wave 2 (manifest icons, precaching of the engine,
 * puzzle bank and lesson content, update prompt, registration).
 * Current state: minimal German manifest; the generated service worker is NOT registered
 * (`injectRegister: false`) and never active in dev, so it cannot interfere with development or e2e runs.
 */
import type { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaOptions: Partial<VitePWAOptions> = {
  injectRegister: false,
  registerType: 'prompt',
  devOptions: { enabled: false },
  manifest: {
    name: 'Zugzwang',
    short_name: 'Zugzwang',
    description: 'Schach lernen mit Puzzles, Lektionen, Bots und Partieanalyse.',
    lang: 'de',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    background_color: '#171614',
    theme_color: '#171614',
    icons: [],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
  },
};
