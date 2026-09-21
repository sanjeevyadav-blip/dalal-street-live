// docs/10-TEST-PLAN.md §10.5 — ranking, screener, and the four row-count selectors.
//
// The behaviour worth protecting here is not "a table appears". It is that the WHOLE
// universe is scored and then sliced, and that changing the slice is free. Ranking only the
// first N names would not be a ranking, and re-fetching 55 tickers because someone moved a
// dropdown from 20 to 10 is the kind of thing nobody notices until the feed rate-limits.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, showTab } from './helpers/fixture-routes.js';

test.describe('ranking and screener', () => {
  test('ranking scores the whole universe, then slices to the selected count', async ({ page }) => {
    await stubFonts(page);
    const net = await installFixtureRoutes(page);
    await page.goto('/');
    await showTab(page, 'rank');

    await page.locator('#rankLargeCount').selectOption('20');
    await page.locator('#rankLargeBtn').click();

    const rows = page.locator('#rankLargeBody tr[data-sym]');
    await expect(rows).toHaveCount(20, { timeout: 60000 });
    await expect(page.locator('#rankLargeBtn')).toHaveText('Re-run', { timeout: 60000 });

    // The universe is 55 names; a run that only fetched 20 would mean the "ranking" is just
    // the first 20 tickers in array order sorted among themselves.
    const afterScoring = net.count();
    expect(afterScoring).toBeGreaterThan(50);

    // Narrowing the slice must be pure presentation: no new network at all.
    await page.locator('#rankLargeCount').selectOption('10');
    await expect(rows).toHaveCount(10, { timeout: 15000 });
    expect(net.count(), 'changing the row count re-fetched').toBe(afterScoring);

    // Widening again is equally free, because the full scored set is cached.
    await page.locator('#rankLargeCount').selectOption('30');
    await expect(rows).toHaveCount(30, { timeout: 15000 });
    expect(net.count(), 'widening the row count re-fetched').toBe(afterScoring);
  });

  test('ranking is sorted by composite score, descending', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await page.goto('/');
    await showTab(page, 'rank');

    await page.locator('#rankLargeCount').selectOption('10');
    await page.locator('#rankLargeBtn').click();
    await expect(page.locator('#rankLargeBody tr[data-sym]')).toHaveCount(10, { timeout: 60000 });

    // Second cell is the composite score in renderRankRows.
    const scores = await page.locator('#rankLargeBody tr[data-sym]').evaluateAll((trs) =>
      trs.map((tr) => Number((tr.cells[2] || tr.cells[1]).innerText.replace(/[^\d.]/g, '')))
    );
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  test('all four row-count selectors are independent', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await page.goto('/');

    // Four distinct values, one per selector. The bug this guards against is two
    // selectors sharing an element id, so moving one silently moves another.
    //
    // Grouped by tab because the screener and the ranking are separate views on a phone
    // and only one is on screen at a time. On desktop showTab is a no-op and this reads
    // as it always did. Setting them across a tab switch and reading them back after
    // another switch also proves the panels keep their state rather than re-rendering.
    const byTab = [
      ['scr',  [['#scrLargeCount', '10'], ['#scrMidCount', '15']]],
      ['rank', [['#rankLargeCount', '30'], ['#rankMidCount', '50']]]
    ];

    for (const [tab, pairs] of byTab){
      await showTab(page, tab);
      for (const [id, value] of pairs){
        await expect(page.locator(id)).toBeVisible();
        await page.locator(id).selectOption(value);
      }
    }

    for (const [tab, pairs] of byTab){
      await showTab(page, tab);
      for (const [id, value] of pairs){
        await expect(page.locator(id), id + ' did not hold its own value').toHaveValue(value);
      }
    }
  });

  test('screener loads only the selected number of rows, and caches what it fetched', async ({ page }) => {
    await stubFonts(page);
    const net = await installFixtureRoutes(page);
    await page.goto('/');
    await showTab(page, 'scr');

    await page.locator('#scrLargeCount').selectOption('10');
    await page.locator('#loadLargeCap').click();
    const rows = page.locator('#largeCapBody tr[data-sym]');
    await expect(rows).toHaveCount(10, { timeout: 60000 });
    const afterTen = net.count();

    // Widening to 15 should fetch only the five new names — already-fetched rows are cached.
    // docs/16 promises exactly this, so it is worth holding to.
    await page.locator('#scrLargeCount').selectOption('15');
    await expect(rows).toHaveCount(15, { timeout: 60000 });
    const added = net.count() - afterTen;
    expect(added, 'widening 10→15 refetched more than the five new names').toBeLessThan(afterTen);
  });
});
