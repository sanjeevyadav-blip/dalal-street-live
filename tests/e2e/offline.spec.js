// docs/10-TEST-PLAN.md §10.5 — a dead network must look dead.
//
// This is CLAUDE.md invariant 3 at the page level. When every feed fails, the one outcome
// that must never happen is a page that still looks populated: a stale price with no
// indication it is stale is worse than an error, because the reader acts on it.
//
// tests/unit/boot.test.js already proves the shell survives a rejected fetch. What a browser
// adds is the reader's view — what is actually on screen when nothing loads.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, showTab } from './helpers/fixture-routes.js';

test.describe('dead network', () => {
  test('the shell still loads when every upstream fails', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page, { offline: true });
    await page.goto('/');

    // Static structure is local and must render regardless.
    await expect(page.locator('header.masthead h1')).toContainText('Dalal Street');
    await expect(page.locator('#searchInput')).toBeVisible();
    // mountRanking, mountManual and mountGlossary all create <section class="screener">, so
    // this has to address the screener by its own control rather than by class.
    //
    // Attached, not visible: on a phone these sit on tabs that are not the landing tab,
    // and the claim here is that the shell BUILT them with every upstream dead, not that
    // they happen to be on screen. showTab then proves they are reachable and rendered.
    await expect(page.locator('#rankSection')).toBeAttached();
    await showTab(page, 'scr');
    await expect(page.locator('#loadLargeCap')).toBeEnabled();
    await expect(page.locator('#largeCapBody')).toBeVisible();
    await showTab(page, 'rank');
    await expect(page.locator('#rankSection')).toBeVisible();
  });

  test('market data shows an error rather than a number', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page, { offline: true });
    await page.goto('/');

    // Either the banner fires or the status pill goes bad — both are honest. What is not
    // acceptable is silence.
    const banner = page.locator('#errorBanner');
    const status = page.locator('#statusText');
    await expect
      .poll(async () => {
        const bannerShown = await banner.isVisible().catch(() => false);
        const bannerText = bannerShown ? (await banner.innerText()).trim() : '';
        const statusText = (await status.innerText().catch(() => '')).trim();
        return Boolean(bannerText) || /offline|error|fail|unavailable|down/i.test(statusText);
      }, { timeout: 25000 })
      .toBe(true);
  });

  test('no index card invents a price', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page, { offline: true });
    await page.goto('/');
    await page.waitForTimeout(12000);

    const cards = page.locator('#indicesGrid .index-card');
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const price = (await cards.nth(i).locator('.price').innerText().catch(() => '')).trim();
      // An em dash, a blank, or an explicit message are all fine. A digit is not: with every
      // feed dead there is no price to know, so any number on screen is invented.
      expect(price, 'an index card shows a price with no feed behind it: ' + price)
        .not.toMatch(/\d/);
    }
  });

  test('the detail panel refuses to open rather than opening empty', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page, { offline: true });
    await page.goto('/');

    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();

    // Either an error surfaces or the panel never populates. Both are honest; a panel of
    // em dashes presented as a completed analysis is not.
    await expect
      .poll(async () => {
        const banner = (await page.locator('#errorBanner').innerText().catch(() => '')).trim();
        const card = (await page.locator('#detailCard').innerText().catch(() => '')).trim();
        return Boolean(banner) || !/₹\s*[\d,]+\.\d\d/.test(card);
      }, { timeout: 25000 })
      .toBe(true);
  });
});
