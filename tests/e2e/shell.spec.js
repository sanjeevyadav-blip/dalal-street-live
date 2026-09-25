// docs/10-TEST-PLAN.md §10.5 — the shell loads and the board fills.
//
// This is the first thing a broken bundle breaks. tests/unit/boot.test.js already asserts
// the built artefact wires its sections up under happy-dom; what a real browser adds is that
// the ES module graph actually resolves, the canvas elements exist, and nothing throws before
// paint. A module that fails to load shows up here and almost nowhere else.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, showTab, PROXY_GLOB } from './helpers/fixture-routes.js';

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

// A Thursday, 10:30 IST: inside NSE hours whenever the suite actually runs. Without it the
// refresh loop correctly drops to once every five minutes after the close, and a spec run in
// the evening would wait for a price that is, rightly, not being asked for.
const MARKET_OPEN = new Date('2026-09-24T10:30:00+05:30');

test('prices on screen update by themselves, with no one touching the app', async ({ page }) => {
  await page.clock.setFixedTime(MARKET_OPEN);

  // Registered after the fixture routes, so it answers first. Every batch quote returns a
  // RELIANCE price one rupee higher than the last, so a refresh that happened is visible.
  let calls = 0;
  await page.route(PROXY_GLOB, async (route) => {
    const raw = new URL(route.request().url()).searchParams.get('url') || '';
    if (!raw.includes('/v7/finance/quote')) return route.fallback();
    calls++;
    const syms = new URL(raw).searchParams.get('symbols').split(',');
    const result = syms.slice(0, 21).map((s) => {
      const price = s === 'RELIANCE.NS' ? 1000 + calls : 500;
      return { symbol: s, regularMarketPrice: price, regularMarketPreviousClose: price - 5,
        regularMarketChange: 5, regularMarketChangePercent: 0.5,
        regularMarketTime: Math.floor(MARKET_OPEN.getTime() / 1000), marketState: 'REGULAR' };
    });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ quoteResponse: { result, error: null } }) });
  });

  await page.goto('/');
  await showTab(page, 'top20');
  const cell = page.locator('#top20Body tr[data-sym="RELIANCE.NS"] td.price');
  await expect(cell).toHaveText(/₹1,0\d\d\.00/, { timeout: 20000 });
  const first = await cell.innerText();

  // Nothing is clicked from here on. The next 15-second cycle must move it.
  await expect(cell).not.toHaveText(first, { timeout: 25000 });
  await expect(page.locator('#liveStamp')).toContainText('Live');
  // Batched: the whole screen is a handful of requests, never one per stock.
  expect(calls).toBeLessThan(12);
});

test('outside market hours the line says so, instead of implying the prices are moving', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-26T11:00:00+05:30'));   // a Saturday
  await page.goto('/');
  await expect(page.locator('#liveStamp')).toContainText('Market closed', { timeout: 20000 });
});
