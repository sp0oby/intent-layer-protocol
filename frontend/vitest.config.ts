import {defineConfig} from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config for the frontend's unit tests. Covers pure-logic helpers
 * in lib/ — no JSX rendering, no MSW. Component tests + Playwright are
 * deferred until brand sign-off.
 *
 * jsdom is included as the env so any test that touches window /
 * document (e.g. via a hook) doesn't need to opt in per file.
 *
 * The `@/*` alias mirrors tsconfig so test files can import the same
 * way the app does.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
