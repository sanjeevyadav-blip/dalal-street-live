import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',

  // 90s, not 60s. A detail-panel spec waits on several blocks that each allow 20-25s, and
  // the whole suite shares one preview server — under load a spec that runs in 8s on its own
  // was tipping over 60s and failing for want of time rather than for any fault in the page.
  timeout: 90000,

  // Independent by construction: every spec gets its own browser context and routes its own
  // network, so there is no shared state to serialise for. Running one at a time was leaving
  // seven of eight cores idle and making the suite slow enough to cause the timeouts above.
  fullyParallel: true,
  workers: 4,

  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',  use: { ...devices['Pixel 7'] } }
  ],
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: !process.env.CI }
});
