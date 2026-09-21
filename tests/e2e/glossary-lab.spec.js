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
import { installFixtureRoutes, stubFonts } from './helpers/fixture-routes.js';

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

  test('lab metric labels carry a tooltip marker', async ({ page }) => {
    await page.goto('/');
    await page.locator('#searchInput').fill('reli');
    await page.locator('#suggestions .item').first().click();
    await expect(page.locator('#labBlock')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('#labBody')).not.toContainText('Running the models', { timeout: 30000 });

    // annotateGlossary runs on a debounce after the block renders, and matches by prefix —
    // the lab's labels carry a horizon ("… — P(higher in 21 trading days)") that the
    // glossary key does not, so prefix matching is what makes these attach at all.
    await expect(page.locator('#labBlock .gloss').first()).toBeVisible({ timeout: 15000 });
  });
});
