import {defineConfig} from 'vitest/config';

/** Default config — excludes the e2e suite because it spawns Anvil
 *  child processes and is slow. Run e2e via `npm run test:e2e`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
