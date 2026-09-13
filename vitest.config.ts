import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'src/core/search.ts',
        'src/core/virtual.ts',
      ],
      thresholds: {
        perFile: true,
        statements: 50,
        branches: 60,
        functions: 40,
        lines: 50,
      },
    },
  },
});
