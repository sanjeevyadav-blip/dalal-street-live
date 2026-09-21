// docs/10-TEST-PLAN.md §10.5 — the mobile layer at 390×844 (iPhone 12/13/14 class).
//
// mobileLayer() injects a stylesheet and a bottom nav at runtime rather than shipping them
// in the markup, so none of this exists until the module runs. A happy-dom test cannot see
// any of it: there is no layout, so "does the table overflow the viewport" has no answer.
// This is the one part of the suite that genuinely needs a browser.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts } from './helpers/fixture-routes.js';

const PHONE = { width: 390, height: 844 };

test.describe('mobile layout at 390×844', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await stubFonts(page);
    await installFixtureRoutes(page);
  });

  test('the bottom nav is visible and fixed to the bottom', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('#mnav');
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    // Fixed to the bottom edge, within the safe-area allowance.
    expect(box.y + box.height).toBeGreaterThan(PHONE.height - 80);
    expect(box.width).toBeGreaterThan(PHONE.width * 0.9);
  });

  test('the page does not scroll horizontally', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#indicesGrid .index-card')).toHaveCount(3, { timeout: 10000 });
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth
    }));
    // A few pixels of slack for sub-pixel rounding; a real overflow is tens of pixels.
    expect(overflow.doc, 'the document is wider than the viewport').toBeLessThanOrEqual(overflow.win + 2);
  });

  test('wide tables scroll horizontally inside their own container', async ({ page }) => {
    await page.goto('/');
    await page.locator('#rankLargeCount').selectOption('10');
    await page.locator('#rankLargeBtn').click();
    await expect(page.locator('#rankLargeBody tr[data-sym]')).toHaveCount(10, { timeout: 60000 });

    // The 11-column ranking table cannot fit 390px and is not meant to: it lives in a
    // .rank-scroll container with its own overflow. What must not happen is the table
    // widening the PAGE instead.
    const scroller = page.locator('.rank-scroll').first();
    await expect(scroller).toBeVisible();
    const canScroll = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    expect(canScroll, 'the rank table is not horizontally scrollable').toBe(true);

    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(PHONE.width + 2);

    // Scrolling right must not cost you the row's identity. By the time P/E is on screen
    // the symbol would otherwise be long gone and every row is an anonymous line of
    // numbers, which is the whole reason Screener.in pins its first column.
    const pin = await scroller.evaluate(async (el) => {
      const cell = el.querySelector('tbody tr td:first-child');
      const before = cell.getBoundingClientRect().left;
      el.scrollLeft = 600;
      await new Promise((r) => setTimeout(r, 200));
      const style = window.getComputedStyle(cell);
      return {
        moved: Math.abs(cell.getBoundingClientRect().left - before),
        position: style.position,
        // Translucent would let the sliding columns show through the pinned text.
        opaque: !/rgba\(.*,\s*0(\.\d+)?\)$/.test(style.backgroundColor),
        scrolled: el.scrollLeft
      };
    });
    expect(pin.scrolled, 'the scroller did not actually move').toBeGreaterThan(100);
    expect(pin.position).toBe('sticky');
    expect(pin.moved, 'the symbol column scrolled away with the rest').toBeLessThan(2);
    expect(pin.opaque, 'the pinned cell is see-through').toBe(true);
  });

  test('a watchlist row is a compact quote row, not a stack of labelled lines', async ({ page }) => {
    // The generic mobile rule turns every table.book cell into its own labelled line. For
    // the 13-column screener that is the wrong trade but an understandable one; for a
    // 5-column quote list it was indefensible — one holding filled 169px, so a phone
    // showed two names. This asserts the shape that replaced it: one grid row, both lines
    // of it, well under the height of the old stack.
    await page.goto('/');
    const row = page.locator('#watchlistBody tr.rowlink').first();
    await expect(row).toBeVisible();

    expect(await row.evaluate((el) => window.getComputedStyle(el).display)).toBe('grid');

    const height = await row.evaluate((el) => el.getBoundingClientRect().height);
    expect(height, 'the watchlist row has gone back to stacking').toBeLessThan(90);

    // The data-label prefixes belong to the stacked layout and must not print here.
    const pseudo = await row.evaluate((el) =>
      window.getComputedStyle(el.querySelector("td.sym"), "::before").content);
    expect(['none', 'normal']).toContain(pseudo);

    // Price and percent both right-align to the same edge, and nothing reaches past the
    // viewport — the failure mode of a grid whose columns are sized by content.
    const geom = await row.evaluate((el) => ({
      price: el.querySelector('td.price').getBoundingClientRect().right,
      pct: el.querySelector('td.chg.pct').getBoundingClientRect().right,
      rowRight: el.getBoundingClientRect().right
    }));
    expect(Math.abs(geom.price - geom.pct)).toBeLessThan(2);
    expect(geom.rowRight).toBeLessThanOrEqual(PHONE.width + 2);
  });

  test('the detail panel stays within the viewport', async ({ page }) => {
    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expect(page.locator('#detailCard .detail-head')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#thesisBlock')).toBeVisible({ timeout: 25000 });

    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth, 'the detail panel overflows the phone viewport').toBeLessThanOrEqual(PHONE.width + 2);
  });
});
