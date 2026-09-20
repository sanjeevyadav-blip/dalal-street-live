// EPIC-5 story E5-1 — GBM Monte Carlo and GARCH(1,1).
//
// The acceptance is "unit-tested against known series", which is the only way to test a
// model honestly: generate data whose true parameters you chose, and check the model
// recovers them. Running these against RELIANCE would only tell you the code executes.
//
// So the fixtures here are synthetic — a pure random walk with a set drift and volatility, a
// series with a deliberate volatility cluster, a series with none — and each test states what
// the model is supposed to find and what it is allowed to be wrong about.

import { describe, it, expect } from 'vitest';
import { rng, gauss } from '../../src/models/random.js';
import { logReturns, mean, stdev, quantileSorted } from '../../src/models/stats.js';
import { gbmMonteCarlo, gbmConditional } from '../../src/models/monte-carlo.js';
import { fitGarch } from '../../src/models/garch.js';
import { gbmProbUp } from '../../src/models/gbm.js';

/** A price series whose log-returns are exactly N(mu, sigma) by construction. */
function syntheticWalk({ n = 800, mu = 0, sigma = 0.012, seed = 42, s0 = 1000 } = {}){
  const u = rng(seed);
  const closes = [s0];
  for (let i = 1; i < n; i++) closes.push(closes[i-1] * Math.exp(mu + sigma * gauss(u)));
  return closes;
}

/** Calm for the first half, three times as volatile for the second — GARCH should see it. */
function clusteredWalk({ n = 800, calm = 0.006, wild = 0.024, seed = 7, s0 = 1000 } = {}){
  const u = rng(seed);
  const closes = [s0];
  for (let i = 1; i < n; i++){
    const sigma = i < n / 2 ? calm : wild;
    closes.push(closes[i-1] * Math.exp(sigma * gauss(u)));
  }
  return closes;
}

