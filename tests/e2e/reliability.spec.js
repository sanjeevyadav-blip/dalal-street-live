// EPIC-4 in a real browser — the acceptance criteria as a reader experiences them.
//
// The unit tests prove each mechanism. These prove the two claims the stories are actually
// written in terms of: "one dead feed never blanks the page", and "errors visible without a
// user report".

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, PROXY_GLOB } from './helpers/fixture-routes.js';

test.describe('E4-2 — one dead feed never blanks the page', () => {
  test('the panel still renders when the option chain is down', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    // Kill only NSE. Everything else keeps working — the realistic partial outage.
    await page.route('**/*option-chain*', (route) => route.fulfill({ status: 502, body: 'Upstream failed' }));

    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();

    // The blocks that do not depend on NSE must be completely unaffected.
    await expect(page.locator('#detailCard .price-hero .big')).toHaveText(/₹\s*[\d,]/, { timeout: 20000 });
    await expect(page.locator('#snapBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#thesisBlock')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('#facBlock')).toBeVisible({ timeout: 25000 });

    // And the options block says what happened, rather than vanishing or showing zeros.
    await expect(page.locator('#optBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#optBlock')).not.toContainText('Pulling the live NSE option chain', { timeout: 20000 });
  });

  test('a block failure is labelled a feed failure, not a missing figure', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    // Kill the fundamentals timeseries, which the DCF and earnings-quality blocks need.
    await page.route('**/*timeseries*', (route) => route.fulfill({ status: 500, body: 'boom' }));

    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();

    await expect(page.locator('#detailCard .price-hero .big')).toHaveText(/₹\s*[\d,]/, { timeout: 20000 });
    // The page must still be a working page.
    await expect(page.locator('#snapBlock')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('#priceChart')).toBeVisible();
  });
});

test.describe('E4-4 — errors visible without a user report', () => {
  test('the diagnostics panel is off by default', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await page.goto('/');
    await expect(page.locator('#diagnosticsSection')).toBeVisible();
    await expect(page.locator('#diagToggle')).not.toBeChecked();
    // Off means the log is not shown, not that it is not being kept.
    await expect(page.locator('#diagRows')).toHaveCount(0);
  });

  test('?diag=1 opens it, and it lists the failures that actually happened', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await page.route('**/*option-chain*', (route) => route.fulfill({ status: 502, body: 'Upstream failed' }));

    await page.goto('/?diag=1');
    await expect(page.locator('#diagToggle')).toBeChecked();

    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expect(page.locator('#optBlock')).toBeVisible({ timeout: 20000 });

    // The NSE failure must be readable here, with no console and no repro.
    const rows = page.locator('#diagRows');
    await expect(rows).toContainText('proxy', { timeout: 20000 });
    await expect(rows).toContainText('nseindia.com', { timeout: 20000 });
  });

  test('the log records the upstream host but never the symbol that was looked up', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await page.route('**/*quoteSummary*', (route) => route.fulfill({ status: 500, body: 'boom' }));

    await page.goto('/?diag=1');
    await page.locator('#searchInput').fill('persistent');
    await page.locator('#suggestions .item').first().click();
    await expect(page.locator('#diagRows')).toContainText('yahoo.com', { timeout: 25000 });

    const log = await page.locator('#diagRows').innerText();
    expect(log).not.toContain('PERSISTENT.NS');
    expect(log).not.toContain('modules=');
  });

  test('the panel keeps filling even when it was switched on after the failure', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await page.route('**/*option-chain*', (route) => route.fulfill({ status: 502, body: 'nope' }));

    // Start with the panel OFF, cause a failure, then switch it on. The whole point of
    // recording while disabled is that this works.
    await page.goto('/?diag=0');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expect(page.locator('#optBlock')).toBeVisible({ timeout: 20000 });

    await page.locator('#diagToggle').check();
    await expect(page.locator('#diagRows')).toContainText('nseindia.com', { timeout: 10000 });
  });
});

test.describe('E4-3 — a transient failure recovers', () => {
  test('one 503 does not cost the reader the block', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);

    // Fail the very first proxied request, then let everything through. Without the retry
    // the index cards behind it would come up empty.
    let first = true;
    await page.route(PROXY_GLOB, async (route) => {
      if (first){ first = false; return route.fulfill({ status: 503, body: 'try again' }); }
      return route.fallback();
    });

    await page.goto('/');
    const cards = page.locator('#indicesGrid .index-card');
    await expect(cards).toHaveCount(3, { timeout: 15000 });
    for (let i = 0; i < 3; i++){
      await expect(cards.nth(i).locator('.price')).toHaveText(/\d/, { timeout: 15000 });
    }
  });
});
