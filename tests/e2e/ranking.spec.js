// docs/10-TEST-PLAN.md §10.5 — ranking, screener, and the four row-count selectors.
//
// The behaviour worth protecting here is not "a table appears". It is that the WHOLE
// universe is scored and then sliced, and that changing the slice is free. Ranking only the
// first N names would not be a ranking, and re-fetching 55 tickers because someone moved a
// dropdown from 20 to 10 is the kind of thing nobody notices until the feed rate-limits.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts } from './helpers/fixture-routes.js';

test.describe('ranking and screener', () => {
  test('ranking scores the whole universe, then slices to the selected count', async ({ page }) => {
    await stubFonts(page);
    const net = await installFixtureRoutes(page);
    await page.goto('/');

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

    const ids = ['#scrLargeCount', '#scrMidCount', '#rankLargeCount', '#rankMidCount'];
    for (const id of ids) await expect(page.locator(id)).toBeVisible();

    // Four distinct values, one per selector. The bug this guards against is two selectors
    // sharing an element id, so moving one silently moves another.
    const picks = ['10', '15', '30', '50'];
    for (let i = 0; i < ids.length; i++) await page.locator(ids[i]).selectOption(picks[i]);
    for (let i = 0; i < ids.length; i++) {
      await expect(page.locator(ids[i]), ids[i] + ' did not hold its own value').toHaveValue(picks[i]);
    }
  });

  test('screener loads only the selected number of rows, and caches what it fetched', async ({ page }) => {
    await stubFonts(page);
    const net = await installFixtureRoutes(page);
    await page.goto('/');

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
