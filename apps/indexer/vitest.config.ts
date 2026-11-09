import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Integration tests boot a Postgres container and run migrations.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
