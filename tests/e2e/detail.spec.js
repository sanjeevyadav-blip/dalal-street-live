// docs/10-TEST-PLAN.md §10.5 — search into the detail panel, and everything it renders.
//
// The detail panel is where the five render blocks land, and since PR-8 they are driven by
// the DETAIL_BLOCKS list rather than four wrap-by-reassignments. tests/unit/detail-order.js
// pins that order in happy-dom; these specs check the same thing where it matters, with real
// layout, real canvases and real timers.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, expectBlockVisible, showTab } from './helpers/fixture-routes.js';

async function openReliance(page) {
  await page.goto('/');
  await page.locator('#searchInput').fill('reli');
  const suggestion = page.locator('#suggestions .item').first();
  await expect(suggestion).toBeVisible({ timeout: 5000 });
  await expect(suggestion.locator('.sy')).toHaveText('RELIANCE');
  await suggestion.click();
  await expect(page.locator('#detailCard .detail-head')).toBeVisible({ timeout: 15000 });
}

test.describe('detail panel', () => {
  test.beforeEach(async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
  });

  test('search "reli" → suggestion → click → detail panel opens', async ({ page }) => {
    await openReliance(page);
    await expect(page.locator('#detailCard')).toContainText('RELIANCE');
    // The price hero is the one thing that must never be blank: it is the reason the panel
    // was opened.
    await expect(page.locator('#detailCard .price-hero .big')).toHaveText(/₹\s*[\d,]/);
  });

  test('one letter offers nothing; two letters find a two-letter ticker', async ({ page }) => {
    // The threshold was three. It is two now, because LT and MM are real tickers and an
    // exact-ticker match ranks first, so a short query no longer buries the right answer.
    await page.goto('/');
    await page.locator('#searchInput').fill('l');
    await expect(page.locator('#suggestions .item')).toHaveCount(0);
    await page.locator('#searchInput').fill('lt');
    await expect(page.locator('#suggestions .item').first().locator('.sy')).toHaveText('LT');
  });

  test('renders every block: chart, snapshot, DCF, earnings quality, options, factors, thesis', async ({ page }) => {
    await openReliance(page);

    // Charts: four canvases, all with real pixel dimensions. A canvas that exists but was
    // never sized is the signature of drawChart bailing out early.
    for (const id of ['#priceChart', '#volumeChart', '#rsiChart', '#macdChart']) {
      const box = await page.locator(id).boundingBox();
      expect(box, id + ' has no layout box').not.toBeNull();
      expect(box.width, id + ' has zero width').toBeGreaterThan(0);
      expect(box.height, id + ' has zero height').toBeGreaterThan(0);
    }

    await expectBlockVisible(page, '#snapBlock', 20000);
    await expectBlockVisible(page, '#dcfBlock', 20000);
    await expectBlockVisible(page, '#eqBlock', 20000);
    await expectBlockVisible(page, '#optBlock', 20000);
    await expectBlockVisible(page, '#facBlock', 20000);
    await expectBlockVisible(page, '#thesisBlock', 20000);

    // None of them may still be sitting on their placeholder text.
    await expect(page.locator('#dcfBlock')).not.toContainText('Pulling multi-year cash flows', { timeout: 20000 });
    await expect(page.locator('#optBlock')).not.toContainText('Pulling the live NSE option chain', { timeout: 20000 });
  });

  test('the snapshot sits above the chart, not appended below it', async ({ page }) => {
    await openReliance(page);
    await expectBlockVisible(page, '#snapBlock', 20000);
    // renderSnapshot inserts itself before .chart-block rather than appending, so its
    // position does not depend on how long its fetches took. §22 REFACTOR-PLAN §4 spells
    // this out after §2.2 got it wrong; this is the assertion that keeps it honest.
    const order = await page.evaluate(() => {
      const snap = document.getElementById('snapBlock');
      const chart = document.querySelector('.chart-block');
      if (!snap || !chart) return null;
      // Node.DOCUMENT_POSITION_FOLLOWING === 4
      return (snap.compareDocumentPosition(chart) & 4) !== 0 ? 'snapshot-first' : 'chart-first';
    });
    expect(order).toBe('snapshot-first');
  });

  test('the verdict panel reports pillars separately and refuses to synthesise one', async ({ page }) => {
    await openReliance(page);
    await expectBlockVisible(page, '#thesisBlock', 20000);
    // Every block appends its placeholder synchronously and fills in after its fetches, so
    // the element being visible is not the same as the element being finished. Waiting on
    // the placeholder clearing is what makes this deterministic on a slower mobile run.
    await expect(page.locator('#thesisBlock')).not.toContainText('Assembling the walkthrough', { timeout: 25000 });
    const thesis = await page.locator('#thesisBlock').innerText();

    // CLAUDE.md hard rule 1 / ADR-003. Note what is NOT asserted here: a blanket ban on the
    // words buy/sell/hold. The panel's own copy says "Why there is no single BUY / HOLD /
    // AVOID here", and the Street view pillar reports Yahoo's analyst consensus — which can
    // legitimately read "strong buy" because it is someone else's call, attributed, not this
    // page's. A keyword ban would fail on the very text that implements the rule. What the
    // rule actually requires is that the page states the pillars and declines the synthesis.
    expect(thesis).toContain('Earnings quality');
    expect(thesis).toContain('Momentum');
    expect(thesis).toContain('Valuation (DCF)');
    expect(thesis).toContain('Risk');
    expect(thesis).toMatch(/no single BUY \/ HOLD \/ AVOID/);
    expect(thesis).toMatch(/SEBI-registered research analysts/i);

    // If the street view pillar is shown at all, it must carry its attribution — an
    // unattributed "strong buy" would read as this page's own verdict.
    if (/street view/i.test(thesis)) {
      expect(thesis).toMatch(/Consensus ₹[\d,]+ from .* analysts/i);
    }
  });

  test('options block says "no contracts" for a non-F&O stock rather than zeros', async ({ page }) => {
    await page.goto('/');
    // PERSISTENT has a fixture but, per the route table, no listed option chain — which is
    // how NSE answers for the ~1,900 names outside F&O. The failure this guards against is
    // a table of 0.00s that looks like data.
    await page.locator('#searchInput').fill('persistent');
    const suggestion = page.locator('#suggestions .item').first();
    await expect(suggestion).toBeVisible({ timeout: 5000 });
    await suggestion.click();
    await expectBlockVisible(page, '#optBlock', 20000);
    await expect(page.locator('#optBody')).toContainText('No F&O contracts listed', { timeout: 20000 });
    await expect(page.locator('#optBlock table')).toHaveCount(0);
  });

  test('position sizing: 500000 capital at 1% risk with a stop below price gives a plausible size', async ({ page }) => {
    await openReliance(page);
    // Inside the thesis walkthrough, which is on the Valuation tab on a phone.
    await expectBlockVisible(page, '#psCalc', 20000);

    const price = await page.locator('#detailCard .price-hero .big').innerText();
    const spot = Number(price.replace(/[^\d.]/g, ''));
    expect(spot).toBeGreaterThan(0);
    const stop = Math.round(spot * 0.95);          // 5% below spot
    const capital = 500000, riskPct = 1;

    await page.locator('#psCapital').fill(String(capital));
    await page.locator('#psRisk').fill(String(riskPct));
    await page.locator('#psStop').fill(String(stop));
    await page.locator('#psCalc').click();

    const out = page.locator('#psOut');
    await expect(out).toBeVisible();

    // Start-anchored, NOT end-anchored. annotateGlossary appends an "i" tooltip marker into
    // every `.metric .k` a second or so after the block renders, so the label's text content
    // becomes "Amount at riski". An end-anchored match passes or fails depending on whether
    // the annotator got there first — which is exactly the kind of flake that teaches people
    // to re-run the suite instead of reading it.
    const metric = (label) => out.locator('.metric', { has: page.locator('.k', { hasText: new RegExp('^' + label, 'i') }) }).locator('.v');
    const num = async (label) => Number((await metric(label).innerText()).replace(/[^\d.]/g, ''));

    // The arithmetic is fixed and checkable: rupees at risk / rupees per share.
    const riskAmt = await num('Amount at risk');
    const perShare = await num('Risk per share');
    const shares = await num('Shares');
    const value = await num('Position value');

    expect(riskAmt).toBeCloseTo(capital * riskPct / 100, 0);
    expect(perShare).toBeCloseTo(spot - stop, 0);
    expect(shares).toBe(Math.floor(riskAmt / perShare));
    expect(shares).toBeGreaterThan(0);

    // Position value must be consistent with the share count, and must never exceed the
    // capital on hand — a tight stop producing a position larger than the account is the
    // failure mode the glossary entry for "position value" warns about.
    expect(value).toBeCloseTo(shares * spot, -1);
    expect(value).toBeLessThanOrEqual(capital);
  });
});