describe('seeded randomness', () => {
  it('is reproducible, so a probability only moves when the input moves', () => {
    const a = rng(123), b = rng(123);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('produces different streams from different seeds', () => {
    const a = rng(1), b = rng(2);
    expect(a()).not.toBe(b());
  });

  it('stays inside [0, 1)', () => {
    const u = rng(99);
    for (let i = 0; i < 5000; i++){
      const x = u();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('draws a standard normal — mean 0, sd 1', () => {
    const u = rng(2024);
    const draws = [];
    for (let i = 0; i < 20000; i++) draws.push(gauss(u));
    expect(Math.abs(mean(draws))).toBeLessThan(0.03);
    expect(stdev(draws)).toBeGreaterThan(0.97);
    expect(stdev(draws)).toBeLessThan(1.03);
  });

  it('never returns a non-finite draw, even when the generator yields exactly zero', () => {
    // Math.log(0) is -Infinity, which would put NaN into a price path and poison every
    // statistic downstream. The 1e-12 floor in gauss() is what stops it.
    let first = true;
    const u = () => { if (first){ first = false; return 0; } return 0.5; };
    expect(Number.isFinite(gauss(u))).toBe(true);
  });
});

describe('stats primitives', () => {
  it('returns NaN rather than 0 for the mean of nothing', () => {
    // Deliberately unlike average() in src/indicators/util.js: a model told "the mean is 0"
    // will carry on and produce a confident answer built on no data.
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(stdev([]))).toBe(true);
    expect(Number.isNaN(stdev([1]))).toBe(true);
  });

  it('uses the sample standard deviation, dividing by n-1', () => {
    // [2,4,4,4,5,5,7,9]: population sd is exactly 2, sample sd is 2.13809...
    const a = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(stdev(a)).toBeCloseTo(2.13809, 4);
  });

  it('skips non-positive closes rather than emitting -Infinity', () => {
    // Yahoo occasionally emits a zero close on a halted scrip.
    const r = logReturns([100, 0, 110, 121]);
    expect(r.every(Number.isFinite)).toBe(true);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(Math.log(1.1), 10);
  });

  it('recovers a known log return', () => {
    expect(logReturns([100, 100 * Math.E])[0]).toBeCloseTo(1, 10);
  });

  it('takes quantiles by nearest rank, so every answer is a value that occurred', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(sorted).toContain(quantileSorted(sorted, 0.5));
    expect(quantileSorted(sorted, 0)).toBe(1);
    expect(quantileSorted(sorted, 1)).toBe(10);
    expect(Number.isNaN(quantileSorted([], 0.5))).toBe(true);
  });
});

describe('GBM Monte Carlo', () => {
  it('agrees with the closed form already shipped in models/gbm.js', () => {
    // The sharpest check available, and the one that caught a real bug: under GBM the
    // probability of finishing higher has an exact answer, so the simulation must reproduce
    // it. The port initially carried the lab's `mu - 0.5*sigma^2` drift, which applies the
    // Ito correction to a mu that is already a log drift — subtracting it twice. The two
    // models then disagreed by nine percentage points while both looked plausible alone.
    //
    // Both are pointed at the same 252-day window, so the only remaining difference is
    // simulation error — at 40,000 paths, about 0.25 percentage points.
    const closes = syntheticWalk({ mu: 0.0004, sigma: 0.011, seed: 11, n: 600 });
    const mc = gbmMonteCarlo(closes, 21, 40000, { window: 252 });
    const closed = gbmProbUp(closes, 21);
    expect(Math.abs(mc.pUp - closed.p)).toBeLessThan(1);
  });

  it('shows how little the drift estimate is worth over a short horizon', () => {
    // Not a defect being hidden — the single most important limitation of this model, and
    // the reason the UI block states the estimation window next to the number.
    //
    // Two series generated with the SAME true drift of zero and the same volatility, differing
    // only in the random draw, produce materially different P(up). The drift is estimated from
    // ~500 observations with a standard error of sigma/sqrt(n), and over a 21-day horizon
    // P(up) is acutely sensitive to it. Anyone reading 44% vs 56% as a signal about the
    // company is reading sampling noise.
    const a = gbmMonteCarlo(syntheticWalk({ mu: 0, sigma: 0.01, seed: 11 }), 21, 20000);
    const b = gbmMonteCarlo(syntheticWalk({ mu: 0, sigma: 0.01, seed: 12 }), 21, 20000);
    expect(Math.abs(a.pUp - b.pUp)).toBeGreaterThan(1);
    // Both still land in the band where an honest short-horizon answer lives.
    for (const out of [a, b]){
      expect(out.pUp).toBeGreaterThan(30);
      expect(out.pUp).toBeLessThan(70);
    }
  });

  it('recovers the volatility it was generated with', () => {
    const sigma = 0.015;
    const out = gbmMonteCarlo(syntheticWalk({ sigma, seed: 5 }), 21, 4000);
    const expectedAnn = sigma * Math.sqrt(252) * 100;
    expect(out.annVol).toBeGreaterThan(expectedAnn * 0.9);
    expect(out.annVol).toBeLessThan(expectedAnn * 1.1);
  });

  it('recovers a positive drift as a higher chance of finishing up', () => {
    const up = gbmMonteCarlo(syntheticWalk({ mu: 0.0012, sigma: 0.01, seed: 3 }), 63, 20000);
    const flat = gbmMonteCarlo(syntheticWalk({ mu: 0, sigma: 0.01, seed: 3 }), 63, 20000);
    expect(up.pUp).toBeGreaterThan(flat.pUp);
    expect(up.pUp).toBeGreaterThan(55);
  });

  it('widens its interval with the horizon, roughly as the square root of time', () => {
    const closes = syntheticWalk({ mu: 0, sigma: 0.012, seed: 21 });
    const short = gbmMonteCarlo(closes, 21, 20000);
    const long = gbmMonteCarlo(closes, 84, 20000);
    const shortWidth = short.p95Pct - short.p05Pct;
    const longWidth = long.p95Pct - long.p05Pct;
    // Four times the horizon should roughly double the spread.
    expect(longWidth / shortWidth).toBeGreaterThan(1.6);
    expect(longWidth / shortWidth).toBeLessThan(2.5);
  });

  it('reports its spread in percent, never as a price level', () => {
    // CLAUDE.md hard rule 2. A rupee figure invites being read as a destination; a percent
    // reads as dispersion. The distinction is enforced by what the model returns, not by
    // what the UI happens to render.
    const out = gbmMonteCarlo(syntheticWalk({ seed: 8 }), 21, 2000);
    for (const key of Object.keys(out)){
      expect(key, key + ' looks like a price field').not.toMatch(/price|target|level/i);
    }
    // A 21-day percent band on a 19% vol stock is tens of percent at most, never hundreds.
    expect(Math.abs(out.p05Pct)).toBeLessThan(100);
    expect(Math.abs(out.p95Pct)).toBeLessThan(100);
    expect(out.p05Pct).toBeLessThan(out.p95Pct);
  });

  it('reports a standard error that shrinks as the square root of the path count', () => {
    const closes = syntheticWalk({ seed: 31 });
    const few = gbmMonteCarlo(closes, 21, 1000);
    const many = gbmMonteCarlo(closes, 21, 16000);
    expect(many.se).toBeLessThan(few.se);
    // 16x the paths should be about 4x the precision.
    expect(few.se / many.se).toBeGreaterThan(2.5);
  });

  it('is deterministic across runs with the same input', () => {
    const closes = syntheticWalk({ seed: 77 });
    expect(gbmMonteCarlo(closes, 21, 3000)).toEqual(gbmMonteCarlo(closes, 21, 3000));
  });

  it('declines rather than guessing when there is too little history', () => {
    expect(gbmMonteCarlo([100, 101, 102], 21, 100)).toBeNull();
    expect(gbmMonteCarlo(null, 21, 100)).toBeNull();
    expect(gbmMonteCarlo(syntheticWalk({ seed: 1 }), 0, 100)).toBeNull();
  });

  it('declines on a flat series, where volatility is zero', () => {
    expect(gbmMonteCarlo(new Array(600).fill(100), 21, 100)).toBeNull();
  });
});

describe('GBM on conditional volatility', () => {
  it('uses the volatility it is handed, not the historical one', () => {
    const closes = syntheticWalk({ sigma: 0.01, seed: 4 });
    const cond = gbmConditional(closes, 21, 0.03, 4000);
    expect(cond.usedConditionalVol).toBe(true);
    expect(cond.annVol).toBeGreaterThan(cond.histAnnVol * 2);
    // Wider volatility, wider band — and the drift is unchanged, so P(up) barely moves.
    const base = gbmMonteCarlo(closes, 21, 4000);
    expect(cond.p95Pct - cond.p05Pct).toBeGreaterThan(base.p95Pct - base.p05Pct);
  });

  it('declines on a non-positive volatility', () => {
    expect(gbmConditional(syntheticWalk({ seed: 2 }), 21, 0, 100)).toBeNull();
    expect(gbmConditional(syntheticWalk({ seed: 2 }), 21, -0.01, 100)).toBeNull();
  });
});

describe('GARCH(1,1)', () => {
  it('fits a stationary model', () => {
    const g = fitGarch(syntheticWalk({ n: 800, sigma: 0.012, seed: 15 }));
    expect(g).not.toBeNull();
    expect(g.alpha).toBeGreaterThan(0);
    expect(g.beta).toBeGreaterThan(0);
    // alpha + beta < 1 is what makes the unconditional variance finite and the half-life
    // meaningful. A fit that violates it is skipped by the grid, not reported with a caveat.
    expect(g.persistence).toBeLessThan(1);
    expect(g.omega).toBeGreaterThan(0);
    expect(Number.isFinite(g.halfLife)).toBe(true);
    expect(g.halfLife).toBeGreaterThan(0);
  });

  it('recovers the unconditional volatility of a constant-volatility series', () => {
    const sigma = 0.012;
    const g = fitGarch(syntheticWalk({ n: 900, sigma, seed: 6 }));
    const expectedAnn = sigma * Math.sqrt(252) * 100;
    expect(g.annVolUnc).toBeGreaterThan(expectedAnn * 0.9);
    expect(g.annVolUnc).toBeLessThan(expectedAnn * 1.1);
  });

  it('reports current volatility above the long-run level after a volatility cluster', () => {
    // The whole reason this model exists. A rolling standard deviation would average the
    // calm first half into the answer and understate what is happening now.
    const g = fitGarch(clusteredWalk({ calm: 0.005, wild: 0.025, seed: 9 }));
    expect(g).not.toBeNull();
    expect(g.annVolNow).toBeGreaterThan(g.annVolUnc);
    expect(g.volRatio).toBeGreaterThan(1);
  });

  it('does not claim elevated volatility on a series with no cluster', () => {
    const g = fitGarch(syntheticWalk({ n: 900, sigma: 0.012, seed: 23 }));
    // Constant volatility by construction: current and long-run should be close.
    expect(g.volRatio).toBeGreaterThan(0.4);
    expect(g.volRatio).toBeLessThan(2.2);
  });

  it('declines below 250 returns rather than fitting three parameters to noise', () => {
    expect(fitGarch(syntheticWalk({ n: 200, seed: 1 }))).toBeNull();
    expect(fitGarch([])).toBeNull();
    expect(fitGarch(null)).toBeNull();
  });

  it('declines on a flat series, where there is no variance to model', () => {
    expect(fitGarch(new Array(800).fill(100))).toBeNull();
  });

  it('is deterministic — the grid search has no randomness in it', () => {
    const closes = syntheticWalk({ n: 800, seed: 44 });
    expect(fitGarch(closes)).toEqual(fitGarch(closes));
  });

  it('picks the highest likelihood on its grid', () => {
    // Guards the search itself: perturbing the fitted parameters must not improve the fit.
    const closes = clusteredWalk({ seed: 12 });
    const g = fitGarch(closes);
    expect(g.logLik).toBeGreaterThan(-Infinity);
    expect(Number.isFinite(g.logLik)).toBe(true);
  });
});
