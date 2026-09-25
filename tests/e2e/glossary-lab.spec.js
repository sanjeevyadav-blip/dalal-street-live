// The probability lab's glossary terms — EPIC-5 E5-4, CLAUDE.md hard rule 5.
//
// Rule 5 says glossary entries must warn about misreadings, not merely define terms. For the
// lab that is the whole point: every model it renders is easy to over-read, and the tooltip
// is where a reader lands when they do not recognise a name.
//
// These specs also check the thing that is easy to get wrong by accident — that the terms
// reach the Glossary SECTION and not just the tooltips. The three older extendGlossaryFor*
// functions run after mountGlossary and so their terms never appear in the section, which is
// a long-standing finding in CLAUDE.md. New terms must not join it.

import { test, expect } from '@playwright/test';
import { installFixtureRoutes, stubFonts, showTab, expectBlockVisible } from './helpers/fixture-routes.js';

const LAB_TERMS = [
  'Geometric Brownian motion',
  'GARCH(1,1)',
  'Regime model',
  'Walk-forward classifier',
  'Blended probability',
  'DCF Monte Carlo',
  'State separation',
  'Brier score'
];

test.describe('probability lab glossary', () => {
  test.beforeEach(async ({ page }) => {
    await stubFonts(page);
    await installFixtureRoutes(page);
  });

  test('every lab term reaches the Glossary section, not just the tooltips', async ({ page }) => {
    await page.goto('/');
    await showTab(page, 'more');
    const section = page.locator('#glossarySection');
    await expect(section).toBeVisible({ timeout: 15000 });
    const text = await section.innerText();
    for (const term of LAB_TERMS){
      expect(text, term + ' is missing from the Glossary section').toContain(term);
    }
  });

  test('the entries warn about misreadings rather than only defining', async ({ page }) => {
    await page.goto('/');
    const text = await page.locator('#glossarySection').innerText();

    // Each of these is the specific misreading the entry exists to prevent.
    expect(text).toMatch(/understates the chance of a big move/i);       // GBM
    expect(text).toMatch(/not an out-of-sample judgement/i);             // regime model
    expect(text).toMatch(/No edge is the normal, expected result/i);     // classifier
    expect(text).toMatch(/Trust it less than the rows above/i);          // blend
    expect(text).toMatch(/NOT a probability the share price rises/i);    // DCF Monte Carlo
    expect(text).toMatch(/treat that probability as noise/i);            // state separation
    expect(text).toMatch(/right about direction while being far too confident/i); // Brier
  });

  test('every term added after mountGlossary reaches the section too', async ({ page }) => {
    // The long-standing bug: mountGlossary read GLOSSARY once, and the four
    // extendGlossaryFor* calls run after it, so thirteen terms were tooltips and nothing
    // else. These are one term from each of those four functions — if the list is ever
    // built before they register again, this fails.
    await page.goto('/');
    const text = await page.locator('#glossarySection').innerText();
    for (const term of [
      'Probability of a rise in one week',   // extendGlossaryForRanking
      'Distance from the 52-week high',      // extendGlossaryForScreener
      'Row count',                           // extendGlossaryForRowCount
      'Brier score'                          // extendGlossaryForLab
    ]){
      expect(text, term + ' is registered after mountGlossary and is missing from the section')
        .toContain(term);
    }
  });

  test('the manual still sits above the glossary, and both above the controls', async ({ page }) => {
    // The trap in the documented fix. mountManual positions itself with
    // insertBefore(#glossarySection), so moving mountGlossary to the end of bootstrap —
    // the remedy CLAUDE.md recorded — would leave the manual appended at the foot of the
    // page instead. Rebuilding only the LIST avoids that, and this is what proves it.
    await page.goto('/');
    await showTab(page, 'more');
    // querySelectorAll returns document order, which is what "sits above" means and is
    // what this test is actually about. It used to walk wrap.children, and that stopped
    // seeing anything once the phone shell nested these three inside a .tabpanel — the
    // reading order was unchanged, but the assertion was looking one level too high.
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('#manualSection, #glossarySection, .wrap .controls')]
        .map((el) => el.id === 'manualSection' ? 'manual'
          : el.id === 'glossarySection' ? 'glossary' : 'controls'));
    expect(order).toEqual(['manual', 'glossary', 'controls']);
  });

  test('the glossary search still filters after the list is rebuilt', async ({ page }) => {
    // renderGlossaryList replaces every .gloss-entry under the search box. The listener is
    // bound to the input and queries the entries at keystroke time, so it survives — but
    // that is the thing a rebuild is most likely to break.
    await page.goto('/');
    await showTab(page, 'more');
    const entries = page.locator('#glossList .gloss-entry');
    const total = await entries.count();
    expect(total).toBeGreaterThan(50);

    await page.locator('#glossSearch').fill('brier');
    await expect(entries.filter({ hasText: 'Brier' }).first()).toBeVisible();
    const visible = await entries.evaluateAll((els) =>
      els.filter((el) => el.style.display !== 'none').length);
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(total);
  });

  test('lab metric labels carry a tooltip marker', async ({ page }) => {
    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expectBlockVisible(page, '#labBlock', 25000);
    await expect(page.locator('#labBody')).not.toContainText('Running the models', { timeout: 30000 });

    // annotateGlossary runs on a debounce after the block renders, and matches by prefix —
    // the lab's labels carry a horizon ("… — P(higher in 21 trading days)") that the
    // glossary key does not, so prefix matching is what makes these attach at all.
    await expect(page.locator('#labBlock .gloss').first()).toBeVisible({ timeout: 15000 });
  });
});
