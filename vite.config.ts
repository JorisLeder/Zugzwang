import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config.ts';

/** Directories other coders write to in parallel – never trigger reloads (D-22). */
const WATCH_IGNORED = ['**/.build/**', '**/.cache/**', '**/test-results/**', '**/playwright-report/**', '**/coverage/**'];

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    watch: { ignored: WATCH_IGNORED },
  },
  build: {
    sourcemap: false,
  },
});
