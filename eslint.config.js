// ESLint flat config (ESLint 9). Owned by WP-00 (frozen). Request changes via `needs`.
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    'dist/**',
    'dev-dist/**',
    '.build/**',
    '.cache/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'public/**',
    // Deno entry files of the edge functions are not part of the Node/Vite toolchain (BACKLOG 2.2).
    'supabase/functions/*/index.ts',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // "No `any` without a comment": use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Rules layer: chess.js may only be used inside src/lib/chess (CONSTRAINTS §3, D-04).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'chess.js', message: 'Use @/lib/chess – it is the only rules layer (FIDE-correct game end, D-04).' },
            { name: 'stockfish', message: 'Use @/lib/uci/node (Node) or @/engine (browser).' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/lib/chess/**/*.ts', 'src/core/chess.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/lib/uci/node.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['scripts/**/*.{ts,mjs}', 'e2e/**/*.ts', '*.config.{ts,js}'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended, reactRefresh.configs.vite()],
  },
  {
    files: ['src/**/*.ts'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Tests and fixtures may export helpers next to components.
    files: ['src/**/*.test.tsx', 'src/**/routes.tsx', 'src/app/**/*.tsx', 'src/**/testing/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]);
