// EPIC-5 story E5-2 — HMM regime detection and the walk-forward logistic.
//
// The acceptance criterion for the logistic is "reports out-of-sample edge vs base rate",
// and the tests below are written to that rather than to "the model is good". The important
// assertions here are the ones that would fail if the model were secretly cheating: that a
// classifier given no information reports no edge, and that a classifier given a planted
// signal finds it. A model that scored well on both would be broken.

import { describe, it, expect } from 'vitest';
import { rng, gauss } from '../../src/models/random.js';
import { fitHmm } from '../../src/models/hmm.js';
import { walkForwardLogistic } from '../../src/models/logistic.js';

function walk({ n = 900, mu = 0, sigma = 0.012, seed = 42, s0 = 1000 } = {}){
  const u = rng(seed);
  const closes = [s0];
  for (let i = 1; i < n; i++) closes.push(closes[i-1] * Math.exp(mu + sigma * gauss(u)));
  return closes;
}

/** Alternating regimes: long calm/up stretches, shorter volatile/down ones. */
function regimeSwitching({ n = 900, seed = 3, s0 = 1000, block = 120 } = {}){
  const u = rng(seed);
  const closes = [s0];
  for (let i = 1; i < n; i++){
    const calm = Math.floor(i / block) % 2 === 0;
    const mu = calm ? 0.0008 : -0.0015;
    const sigma = calm ? 0.007 : 0.025;
    closes.push(closes[i-1] * Math.exp(mu + sigma * gauss(u)));
  }
  return closes;
}

const flatVolumes = (n) => new Array(n).fill(1000000);

describe('hidden Markov regime detection', () => {
  it('separates two genuinely different regimes', () => {
    const h = fitHmm(regimeSwitching({ seed: 3 }));
    expect(h).not.toBeNull();
    // The calmer state must have both the higher mean and the lower volatility — that is
    // what "regime" means here, and the labelling is done by fitted mean, not by index.
    expect(h.muBullAnn).toBeGreaterThan(h.muBearAnn);
    expect(h.volBullAnn).toBeLessThan(h.volBearAnn);
    // Distinguishable states: this is the number that says the rest is worth reading.
    // A genuinely switching series scores around 0.30 on the Bhattacharyya measure.
    expect(h.separation).toBeGreaterThan(0.25);
  });

  it('reports probabilities, not a verdict', () => {
    const h = fitHmm(regimeSwitching({ seed: 8 }));
    expect(h.pBullNow).toBeGreaterThanOrEqual(0);
    expect(h.pBullNow).toBeLessThanOrEqual(100);
    expect(h.pBullNext).toBeGreaterThanOrEqual(0);
    expect(h.pBullNext).toBeLessThanOrEqual(100);
  });

  it('produces stationary, well-formed transition probabilities', () => {
    const h = fitHmm(regimeSwitching({ seed: 5 }));
    for (const stick of [h.stickBull, h.stickBear]){
      expect(stick).toBeGreaterThan(0);
      expect(stick).toBeLessThanOrEqual(100);
    }
    // Expected duration is 1/(1-p). Regimes must last more than a day or the model has
    // found noise rather than persistence.
    expect(h.expectedDaysBull).toBeGreaterThan(1);
    expect(h.expectedDaysBear).toBeGreaterThan(1);
  });

  it('reports near-zero separation on a series with only one regime', () => {
    // The honest failure mode, and the test that drove the design of `separation`. A
    // single-regime series has no regimes to find, but EM will still split it in two and
    // report a confident-looking pBullNow. `separation` is what tells the reader the split
    // is arbitrary.
    //
    // The first version of this measure — mean gap over blended volatility — scored the
    // switching series BELOW the random walk, because equity regimes differ mostly in
    // volatility and the switching series' volatility gap inflated the denominator. The
    // Bhattacharyya measure separates them by two orders of magnitude.
    const one = fitHmm(walk({ n: 900, sigma: 0.012, seed: 17 }));
    const two = fitHmm(regimeSwitching({ seed: 17 }));
    expect(one).not.toBeNull();
    expect(one.separation).toBeLessThan(0.1);
    expect(two.separation).toBeGreaterThan(one.separation * 5);
  });

  it('never underflows on a long window', () => {
    // Without per-step rescaling in the forward pass the joint probability of 750
    // observations reaches zero in about 30 steps and every output is NaN.
    const h = fitHmm(walk({ n: 900, seed: 31 }));
    for (const [k, v] of Object.entries(h)){
      if (typeof v === 'number') expect(Number.isFinite(v) || v === Infinity, k + ' is NaN').toBe(true);
    }
  });

  it('is deterministic — EM has no randomness in it', () => {
    const closes = regimeSwitching({ seed: 12 });
    expect(fitHmm(closes)).toEqual(fitHmm(closes));
  });

  it('declines below 200 returns rather than fitting regimes to a quarter of data', () => {
    expect(fitHmm(walk({ n: 150, seed: 1 }))).toBeNull();
    expect(fitHmm([])).toBeNull();
    expect(fitHmm(null)).toBeNull();
  });

  it('declines on a flat series', () => {
    expect(fitHmm(new Array(900).fill(100))).toBeNull();
  });
});

