import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Two projects (BACKLOG 2.2):
 * - `node`: every `*.test.ts` in src, scripts and supabase (pure logic, engine, scripts).
 * - `dom`:  every `src/**\/*.test.tsx` (React components, jsdom + jest-dom matchers).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The on-disk transform cache keys a module by its own content, so an `import.meta.glob` map (lesson content,
    // `src/lessons/index.ts`) stays stale after files are added – tests would then see an outdated file list.
    fsModuleCache: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'supabase/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
