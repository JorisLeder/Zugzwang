import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config.ts';

/** Directories other coders write to in parallel – never trigger reloads (D-22). */
const WATCH_IGNORED = ['**/.build/**', '**/.cache/**', '**/test-results/**', '**/playwright-report/**', '**/coverage/**'];

/**
 * Runtime dependencies pre-bundled at server start. Listing them avoids a dependency re-optimisation (and the full
 * page reload it forces) in the middle of an e2e run when a lazily loaded page imports a library first (D-46).
 */
const PREBUNDLED_DEPS = [
  '@supabase/supabase-js',
  '@tanstack/react-query',
  'chess.js',
  'class-variance-authority',
  'clsx',
  'dexie',
  'dexie-react-hooks',
  'lucide-react',
  'radix-ui',
  'react',
  'react-chessboard',
  'react-dom',
  'react-dom/client',
  'react-router',
  'tailwind-merge',
  'workbox-window',
  'zod',
  'zustand',
];

export default defineConfig(({ mode }) => {
  const e2e = mode === 'e2e';
  const e2ePort = process.env.E2E_PORT;
  return {
    plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // Parallel e2e dev servers (one per package port) must not share the dependency optimiser cache (D-46).
    cacheDir: e2e && e2ePort ? `node_modules/.vite/e2e-${e2ePort}` : undefined,
    optimizeDeps: { include: PREBUNDLED_DEPS },
    server: {
      watch: { ignored: WATCH_IGNORED },
      // In e2e runs, edits by other coders must not hot-reload the page under test (D-46). Changed files are still
      // picked up on the next request; restart the server (or do not use E2E_REUSE) for a clean snapshot.
      hmr: e2e ? false : undefined,
    },
    build: {
      sourcemap: false,
    },
  };
});
