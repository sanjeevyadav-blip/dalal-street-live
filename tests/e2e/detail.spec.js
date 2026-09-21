// docs/10-TEST-PLAN.md §10.5 — search into the detail panel, and everything it renders.
//
// The detail panel is where the five render blocks land, and since PR-8 they are driven by
// the DETAIL_BLOCKS list rather than four wrap-by-reassignments. tests/unit/detail-order.js
// pins that order in happy-dom; these specs check the same thing where it matters, with real
// layout, real canvases and real timers.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts } from './helpers/fixture-routes.js';

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

  test('typing fewer than three letters offers no suggestions', async ({ page }) => {
    await page.goto('/');
    await page.locator('#searchInput').fill('re');
    await expect(page.locator('#suggestions .item')).toHaveCount(0);
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

    await expect(page.locator('#snapBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#dcfBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#eqBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#optBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#facBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#thesisBlock')).toBeVisible({ timeout: 20000 });

    // None of them may still be sitting on their placeholder text.
    await expect(page.locator('#dcfBlock')).not.toContainText('Pulling multi-year cash flows', { timeout: 20000 });
    await expect(page.locator('#optBlock')).not.toContainText('Pulling the live NSE option chain', { timeout: 20000 });
  });

  test('the snapshot sits above the chart, not appended below it', async ({ page }) => {
    await openReliance(page);
    await expect(page.locator('#snapBlock')).toBeVisible({ timeout: 20000 });
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
    await expect(page.locator('#thesisBlock')).toBeVisible({ timeout: 20000 });
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
    await expect(page.locator('#optBlock')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#optBody')).toContainText('No F&O contracts listed', { timeout: 20000 });
    await expect(page.locator('#optBlock table')).toHaveCount(0);
  });

  test('position sizing: 500000 capital at 1% risk with a stop below price gives a plausible size', async ({ page }) => {
    await openReliance(page);
    await expect(page.locator('#psCalc')).toBeVisible({ timeout: 20000 });

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
    await expect(page.locator('#dcfBlock')).toBeVisible({ timeout: 25000 });
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
