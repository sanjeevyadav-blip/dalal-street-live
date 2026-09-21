// Unit tests for src/valuation/, src/options/ and src/models/ — docs/10 §10.2, story E2-3.
//
// Same division of labour as tests/unit/indicators.test.js: the golden suite pins today's
// numbers, this file checks the maths is right in the first place. Where a rule is a
// deliberate refusal to produce a number — negative FCF, a singular matrix, too few returns
// — the refusal is what gets asserted. A plausible-looking figure in those cases is the
// failure mode CLAUDE.md invariant 3 exists to prevent.

import { describe, it, expect } from 'vitest';

import { computeDcf, isDcfUnsuitableSector } from '../../src/valuation/dcf.js';
import { reverseDcf } from '../../src/valuation/reverse-dcf.js';
import { earningsQuality } from '../../src/valuation/earnings-quality.js';
import { nCdf } from '../../src/models/normal.js';
import { olsMulti } from '../../src/models/ols.js';
import { gbmProbUp } from '../../src/models/gbm.js';
import { analyseOptions } from '../../src/options/chain.js';
import { fixture } from '../helpers/fixtures.js';

// The shape fetchAnnuals returns: newest last.
const series = (...values) => values.map((v, i) => ({ date: `20${20 + i}-03-31`, v }));

const annuals = ({ ocf, capex, ni, rev, assets }) => ({
  ocf: series(...ocf),
  capex: series(...capex),
  ni: series(...ni),
  rev: series(...rev),
  assets: series(...assets)
});

