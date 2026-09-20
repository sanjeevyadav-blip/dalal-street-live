import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js', 'tests/regression/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/indicators/**', 'src/valuation/**', 'src/models/**', 'src/options/**'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  }
});
