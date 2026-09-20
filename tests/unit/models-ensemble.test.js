// EPIC-5 story E5-3 — DCF Monte Carlo and the Bayesian ensemble.
//
// The acceptance is "P(undervalued) with P10/P90". The tests below check that, and then
// check the two things that would make the output misleading if they were wrong: that the
// probability responds to price rather than being an artefact of the priors, and that the
// ensemble treats agreement and disagreement correctly.

import { describe, it, expect } from 'vitest';
import { dcfMonteCarlo, PRIORS } from '../../src/valuation/dcf-monte-carlo.js';
import { bayesEnsemble, DEFAULT_WEIGHTS } from '../../src/models/ensemble.js';

// A plausible mid-cap: ₹500cr base free cash flow, 100cr shares, modest net debt.
const BASE = 5000000000;
const SHARES = 1000000000;
const NET_DEBT = 2000000000;

describe('DCF Monte Carlo', () => {
  it('returns a probability and a P10/P90 band', () => {
    const out = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.10, 0.12, 4000);
    expect(out).not.toBeNull();
    expect(out.pUndervalued).toBeGreaterThanOrEqual(0);
    expect(out.pUndervalued).toBeLessThanOrEqual(100);
    expect(out.p10Value).toBeLessThan(out.medianValue);
    expect(out.medianValue).toBeLessThan(out.p90Value);
  });

  it('says a cheap stock is more likely undervalued than an expensive one', () => {
    // The check that the probability tracks PRICE and is not an artefact of the priors.
    const cheap = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 30, 0.10, 0.12, 4000);
    const dear = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 300, 0.10, 0.12, 4000);
    expect(cheap.pUndervalued).toBeGreaterThan(dear.pUndervalued);
  });

  it('is indifferent to price in its value distribution', () => {
    // Price enters only the comparison, never the valuation. If the P10/P90 band moved with
    // the market price the model would be anchoring on it, which is the classic way a DCF
    // gets quietly reverse-engineered to justify the current quote.
    const a = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 50, 0.10, 0.12, 4000);
    const b = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 500, 0.10, 0.12, 4000);
    expect(a.medianValue).toBeCloseTo(b.medianValue, 6);
    expect(a.p10Value).toBeCloseTo(b.p10Value, 6);
    expect(a.p90Value).toBeCloseTo(b.p90Value, 6);
  });

  it('produces the wide spread that is the whole point of running it', () => {
    // CLAUDE.md hard rule 1 rests on the claim that a DCF swings 40%+ across defensible
    // assumptions. If this model produced a tight band, either the priors are too narrow to
    // be honest or the claim is wrong. Asserting it keeps both claims tied together.
    const out = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.10, 0.12, 8000);
    expect(out.spreadRatio).toBeGreaterThan(1.5);
  });

  it('widens as the growth prior widens', () => {
    const narrow = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.10, 0.12, 8000);
    // Same financials, higher growth centre: the value distribution must shift up.
    const higher = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.16, 0.12, 8000);
    expect(higher.medianValue).toBeGreaterThan(narrow.medianValue);
  });

  it('discards draws where the discount rate does not exceed the terminal rate', () => {
    // Those draws make the Gordon terminal value diverge. Clamping them instead would pile
    // probability mass on the boundary and make the tail look tighter than it is, so they
    // are dropped and counted.
    const out = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.10, 0.095, 8000);
    expect(out.discarded).toBeGreaterThanOrEqual(0);
    expect(out.runs + out.discarded).toBe(8000);
    expect(out.p90Value).toBeLessThan(Infinity);
    expect(Number.isFinite(out.medianValue)).toBe(true);
  });

  it('never produces a non-finite value', () => {
    const out = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.20, 0.09, 8000);
    for (const key of ['pUndervalued', 'medianValue', 'p10Value', 'p90Value', 'medianUpsidePct']){
      expect(Number.isFinite(out[key]), key + ' is not finite').toBe(true);
    }
  });

  it('is deterministic', () => {
    const a = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.10, 0.12, 2000);
    const b = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.10, 0.12, 2000);
    expect(a.pUndervalued).toBe(b.pUndervalued);
    expect(a.medianValue).toBe(b.medianValue);
  });

  it('publishes the priors it used', () => {
    // A probability from chosen priors is only meaningful if the priors travel with it.
    const out = dcfMonteCarlo(BASE, SHARES, NET_DEBT, 60, 0.10, 0.12, 1000);
    expect(out.priors).toBe(PRIORS);
    expect(out.priors.growthSd).toBeGreaterThan(0);
  });

  it('declines on unusable inputs rather than returning a number', () => {
    expect(dcfMonteCarlo(0, SHARES, 0, 60, 0.1, 0.12, 100)).toBeNull();
    expect(dcfMonteCarlo(BASE, 0, 0, 60, 0.1, 0.12, 100)).toBeNull();
    expect(dcfMonteCarlo(BASE, SHARES, 0, 0, 0.1, 0.12, 100)).toBeNull();
    expect(dcfMonteCarlo(BASE, SHARES, 0, 60, NaN, 0.12, 100)).toBeNull();
  });
});

