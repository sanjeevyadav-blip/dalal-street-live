// docs/10-TEST-PLAN.md §10.5 — the shell loads and the board fills.
//
// This is the first thing a broken bundle breaks. tests/unit/boot.test.js already asserts
// the built artefact wires its sections up under happy-dom; what a real browser adds is that
// the ES module graph actually resolves, the canvas elements exist, and nothing throws before
// paint. A module that fails to load shows up here and almost nowhere else.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts } from './helpers/fixture-routes.js';

test.beforeEach(async ({ page }) => {
  await stubFonts(page);
  await installFixtureRoutes(page);
});

test('loads and shows three index prices within 5s', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('#indicesGrid .index-card');
  await expect(cards).toHaveCount(3, { timeout: 5000 });
  // A card that rendered its frame but never got a price is the failure worth catching —
  // it looks fine in a screenshot and is useless.
  for (let i = 0; i < 3; i++) {
    await expect(cards.nth(i).locator('.price')).toHaveText(/\d/, { timeout: 5000 });
  }
});

test('the page reports no console errors on load', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    // suppressed() warnings are deliberate and expected; uncaught errors are not.
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await expect(page.locator('#indicesGrid .index-card')).toHaveCount(3, { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('the status pill and IST clock come alive', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#istClock')).toHaveText(/IST/, { timeout: 5000 });
  await expect(page.locator('#statusText')).not.toHaveText('Checking…', { timeout: 10000 });
});

test('the ticker tape is populated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tickerTrack .ticker-item').first()).toBeVisible({ timeout: 10000 });
});