describe('nCdf', () => {
  // The approximation's worst absolute error over [-6, 6] is ~7e-8, near x = -0.06.
  // nCdf(0) is 0.5000000005, not 0.5 — accurate to roughly 7 decimal places, which is
  // ample for reporting a probability to the nearest percent but not exact. Asserting
  // 10 decimal places here would be asserting something the function never promised.
  it('is 0.5 at zero, to the accuracy the approximation offers', () => {
    expect(nCdf(0)).toBeCloseTo(0.5, 7);
  });

  it('matches the standard normal at the 95% points', () => {
    expect(nCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(nCdf(-1.96)).toBeCloseTo(0.025, 4);
  });

  it('matches at the 99% points', () => {
    expect(nCdf(2.576)).toBeCloseTo(0.995, 4);
    expect(nCdf(-2.576)).toBeCloseTo(0.005, 4);
  });

  it('is symmetric about zero to within the approximation error', () => {
    for (const x of [0.25, 1, 2, 3]) {
      expect(nCdf(x) + nCdf(-x)).toBeCloseTo(1, 7);
    }
  });

  it('saturates without overshooting the bounds', () => {
    expect(nCdf(10)).toBeLessThanOrEqual(1);
    expect(nCdf(-10)).toBeGreaterThanOrEqual(0);
  });
});

describe('computeDcf', () => {
  const base = {
    ocf: [800, 900, 1000, 1100],
    capex: [-200, -200, -200, -200],
    ni: [600, 700, 800, 900],
    rev: [5000, 5500, 6000, 6500],
    assets: [9000, 9500, 10000, 10500]
  };

  it('refuses to value negative free cash flow', () => {
    // Capex exceeds operating cash flow in the latest year.
    const d = computeDcf(annuals({ ...base, capex: [-200, -200, -200, -5000] }), 100, 1000, 1, 0);
    expect(d.error).toBeTruthy();
    expect(d.intrinsic).toBeUndefined();
  });

  it('returns null when there are no cash flows or no share count', () => {
    expect(computeDcf(annuals({ ...base, ocf: [] }), 100, 1000, 1, 0)).toBeNull();
    expect(computeDcf(annuals(base), 100, 0, 1, 0)).toBeNull();
  });

  it('prices equity as enterprise value less net debt, per share', () => {
    const d = computeDcf(annuals(base), 100, 1000, 1, 250);
    expect(d.equity).toBeCloseTo(d.ev - 250, 6);
    expect(d.intrinsic).toBeCloseTo(d.equity / 1000, 6);
    expect(d.ev).toBeCloseTo(d.pvExplicit + d.pvTerminal, 6);
  });

  it('uses CAPM for the discount rate: 7% risk-free plus beta times a 6% ERP', () => {
    // beta 1.0 -> 0.07 + 0.06 = 0.13, inside the [0.11, 0.16] clamp.
    expect(computeDcf(annuals(base), 100, 1000, 1.0, 0).disc).toBeCloseTo(0.13, 10);
  });

  it('clamps the discount rate at both ends', () => {
    // beta 0.5 would give 0.10, below the 0.11 floor.
    expect(computeDcf(annuals(base), 100, 1000, 0.5, 0).disc).toBeCloseTo(0.11, 10);
    // beta 3.0 would give 0.25, above the 0.16 ceiling.
    expect(computeDcf(annuals(base), 100, 1000, 3.0, 0).disc).toBeCloseTo(0.16, 10);
  });

  // Yahoo's betas for Indian names are often understated, so anything implausibly low is
  // treated as 1.0 rather than taken at face value.
  it('treats a beta below 0.2 as 1.0 rather than trusting it', () => {
    expect(computeDcf(annuals(base), 100, 1000, 0.05, 0).disc).toBeCloseTo(0.13, 10);
    expect(computeDcf(annuals(base), 100, 1000, null, 0).disc).toBeCloseTo(0.13, 10);
  });

  it('clamps implied growth to +20% however fast history grew', () => {
    // Capex has to stay below the FIRST year's operating cash flow: growth is only implied
    // from history when fcf[0] > 0, and otherwise the 8% default stands. Getting that wrong
    // made this test look like a clamp failure when it was really the default path.
    const explosive = { ...base, ocf: [100, 500, 2000, 10000], capex: [-20, -20, -20, -20] };
    expect(computeDcf(annuals(explosive), 100, 1000, 1, 0).growth).toBeCloseTo(0.2, 10);
  });

  it('falls back to the 8% default when the first year of free cash flow is negative', () => {
    const lateStarter = { ...base, ocf: [10, 100, 1000, 10000], capex: [-200, -200, -200, -200] };
    expect(computeDcf(annuals(lateStarter), 100, 1000, 1, 0).growth).toBeCloseTo(0.08, 10);
  });

  it('clamps implied growth to -5% however fast history shrank', () => {
    const collapsing = { ...base, ocf: [10000, 5000, 2000, 1000] };
    expect(computeDcf(annuals(collapsing), 100, 1000, 1, 0).growth).toBeCloseTo(-0.05, 10);
  });

  it('reports upside as the gap between intrinsic value and price', () => {
    const d = computeDcf(annuals(base), 100, 1000, 1, 0);
    expect(d.upside).toBeCloseTo(((d.intrinsic - 100) / 100) * 100, 6);
  });

  // The grid is the output that matters — ADR-003 records that the result swings 40%+
  // across defensible assumptions, which is why there is no single target price.
  it('produces a 3x3 sensitivity grid that falls as the discount rate rises', () => {
    const d = computeDcf(annuals(base), 100, 1000, 1, 0);
    expect(d.sens).toHaveLength(3);
    for (const row of d.sens) expect(row.vals).toHaveLength(3);
    // Same growth column, higher discount rate -> lower value.
    expect(d.sens[2].vals[1]).toBeLessThan(d.sens[0].vals[1]);
    // Same discount rate, higher growth -> higher value.
    expect(d.sens[0].vals[2]).toBeGreaterThan(d.sens[0].vals[0]);
  });
});

describe('computeDcf declines for lenders', () => {
  // The bank case, closed as its own deliberate change. HDFCBANK used to get an intrinsic
  // value with growth pinned at the +20% cap, computed from cash-flow swings that mostly
  // track loan-book growth rather than anything shareholders can have. A confident number
  // that means nothing is exactly what CLAUDE.md invariant 3 forbids.

  const ann = {
    ocf: [{ date: '2021-03-31', v: 100 }, { date: '2022-03-31', v: 120 }, { date: '2023-03-31', v: 150 }],
    capex: [{ date: '2021-03-31', v: -10 }, { date: '2022-03-31', v: -12 }, { date: '2023-03-31', v: -15 }],
    ni: [], rev: [], assets: []
  };

  it('identifies lenders by sector or by industry', () => {
    expect(isDcfUnsuitableSector('Financial Services', 'Banks - Regional')).toBe(true);
    expect(isDcfUnsuitableSector('Financial Services', '')).toBe(true);
    // Industry alone is enough: Yahoo's sector field is sometimes blank or odd.
    expect(isDcfUnsuitableSector('', 'Insurance - Life')).toBe(true);
    expect(isDcfUnsuitableSector('', 'Capital Markets')).toBe(true);
    expect(isDcfUnsuitableSector('', 'Credit Services')).toBe(true);
    expect(isDcfUnsuitableSector('', 'Asset Management')).toBe(true);
  });

  it('does not catch ordinary companies', () => {
    // A blunt guard that swallowed anything with "financial" in it would quietly stop
    // valuing half the market, and nobody would notice because a decline looks deliberate.
    expect(isDcfUnsuitableSector('Technology', 'Information Technology Services')).toBe(false);
    expect(isDcfUnsuitableSector('Energy', 'Oil & Gas Refining & Marketing')).toBe(false);
    expect(isDcfUnsuitableSector('Consumer Cyclical', 'Auto Manufacturers')).toBe(false);
    expect(isDcfUnsuitableSector('Industrials', 'Engineering & Construction')).toBe(false);
    expect(isDcfUnsuitableSector(null, null)).toBe(false);
    expect(isDcfUnsuitableSector(undefined, undefined)).toBe(false);
  });

  it('returns an explanation rather than a number for a bank', () => {
    const out = computeDcf(ann, 100, 1000, 1.0, 0, { sector: 'Financial Services', industry: 'Banks - Regional' });
    expect(out.error).toBeTruthy();
    expect(out.intrinsic).toBeUndefined();
    // The message has to say WHY, not just refuse — a reader who does not know why a bank
    // is different will assume the page is broken.
    expect(out.error).toMatch(/deposits and loan originations/i);
    expect(out.error).toMatch(/not free cash flow/i);
  });

  it('still values a non-financial company given the same figures', () => {
    const out = computeDcf(ann, 100, 1000, 1.0, 0, { sector: 'Technology', industry: 'Software' });
    expect(out.error).toBeUndefined();
    expect(out.intrinsic).toBeGreaterThan(0);
  });

  it('values the company when no profile is supplied at all', () => {
    // The parameter is optional so existing callers keep working. Declining without
    // evidence would be worse than the bug being fixed.
    const out = computeDcf(ann, 100, 1000, 1.0, 0);
    expect(out.error).toBeUndefined();
    expect(out.intrinsic).toBeGreaterThan(0);
  });
});

describe('reverseDcf', () => {
  // Base FCF 500 over 100 shares spans roughly 58 (at the -20% floor) to 426 (at the +60%
  // ceiling) per share. A price outside that band is correctly reported as capped, so the
  // round-trip test has to pick one inside it.
  const args = [67, 500, 100, 0.13, 0.04, 0];

  it('finds the growth rate that reproduces the market price', () => {
    const rd = reverseDcf(...args);
    expect(rd.capped).toBe(false);
    // docs/10 §10.2: valueAt(implied) must land within 0.5% of the price.
    expect(Math.abs(rd.valueAt(rd.implied) - 67) / 67).toBeLessThan(0.005);
  });

  it('round-trips above the terminal rate', () => {
    const probe = reverseDcf(67, 500, 100, 0.13, 0.04, 0);
    for (const g of [0.05, 0.1, 0.2, 0.35]) {
      const price = probe.valueAt(g);
      const rd = reverseDcf(price, 500, 100, 0.13, 0.04, 0);
      expect(rd.capped).toBe(false);
      expect(rd.implied).toBeCloseTo(g, 4);
    }
  });

  // A real limitation, pinned so it is visible rather than surprising.
  //
  // Both computeDcf and reverseDcf grow free cash flow by `Math.max(tg, gy)` — growth is
  // FLOORED at the 4% terminal rate. Nothing can be modelled as growing more slowly than
  // that, so every implied growth at or below 4% produces an identical value, and the
  // bisection reports the -20% bound for all of them.
  //
  // The consequence for the UI: an "implied growth" reading of -20% does not mean the market
  // expects a 20% decline. It means the market expects 4% or less and the model cannot tell
  // which. `capped: true` is the flag that says so, and it must keep being shown.
  it('cannot distinguish any growth at or below the terminal rate', () => {
    const probe = reverseDcf(67, 500, 100, 0.13, 0.04, 0);
    const atTerminal = probe.valueAt(0.04);
    for (const g of [-0.2, -0.1, 0, 0.02, 0.04]) {
      expect(probe.valueAt(g)).toBeCloseTo(atTerminal, 9);
    }
    // Exactly on the boundary the answer IS the terminal rate, and that is a real solution:
    // the price is consistent with growth at 4%.
    const atBoundary = reverseDcf(atTerminal, 500, 100, 0.13, 0.04, 0);
    expect(atBoundary.implied).toBeCloseTo(0.04, 6);
    expect(atBoundary.belowFloor).toBe(false);

    // Below it there is no answer to give, and the function now says so instead of
    // reporting the bottom of a bracket it never searched. This used to return
    // { implied: -0.20, capped: true }, which read as "the market expects a 20% annual
    // decline" and meant only "this model cannot resolve it" — a fabricated metric under
    // CLAUDE.md invariant 3.
    const belowBoundary = reverseDcf(atTerminal * 0.99, 500, 100, 0.13, 0.04, 0);
    expect(belowBoundary.implied).toBeNull();
    expect(belowBoundary.belowFloor).toBe(true);
    expect(belowBoundary.floorGrowth).toBeCloseTo(0.04, 10);
  });

  it('flags the answer as capped when the price implies more than +60% growth', () => {
    const rd = reverseDcf(1e9, 500, 100, 0.13, 0.04, 0);
    expect(rd.capped).toBe(true);
    expect(rd.implied).toBeCloseTo(0.6, 10);
  });

  it('declines to invent a figure when the price implies less than the model can express', () => {
    // A price of 0.01 against a ₹500 base is far below anything the model can produce. The
    // honest answer is "below the floor, and I cannot say how far" — not a number.
    const rd = reverseDcf(0.01, 500, 100, 0.13, 0.04, 0);
    expect(rd.belowFloor).toBe(true);
    expect(rd.implied).toBeNull();
    expect(rd.capped).toBe(false);
  });

  it('distinguishes the three outcomes from one another', () => {
    // The whole point of the change: a caller has to be able to tell "solved" from
    // "off the top" from "off the bottom", and the old shape conflated the last two.
    const solved = reverseDcf(...args);
    expect(solved.implied).not.toBeNull();
    expect(solved.capped).toBe(false);
    expect(solved.belowFloor).toBe(false);

    // A price far above anything the model reaches: capped at the upper bracket, and that
    // IS a number worth showing — it is a genuine floor on expectations.
    const tooHigh = reverseDcf(1e9, 500, 100, 0.13, 0.04, 0);
    expect(tooHigh.capped).toBe(true);
    expect(tooHigh.belowFloor).toBe(false);
    expect(tooHigh.implied).toBeCloseTo(0.60, 10);

    const tooLow = reverseDcf(0.01, 500, 100, 0.13, 0.04, 0);
    expect(tooLow.capped).toBe(false);
    expect(tooLow.belowFloor).toBe(true);
    expect(tooLow.implied).toBeNull();
  });

  it('returns null rather than a number on unusable inputs', () => {
    expect(reverseDcf(1000, -500, 100, 0.13, 0.04, 0)).toBeNull();
    expect(reverseDcf(1000, 500, 0, 0.13, 0.04, 0)).toBeNull();
    expect(reverseDcf(0, 500, 100, 0.13, 0.04, 0)).toBeNull();
  });

  it('is monotonic — assuming more growth implies more value', () => {
    const rd = reverseDcf(...args);
    expect(rd.valueAt(0.15)).toBeGreaterThan(rd.valueAt(0.05));
  });
});

describe('earningsQuality', () => {
  const strong = {
    ocf: [800, 900, 1000, 1200],
    capex: [-200, -200, -200, -200],
    ni: [600, 700, 800, 900],
    rev: [5000, 5500, 6000, 6500],
    assets: [9000, 9500, 10000, 10500]
  };

  it('passes the cash-backed check when operating cash flow exceeds profit', () => {
    const q = earningsQuality(annuals(strong));
    expect(q.cfni).toBeCloseTo(1200 / 900, 10);
    expect(q.flags[0]).toEqual({ good: true, t: expect.stringContaining('cash-backed') });
  });

  it('fails the cash-backed check when profit runs ahead of cash', () => {
    const q = earningsQuality(annuals({ ...strong, ocf: [800, 900, 1000, 500] }));
    expect(q.cfni).toBeLessThan(1);
    expect(q.flags[0].good).toBe(false);
  });

  it('computes free cash flow as operating cash flow less capex', () => {
    const q = earningsQuality(annuals(strong));
    expect(q.fcf).toBe(1200 - 200);
    expect(q.fcfMargin).toBeCloseTo((1000 / 6500) * 100, 10);
  });

  it('measures accruals against total assets, as a percentage', () => {
    const q = earningsQuality(annuals(strong));
    expect(q.accr).toBeCloseTo(((900 - 1200) / 10500) * 100, 10);
  });

  it('grades out of the checks it could actually run', () => {
    const q = earningsQuality(annuals(strong));
    expect(q.max).toBe(4);
    expect(q.score).toBeLessThanOrEqual(q.max);
    expect(['Strong', 'Reasonable', 'Mixed', 'Weak']).toContain(q.grade);
  });

  it('returns null rather than grading on missing data', () => {
    expect(earningsQuality(annuals({ ...strong, ocf: [] }))).toBeNull();
    expect(earningsQuality(annuals({ ...strong, ni: [] }))).toBeNull();
  });
});

describe('olsMulti', () => {
  // No intercept is added automatically — X must carry its own constant column.
  it('recovers the coefficients of an exact linear system', () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => 3 + 2 * v);
    const out = olsMulti(y, x.map((v) => [1, v]));
    expect(out.beta[0]).toBeCloseTo(3, 9);
    expect(out.beta[1]).toBeCloseTo(2, 9);
    expect(out.r2).toBeCloseTo(1, 9);
    expect(out.n).toBe(5);
  });

  it('recovers coefficients with two regressors', () => {
    const rows = [[1, 1, 2], [1, 2, 1], [1, 3, 4], [1, 4, 3], [1, 5, 6], [1, 6, 5]];
    const y = rows.map(([, a, b]) => 1 + 2 * a - 3 * b);
    const out = olsMulti(y, rows);
    expect(out.beta[0]).toBeCloseTo(1, 7);
    expect(out.beta[1]).toBeCloseTo(2, 7);
    expect(out.beta[2]).toBeCloseTo(-3, 7);
  });

  // A NaN loading renders as *something*, and something is worse than nothing.
  it('returns null on a singular system rather than NaN', () => {
    // Second column is an exact multiple of the first: X'X is not invertible.
    const rows = [[1, 2], [2, 4], [3, 6], [4, 8]];
    expect(olsMulti([1, 2, 3, 4], rows)).toBeNull();
  });

  it('reports standard errors that are finite and non-negative', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = x.map((v) => 3 + 2 * v + (v % 2 ? 0.4 : -0.4));
    const out = olsMulti(y, x.map((v) => [1, v]));
    for (const s of out.se) {
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
    expect(out.r2).toBeGreaterThan(0.9);
    expect(out.r2).toBeLessThanOrEqual(1);
  });
});

