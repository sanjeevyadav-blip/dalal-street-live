// docs/10-TEST-PLAN.md §10.5 — the mobile layer at 390×844 (iPhone 12/13/14 class).
//
// mobileLayer() injects a stylesheet and a bottom nav at runtime rather than shipping them
// in the markup, so none of this exists until the module runs. A happy-dom test cannot see
// any of it: there is no layout, so "does the table overflow the viewport" has no answer.
// This is the one part of the suite that genuinely needs a browser.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, expectBlockVisible } from './helpers/fixture-routes.js';

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
    // The ranking lives on its own tab now, and opening the tab runs it — no Load press.
    await page.locator('#mnav a[data-tab="rank"]').click();
    await page.locator('#rankLargeCount').selectOption('10');
    await page.locator('#rankLargeBtn').click();
    await expect(page.locator('#rankLargeBody tr[data-sym]')).toHaveCount(10, { timeout: 90000 });

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

    // Let the list settle before measuring. renderWatchlist replaces the whole tbody each
    // time a quote lands, so a row read mid-flight can be detached by the time the
    // evaluate runs — and a detached node reports no computed style at all, which showed
    // up as display:"" only under parallel load. Waiting for the last quote removes the
    // race rather than retrying around it.
    await expect(page.locator('#watchlistBody td.price.loading-dots')).toHaveCount(0, { timeout: 30000 });

    // One evaluate, so every figure below describes the same element.
    const m = await row.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        display: cs.display,
        height: box.height,
        right: box.right,
        label: window.getComputedStyle(el.querySelector('td.sym'), '::before').content,
        priceRight: el.querySelector('td.price').getBoundingClientRect().right,
        pctRight: el.querySelector('td.chg.pct').getBoundingClientRect().right
      };
    });

    expect(m.display).toBe('grid');
    expect(m.height, 'the watchlist row has gone back to stacking').toBeLessThan(90);
    // The data-label prefixes belong to the stacked layout and must not print here.
    expect(['none', 'normal']).toContain(m.label);
    // Price and percent both right-align to the same edge, and nothing reaches past the
    // viewport — the failure mode of a grid whose columns are sized by content.
    expect(Math.abs(m.priceRight - m.pctRight)).toBeLessThan(2);
    expect(m.right).toBeLessThanOrEqual(PHONE.width + 2);
  });

  test('the five tabs each show one view, and only one', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('#mnav a');
    await expect(nav).toHaveCount(5);
    await expect(nav).toHaveText([/Top 20/, /IPO/, /Top perf/, /Screener/, /News/]);

    for (const id of ['top20', 'ipo', 'rank', 'scr', 'more']){
      await page.locator(`#mnav a[data-tab="${id}"]`).click();
      const visible = await page.evaluate(() =>
        [...document.querySelectorAll('.tabpanel')]
          .filter((p) => window.getComputedStyle(p).display !== 'none')
          .map((p) => p.getAttribute('data-tab')));
      expect(visible, `tab ${id} did not show exactly one panel`).toEqual([id]);
      // The summary is the point of the top strip: it must survive every switch.
      await expect(page.locator('#indicesGrid.summary')).toBeVisible();
    }
  });

  test('opening a tab loads it, with no Load button to press', async ({ page }) => {
    // The old shell scrolled to a section that said "Not loaded yet — pick a count and
    // click Load", which on a phone is a dead end you have to know your way out of.
    await page.goto('/');

    // Top 20 is the landing tab, so it fills itself without any interaction at all.
    await expect(page.locator('#top20Body tr')).toHaveCount(20, { timeout: 60000 });
    await expect(page.locator('#top20Body tr td.price').first()).not.toHaveClass(/loading-dots/, { timeout: 60000 });

    // The IPO fixture returns an empty list on purpose, so the proof that the tab loaded
    // itself is that the fetch RAN and resolved — the button leaves its "Load IPOs" text
    // and the block stops saying "not loaded yet". Asserting on cards would be asserting
    // on the fixture's contents, and would pass for the wrong reason the day it changes.
    await page.locator('#mnav a[data-tab="ipo"]').click();
    await expect(page.locator('#loadIpos')).toHaveText(/Refresh IPOs/, { timeout: 60000 });
    await expect(page.locator('#ipoBlock')).not.toContainText('Not loaded yet');

    await page.locator('#mnav a[data-tab="scr"]').click();
    await expect(page.locator('#largeCapBody tr[data-sym]')).toHaveCount(10, { timeout: 90000 });
  });

  test('a stock opens as its own view, and Back returns to the tab', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('#watchlistBody tr.rowlink').first();
    await expect(row).toBeVisible();
    await row.click();

    const back = page.locator('.detail-back');
    await expect(back).toBeVisible();
    // The list you came from is out of the way, rather than sitting above a panel you
    // have to scroll past to get back to.
    await expect(page.locator('.tabpanel[data-tab="top20"]')).toBeHidden();

    await back.click();
    await expect(back).toBeHidden();
    await expect(page.locator('.tabpanel[data-tab="top20"]')).toBeVisible();
  });

  test('the stock page is split into six tabs, opening on Overview', async ({ page }) => {
    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    const tabs = page.locator('#detailCard .dtabs button');
    await expect(tabs).toHaveCount(6, { timeout: 20000 });
    await expect(tabs).toHaveText(['Overview', 'Technicals', 'Financials', 'Valuation', 'Options', 'News']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    // Price stays on screen whichever tab is chosen; the chart is on Overview only.
    await expect(page.locator('#detailCard .price-hero')).toBeVisible();
    await expect(page.locator('#detailCard .chart-block')).toBeVisible();

    // The option chain is a real block, hidden until its tab is chosen.
    await page.locator('#optBlock').waitFor({ state: 'attached', timeout: 20000 });
    await expect(page.locator('#optBlock')).toBeHidden();
    await page.locator('#detailCard [data-dtab-btn="options"]').click();
    await expect(page.locator('#optBlock')).toBeVisible();
    await expect(page.locator('#detailCard .chart-block')).toBeHidden();
    await expect(page.locator('#detailCard .price-hero')).toBeVisible();
  });

  test('the detail panel stays within the viewport', async ({ page }) => {
    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expect(page.locator('#detailCard .detail-head')).toBeVisible({ timeout: 20000 });
    await expectBlockVisible(page, '#thesisBlock', 25000);

    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth, 'the detail panel overflows the phone viewport').toBeLessThanOrEqual(PHONE.width + 2);
  });
});
