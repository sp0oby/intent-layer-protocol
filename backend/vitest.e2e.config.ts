import {defineConfig} from 'vitest/config';

/** E2E config — runs the suite under tests/e2e/ which spawns Anvil
 *  child processes and exercises the full backend ↔ contracts boundary. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
