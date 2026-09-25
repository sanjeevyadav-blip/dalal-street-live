// The probability lab in a real browser — EPIC-5 story E5-4.
//
// The acceptance is "each model states its assumptions and limitations", which is a claim
// about what is ON SCREEN. A unit test on the model objects cannot check it, and a rendering
// test that only asserts the numbers appear would let the caveats be dropped silently.
//
// So these specs assert the caveats as strictly as the figures, and assert the two hard
// rules the block is most likely to breach as it grows: no price target, and no verdict.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, expectBlockVisible } from './helpers/fixture-routes.js';

async function openLab(page, query = 'reli'){
  await page.goto('/');
  await page.locator('#searchInput').fill(query);
  await page.locator('#suggestions .item').first().click();
  await expectBlockVisible(page, '#labBlock', 25000);
  await expect(page.locator('#labBody')).not.toContainText('Running the models', { timeout: 30000 });
  return page.locator('#labBlock');
}

test.describe('probability lab', () => {
  test.beforeEach(async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
  });

  test('renders after the original detail blocks, never before them', async ({ page }) => {
    const lab = await openLab(page);
    await expect(lab).toBeVisible();
    // The PR-8 render order is a parity contract. A new block must append, not interleave.
    const order = await page.evaluate(() => {
      const lab = document.getElementById('labBlock');
      const factors = document.getElementById('facBlock');
      if (!lab || !factors) return null;
      return (factors.compareDocumentPosition(lab) & 4) !== 0 ? 'lab-after' : 'lab-before';
    });
    expect(order).toBe('lab-after');
  });

  test('every model states what it assumes and how it fails', async ({ page }) => {
    const lab = await openLab(page);
    const text = await lab.innerText();

    // One "Assumes:" and one "Fails when:" per model card. If a card renders without them
    // the block has stopped meeting its own acceptance criterion.
    const assumes = (text.match(/Assumes:/g) || []).length;
    const fails = (text.match(/Fails when:/g) || []).length;
    expect(assumes).toBeGreaterThanOrEqual(3);
    expect(fails).toBe(assumes);
  });

  test('labels everything as model output rather than forecast', async ({ page }) => {
    const lab = await openLab(page);
    await expect(lab).toContainText('model output, not forecast');
    await expect(lab).toContainText('21 trading days');
  });

  test('names at least the four direction models', async ({ page }) => {
    const lab = await openLab(page);
    const text = await lab.innerText();
    expect(text).toMatch(/Geometric Brownian motion/i);
    expect(text).toMatch(/GARCH/i);
    expect(text).toMatch(/Hidden Markov|regime/i);
    expect(text).toMatch(/classifier/i);
  });

  test('says why the options-implied probability is not blended in', async ({ page }) => {
    // CLAUDE.md invariant 4. Risk-neutral and real-world probabilities are different
    // quantities; mixing them would produce a number that is neither, and the block has to
    // say so rather than quietly omitting it.
    const lab = await openLab(page);
    await expect(lab).toContainText('risk-neutral');
    await expect(lab).toContainText(/not.{0,20}blended/i);
  });

  test('shows the blend last, and tells the reader to trust it least', async ({ page }) => {
    const lab = await openLab(page);
    const text = await lab.innerText();
    // Anchored on "weighted log-odds", which appears only on the ensemble card. The word
    // "blended" alone is no good: the intro note uses it too, explaining why the
    // options-implied probability is NOT blended in, and that sentence comes first.
    //
    // Compared in upper case because `.k` labels are uppercased by CSS and innerText returns
    // rendered text, so a case-sensitive indexOf silently compares against -1.
    const upper = text.toUpperCase();
    const blendAt = upper.indexOf('WEIGHTED LOG-ODDS');
    if (blendAt !== -1){
      expect(text).toMatch(/Read this last, and least/i);
      expect(text).toMatch(/overstates confidence/i);
      // The models must be shown individually above the blend, same reasoning as the
      // verdict panel: where they conflict, the conflict is the finding.
      const firstAssumes = upper.indexOf('ASSUMES:');
      expect(firstAssumes).toBeGreaterThan(-1);
      expect(firstAssumes).toBeLessThan(blendAt);
    }
  });

  test('reports the classifier honestly when it has no edge', async ({ page }) => {
    const lab = await openLab(page);
    const text = await lab.innerText();
    if (/No edge/i.test(text)){
      // A classifier with no demonstrated edge must not also be voting in the blend.
      expect(text).toMatch(/excluded from the blend/i);
    }
    // Either way the base rate has to be on screen: accuracy without it means nothing.
    expect(text).toMatch(/base rate/i);
  });

  test('states no price target and no probability of reaching a level', async ({ page }) => {
    // CLAUDE.md hard rule 2. scripts/check-invariants.sh guards the source; this guards what
    // a reader is actually shown, which is where the rule would really be broken.
    const lab = await openLab(page);
    const text = await lab.innerText();
    expect(text).not.toMatch(/target price|price target/i);
    expect(text).not.toMatch(/probability of reaching/i);
    expect(text).not.toMatch(/will (reach|hit|rise to|fall to)/i);
    // The direction models express spread as a percentage, never as a rupee destination.
    expect(text).toMatch(/Middle 90% of simulated outcomes/i);
  });

  test('draws no buy, sell or hold conclusion', async ({ page }) => {
    // Hard rule 1. Unlike the verdict panel, this block has no legitimate reason to use
    // those words at all — it has no attributed analyst consensus to report.
    const lab = await openLab(page);
    const text = await lab.innerText();
    expect(text).not.toMatch(/\b(buy|sell|hold|avoid)\b/i);
  });

  test('the DCF Monte Carlo reports a spread, not a fair value', async ({ page }) => {
    const lab = await openLab(page);
    const text = await lab.innerText();
    if (/DCF Monte Carlo/i.test(text)){
      expect(text).toMatch(/10th percentile/i);
      expect(text).toMatch(/90th/i);
      expect(text).toMatch(/not a probability the price rises/i);
      // The priors must travel with the number: a probability from chosen priors is
      // meaningless without them.
      expect(text).toMatch(/Growth drawn/i);
    }
  });

  test('degrades to an explanation when there is too little history', async ({ page }) => {
    // The models need more history than the shortest fixture range provides. What must not
    // happen is a block of blanks or, worse, numbers computed from nothing.
    // Re-routed from the fixtures rather than with route.fetch(), which would bypass the
    // interception and reach the real Yahoo.
    await installFixtureRoutes(page, { historyBars: 20 });
    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expectBlockVisible(page, '#labBlock', 25000);
    await expect(page.locator('#labBody')).toContainText('Not enough price history', { timeout: 30000 });
  });
});
