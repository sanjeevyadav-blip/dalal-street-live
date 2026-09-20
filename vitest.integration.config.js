import { defineConfig } from 'vitest/config';

// Live-API integration checks — docs/10-TEST-PLAN.md §10.4.
//
// These are DELIBERATELY not part of `npm run verify`. Everything in vitest.config.js runs
// offline against committed fixtures and must stay green on any machine at any hour; this
// config does the opposite, reaching the real Cloudflare Worker and the real Yahoo and NSE
// endpoints. Folding the two together would make the main suite fail whenever an upstream
// hiccups, which is how a suite stops being trusted.
//
//     npm run test:integration
//
// Run it weekly, and after any Worker change. A failure here means an upstream contract
// moved, not that this repo regressed — docs/12-MAINTENANCE-SUPPORT.md ranks the feeds by
// fragility and lists the fallback for each.
export default defineConfig({
  test: {
    // happy-dom, not node: fetchNews parses the RSS with DOMParser, which node lacks.
    // Running the real module beats reimplementing its parse in the test.
    environment: 'happy-dom',
    include: ['tests/integration/**/*.test.js'],

    // NSE rate-limits, and the Worker re-runs its cookie handshake when a session expires.
    // One file at a time, one test at a time, generous timeouts.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 45000,
    hookTimeout: 45000,
    retry: 1,

    // No coverage gate: these exercise the network layer, not the pure maths the
    // thresholds in vitest.config.js are there to protect.
    coverage: { enabled: false }
  }
});