describe('walk-forward logistic', () => {
  it('reports no edge on a random walk, where there is none to find', () => {
    // THE test for this model. A random walk has no learnable structure, so a classifier
    // that claims an edge on it is leaking the answer. Some accuracy is expected — the base
    // rate alone delivers that — but the edge over the base rate must be about zero.
    const closes = walk({ n: 900, sigma: 0.012, seed: 101 });
    const out = walkForwardLogistic(closes, flatVolumes(900), 21);
    expect(out).not.toBeNull();
    expect(out.edge).toBeLessThan(12);
  });

  it('finds a planted signal that a real series would not contain', () => {
    // The complement of the test above: if the model reported no edge here either, it would
    // be broken rather than honest. A deterministic 40-day cycle is blatantly learnable from
    // the momentum features.
    const n = 900;
    const closes = [1000];
    for (let i = 1; i < n; i++){
      const phase = Math.sin((2 * Math.PI * i) / 40);
      closes.push(closes[i-1] * Math.exp(0.004 * phase));
    }
    const out = walkForwardLogistic(closes, flatVolumes(n), 5);
    expect(out).not.toBeNull();
    expect(out.accuracy).toBeGreaterThan(55);
  });

  it('measures edge against the majority class, not against 50%', () => {
    // A stock that rose on 60% of test days makes "always up" a 60% classifier. Scoring
    // that against 50% would credit the model with ten points it did not earn.
    const out = walkForwardLogistic(walk({ n: 900, mu: 0.001, seed: 55 }), flatVolumes(900), 21);
    expect(out.baseRate).toBeGreaterThanOrEqual(50);
    expect(out.baseRate).toBeCloseTo(Math.max(out.upRate, 100 - out.upRate), 6);
    expect(out.edge).toBeCloseTo(out.accuracy - out.baseRate, 6);
    expect(out.hasEdge).toBe(out.accuracy > out.baseRate);
  });

  it('reports a Brier score that can expose a confidently wrong model', () => {
    const out = walkForwardLogistic(walk({ n: 900, seed: 66 }), flatVolumes(900), 21);
    expect(out.brier).toBeGreaterThan(0);
    // A constant 50% guess scores exactly 0.25. Anything far above means the model is
    // confident and wrong, which accuracy alone would not reveal.
    expect(out.brier).toBeLessThan(0.6);
  });

  it('splits chronologically, never at random', () => {
    // A random split puts tomorrow in training and yesterday in test, and with overlapping
    // horizon-day labels that leaks the answer outright.
    const out = walkForwardLogistic(walk({ n: 900, seed: 77 }), flatVolumes(900), 21);
    expect(out.nTrain).toBeGreaterThan(out.nTest);
    expect(out.nTrain / (out.nTrain + out.nTest)).toBeCloseTo(0.7, 1);
  });

  it('returns a probability in range', () => {
    const out = walkForwardLogistic(walk({ n: 900, seed: 88 }), flatVolumes(900), 21);
    expect(out.pUp).toBeGreaterThan(0);
    expect(out.pUp).toBeLessThan(100);
  });

  it('survives zero volume without dividing by it', () => {
    // A halted scrip reports zero volume for a stretch; relative volume must not become
    // Infinity and poison the whole feature row.
    const closes = walk({ n: 900, seed: 91 });
    const volumes = new Array(900).fill(0);
    const out = walkForwardLogistic(closes, volumes, 21);
    expect(out).not.toBeNull();
    expect(Number.isFinite(out.pUp)).toBe(true);
  });

  it('is deterministic — gradient descent starts from zero, not a random seed', () => {
    const closes = walk({ n: 900, seed: 44 });
    const v = flatVolumes(900);
    expect(walkForwardLogistic(closes, v, 21)).toEqual(walkForwardLogistic(closes, v, 21));
  });

  it('declines when there is not enough history to train and test separately', () => {
    expect(walkForwardLogistic(walk({ n: 200, seed: 1 }), flatVolumes(200), 21)).toBeNull();
    expect(walkForwardLogistic(null, [], 21)).toBeNull();
    expect(walkForwardLogistic(walk({ n: 900, seed: 1 }), flatVolumes(900), 0)).toBeNull();
  });
});