test.describe('valuation refusals', () => {
  test.beforeEach(async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
  });

  test('a bank is told why it gets no DCF, rather than being given one', async ({ page }) => {
    // HDFCBANK used to receive an intrinsic value with growth pinned at the +20% cap,
    // computed from cash-flow swings that mostly track loan-book growth. CLAUDE.md
    // invariant 3: a filled cell has to be real, and that one was not.
    await page.goto('/');
    await page.locator('#searchInput').fill('hdfcbank');
    await page.locator('#suggestions .item').first().click();
    await expectBlockVisible(page, '#dcfBlock', 25000);
    await expect(page.locator('#dcfBlock')).not.toContainText('Pulling multi-year cash flows', { timeout: 25000 });

    const dcf = await page.locator('#dcfBlock').innerText();
    expect(dcf).toMatch(/not a meaningful way to value a bank/i);
    // And it must explain rather than merely refuse.
    expect(dcf).toMatch(/deposits and loan originations/i);
    // No intrinsic value anywhere in the block.
    expect(dcf).not.toMatch(/Intrinsic value/i);
  });

  test('a non-financial still gets its DCF', async ({ page }) => {
    // The guard has to be narrow. One that quietly stopped valuing ordinary companies
    // would look deliberate and nobody would notice.
    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expect(page.locator('#dcfBlock')).toContainText('Intrinsic value', { timeout: 25000 });
  });
});