describe('gbmProbUp', () => {
  it('is exactly 50 when drift is zero', () => {
    // Alternating ±1%: the log returns sum to exactly zero over an even count.
    const closes = [100];
    for (let i = 1; i <= 100; i++) closes.push(closes[i - 1] * (i % 2 ? 1.01 : 1 / 1.01));
    // Limited by nCdf's ~7e-8 approximation error, not by the drift calculation.
    expect(gbmProbUp(closes, 30).p).toBeCloseTo(50, 6);
  });

  it('is above 50 for a series that drifts up', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 * 1.002 ** i);
    expect(gbmProbUp(closes, 30).p).toBeGreaterThan(50);
  });

  it('is below 50 for a series that drifts down', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 * 0.998 ** i);
    expect(gbmProbUp(closes, 30).p).toBeLessThan(50);
  });

  it('returns null rather than a number on too little history', () => {
    expect(gbmProbUp([100, 101, 102], 30)).toBeNull();
  });

  it('returns null on a flat series, where volatility is zero', () => {
    expect(gbmProbUp(Array.from({ length: 120 }, () => 100), 30)).toBeNull();
  });

  it('reports drift and volatility annualised, as percentages', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 * 1.001 ** i);
    const g = gbmProbUp(closes, 30);
    expect(g.drift).toBeCloseTo(Math.log(1.001) * 252 * 100, 6);
    expect(g.vol).toBeCloseTo(0, 6);
  });
});

