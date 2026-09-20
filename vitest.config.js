import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js', 'tests/regression/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],

      // These directories do not exist yet — EPIC-1 creates them in PR-5 and PR-6. Until
      // then the globs match nothing, v8 reports 0%, and the thresholds below DO NOT FAIL:
      // vitest skips threshold checking when no file matches. The gate is dormant, not
      // enforced. That is the intended ratchet (it starts biting the moment the first pure
      // module lands) but it is worth stating plainly, because a green `test:coverage` here
      // means "nothing was measured", not "coverage is fine".
      include: ['src/indicators/**', 'src/valuation/**', 'src/models/**', 'src/options/**'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }
    }
  }
});