test.describe('shareholding', () => {
  test('shows the promoter trend by quarter and the pledge as a share of the promoter stake', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await openReliance(page);

    const block = await expectBlockVisible(page, '#shareBlock', 20000);
    await expect(block.locator('.share-table')).toBeVisible({ timeout: 20000 });
    // Eight quarters, newest first, one per quarter even though RELIANCE filed off-cycle.
    await expect(block.locator('.share-table tbody tr')).toHaveCount(8);
    await expect(block.locator('.share-table tbody tr').first()).toContainText('Jun 2026');
    // The fixture's pledge is 2.6% of the promoter's stake and 1.35% of all shares.
    await expect(block).toContainText(/2\.6%/);
    await expect(block).toContainText(/of the promoter’s stake/);
    // The gap in the data is stated, not left as an empty column.
    await expect(block).toContainText(/foreign and domestic institutions/);
  });
});

test.describe('compare two stocks', () => {
  test('picks a second stock and shows both side by side, with no winner', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await openReliance(page);

    await expectBlockVisible(page, '#compareBlock', 20000);
    await page.locator('#cmpInput').fill('tcs');
    const pick = page.locator('#cmpSuggest .item').first();
    await expect(pick.locator('.sy')).toHaveText('TCS');
    await pick.click();

    const table = page.locator('#cmpOut .compare-table');
    await expect(table).toBeVisible({ timeout: 25000 });
    await expect(table.locator('thead th')).toHaveCount(3);
    await expect(table.locator('thead th').nth(1)).toContainText('RELIANCE');
    await expect(table.locator('thead th').nth(2)).toContainText('TCS');
    // Neutral by design: the only colouring is the sign of a return.
    await expect(page.locator('#cmpOut')).not.toContainText(/winner|recommend/i);

    // It must fit a phone without widening the page.
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(docWidth).toBeLessThanOrEqual(2);
  });
});

test.describe('price alerts', () => {
  test('set from a stock page, listed on Top 20, refused on the wrong side, removable', async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
    await openReliance(page);

    await page.locator('#alertFromDetail').click();
    const input = page.locator('#alertPrice');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    const spot = Number((await page.locator('#detailCard .price-hero .big').innerText()).replace(/[^\d.]/g, ''));
    expect(spot).toBeGreaterThan(0);

    // "Above" a level below the price would fire on the next check: refused, with a reason.
    await page.locator('#alertDir').selectOption('above');
    await input.fill(String(Math.floor(spot * 0.9)));
    await page.locator('#alertForm button[type="submit"]').click();
    await expect(page.locator('#alertMsg')).toContainText('already at or below');
    await expect(page.locator('#alertBlock .al-row')).toHaveCount(0);

    // A sensible one is accepted and shown on the stock page.
    const level = Math.ceil(spot * 1.1);
    await input.fill(String(level));
    await page.locator('#alertForm button[type="submit"]').click();
    await expect(page.locator('#alertMsg')).toContainText('Alert set');
    await expect(page.locator('#alertBlock .al-row')).toHaveCount(1);
    await expect(page.locator('#alertBlock .al-row')).toContainText('above');
    await expect(page.locator('#alertBlock .al-row')).toContainText('Watching');

    // And in the list on the Top 20 tab (on a phone, behind the Back button).
    const back = page.locator('.detail-back');
    if (await back.isVisible().catch(() => false)) await back.click();
    await showTab(page, 'top20');
    const row = page.locator('#alertsSection .al-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('RELIANCE');

    // It survives a reload: stored on the device.
    await page.reload();
    await showTab(page, 'top20');
    await expect(page.locator('#alertsSection .al-row')).toHaveCount(1);

    // Removing it clears it.
    await page.locator('#alertsSection [data-remove-alert]').click();
    await expect(page.locator('#alertsSection .al-row')).toHaveCount(0);
    await expect(page.locator('#alertsSection')).toContainText('No alerts yet');
  });
});