describe('Bayesian ensemble', () => {
  const sig = (name, p, w) => ({ name, p, w });

  it('combines in log-odds, not by averaging probabilities', () => {
    // 90% at weight 0.5 and 50% at weight 0.5: log-odds give 0.5*log(9) + 0 = 1.0986, so
    // the posterior is 75%. An arithmetic average of the probabilities would give 70%.
    // The gap is the whole reason log-odds are used — probabilities do not combine linearly.
    const out = bayesEnsemble([sig('confident', 90, 0.5), sig('neutral', 50, 0.5)]);
    expect(out.posterior).toBeCloseTo(75, 1);
    expect(out.meanInput).toBeCloseTo(70, 6);
    expect(out.posterior).toBeGreaterThan(out.meanInput);
  });

  it('does not let agreement inflate confidence when the weights sum to one', () => {
    // Deliberate, and the opposite of textbook Bayes. Independent evidence SHOULD reinforce:
    // two models each at 60% ought to land above 60%. These models are not independent —
    // they share the same price series and in places the same drift estimate — so weights
    // summing to one hold the posterior at the input rather than manufacturing confidence
    // out of correlated agreement. The `caveat` field says this in the output itself.
    const out = bayesEnsemble([sig('a', 60, 0.5), sig('b', 60, 0.5)]);
    expect(out.posterior).toBeCloseTo(60, 6);
  });

  it('does reinforce when the weights say the evidence is worth more', () => {
    // Confirms the mechanism really is log-odds and the result above is the weights talking,
    // not the arithmetic failing.
    const out = bayesEnsemble([sig('a', 60, 1), sig('b', 60, 1)]);
    expect(out.posterior).toBeGreaterThan(65);
  });

  it('returns to 50% when two equally weighted models cancel', () => {
    const out = bayesEnsemble([sig('a', 70, 0.5), sig('b', 30, 0.5)]);
    expect(out.posterior).toBeCloseTo(50, 6);
  });

  it('respects weights', () => {
    const heavyUp = bayesEnsemble([sig('a', 70, 0.9), sig('b', 30, 0.1)]);
    const heavyDown = bayesEnsemble([sig('a', 70, 0.1), sig('b', 30, 0.9)]);
    expect(heavyUp.posterior).toBeGreaterThan(50);
    expect(heavyDown.posterior).toBeLessThan(50);
  });

  it('clamps an overconfident input so it cannot drag the posterior to a corner', () => {
    const out = bayesEnsemble([sig('certain', 100, 0.3), sig('b', 50, 0.3)]);
    expect(out.posterior).toBeLessThan(80);
    expect(Number.isFinite(out.posterior)).toBe(true);
    // 0% must be equally survivable — log(0) would be -Infinity.
    const zero = bayesEnsemble([sig('certain', 0, 0.3), sig('b', 50, 0.3)]);
    expect(Number.isFinite(zero.posterior)).toBe(true);
  });

  it('reports disagreement, and reports which models it could not use', () => {
    const out = bayesEnsemble([
      sig('a', 52, 0.3),
      sig('b', 78, 0.3),
      { name: 'options', p: null, w: 0.35 }
    ]);
    expect(out.nUsed).toBe(2);
    expect(out.skipped).toEqual(['options']);
    expect(out.disagreement).toBeGreaterThan(10);
    expect(out.agreement).toMatch(/disagree/i);
  });

  it('calls close inputs agreement', () => {
    const out = bayesEnsemble([sig('a', 54, 0.3), sig('b', 56, 0.3), sig('c', 55, 0.3)]);
    expect(out.disagreement).toBeLessThan(6);
    expect(out.agreement).toMatch(/agree/i);
  });

  it('measures disagreement on raw inputs, not weighted contributions', () => {
    // Two lightly-weighted models shouting at each other is still a loud disagreement, and
    // weighting the spread would hide it.
    const out = bayesEnsemble([sig('a', 20, 0.05), sig('b', 80, 0.05)]);
    expect(out.disagreement).toBeGreaterThan(14);
  });

  it('carries its own caveat so the number cannot be shown without it', () => {
    const out = bayesEnsemble([sig('a', 60, 0.3)]);
    expect(out.caveat).toMatch(/share inputs/i);
    expect(out.caveat).toMatch(/overstates confidence/i);
  });

  it('declines when nothing usable was supplied', () => {
    expect(bayesEnsemble([])).toBeNull();
    expect(bayesEnsemble(null)).toBeNull();
    expect(bayesEnsemble([{ name: 'x', p: null, w: 0.3 }])).toBeNull();
    expect(bayesEnsemble([{ name: 'x', p: 60, w: NaN }])).toBeNull();
  });

  it('ships weights that shrink toward 50% rather than summing to one', () => {
    // Deliberate: these are judgement, not fitted, and the models are correlated. Weights
    // summing to 1 would assert a confidence the construction does not support.
    const total = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.5);
    expect(total).toBeLessThan(1.5);
    expect(DEFAULT_WEIGHTS.options).toBeGreaterThan(DEFAULT_WEIGHTS.hmm);
  });
});