describe('analyseOptions', () => {
  // Far-future expiry so days-to-expiry stays positive whenever this runs.
  const chain = (rows, underlying = 100) => ({
    expiry: '31-Dec-2099',
    underlying,
    data: rows,
    timestamp: '01-Jan-2026 15:30:00'
  });

  const leg = (oi, iv = 20, vol = 0) => ({
    openInterest: oi,
    impliedVolatility: iv,
    totalTradedVolume: vol
  });

  it('returns null rather than an empty analysis for a chain with no legs', () => {
    expect(analyseOptions(chain([{ strikePrice: 100 }]), 100)).toBeNull();
  });

  it('computes the put-call ratio as total PE open interest over total CE', () => {
    const rows = [
      { strikePrice: 90, CE: leg(30, 20, 10), PE: leg(45, 20, 30) },
      { strikePrice: 100, CE: leg(40, 20, 20), PE: leg(60, 20, 60) },
      { strikePrice: 110, CE: leg(30, 20, 10), PE: leg(45, 20, 30) }
    ];
    const a = analyseOptions(chain(rows), 100);
    expect(a.ceOI).toBe(100);
    expect(a.peOI).toBe(150);
    expect(a.pcrOI).toBeCloseTo(1.5, 10);
    expect(a.pcrVol).toBeCloseTo(120 / 40, 10);
  });

  it('puts max pain at the middle strike when open interest is symmetric', () => {
    // Uniform OI across evenly spaced strikes: the total in-the-money value at expiry is
    // minimised in the middle. Hand-checkable — 90 costs 300, 100 costs 200, 110 costs 300.
    const rows = [90, 100, 110].map((k) => ({
      strikePrice: k,
      CE: leg(10),
      PE: leg(10)
    }));
    expect(analyseOptions(chain(rows), 100).maxPain).toBe(100);
  });

  it('agrees with an independent max-pain calculation on an asymmetric chain', () => {
    const rows = [
      { strikePrice: 80, CE: leg(5), PE: leg(90) },
      { strikePrice: 90, CE: leg(20), PE: leg(60) },
      { strikePrice: 100, CE: leg(70), PE: leg(40) },
      { strikePrice: 110, CE: leg(50), PE: leg(15) },
      { strikePrice: 120, CE: leg(25), PE: leg(5) }
    ];

    // Max pain = the strike at which the least option value finishes in the money.
    let expected = null;
    let best = Infinity;
    for (const k of rows) {
      let loss = 0;
      for (const x of rows) {
        loss += Math.max(0, k.strikePrice - x.strikePrice) * x.CE.openInterest;
        loss += Math.max(0, x.strikePrice - k.strikePrice) * x.PE.openInterest;
      }
      if (loss < best) {
        best = loss;
        expected = k.strikePrice;
      }
    }

    expect(analyseOptions(chain(rows), 100).maxPain).toBe(expected);
  });

  it('builds a five-rung ladder at -10/-5/0/+5/+10 percent', () => {
    const rows = [80, 90, 95, 100, 105, 110, 120].map((k) => ({
      strikePrice: k,
      CE: leg(10),
      PE: leg(10)
    }));
    const a = analyseOptions(chain(rows), 100);
    expect(a.ladder.map((l) => l.pct)).toEqual([-10, -5, 0, 5, 10]);
    expect(a.ladder.map((l) => l.strike)).toEqual([90, 95, 100, 105, 110]);
  });

  it('reports the heaviest open interest on each side', () => {
    const rows = [
      { strikePrice: 90, CE: leg(10), PE: leg(99) },
      { strikePrice: 100, CE: leg(88), PE: leg(10) },
      { strikePrice: 110, CE: leg(10), PE: leg(10) }
    ];
    const a = analyseOptions(chain(rows), 100);
    expect(a.topCE).toEqual({ strike: 100, oi: 88 });
    expect(a.topPE).toEqual({ strike: 90, oi: 99 });
  });

  it('reports IV skew as the put IV below spot less the call IV above it', () => {
    const rows = [
      { strikePrice: 90, CE: leg(10, 18), PE: leg(10, 26) },
      { strikePrice: 100, CE: leg(10, 20), PE: leg(10, 20) },
      { strikePrice: 110, CE: leg(10, 16), PE: leg(10, 22) }
    ];
    // ivNear looks at S*0.9 = 90 on the put side and S*1.1 = 110 on the call side.
    expect(analyseOptions(chain(rows), 100).skew).toBeCloseTo(26 - 16, 10);
  });

  it('holds together on the captured live NSE chain', () => {
    const f = fixture('reliance/option-chain').body;
    const live = {
      expiry: fixture('reliance/option-contract-info').body.expiryDates[0],
      underlying: f.records.underlyingValue,
      data: f.records.data,
      timestamp: f.records.timestamp || null
    };
    const a = analyseOptions(live, live.underlying);

    const strikes = live.data.map((r) => r.strikePrice);
    expect(a.strikes).toBe(live.data.length);
    expect(a.maxPain).toBeGreaterThanOrEqual(Math.min(...strikes));
    expect(a.maxPain).toBeLessThanOrEqual(Math.max(...strikes));
    expect(a.pcrOI).toBeGreaterThan(0);
    expect(a.ladder).toHaveLength(5);
    // Risk-neutral, but still a probability.
    for (const rung of a.ladder) {
      if (rung.pAbove != null) {
        expect(rung.pAbove).toBeGreaterThanOrEqual(0);
        expect(rung.pAbove).toBeLessThanOrEqual(100);
      }
    }
  });
});
