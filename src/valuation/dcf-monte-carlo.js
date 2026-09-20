// DCF Monte Carlo — EPIC-5 story E5-3.
//
// WHY THIS EXISTS
//
// computeDcf in dcf.js returns one intrinsic value and a sensitivity grid around it. The
// grid is honest but it is read wrongly: people look at the centre cell and treat it as the
// answer, with the grid as decoration. The whole reason CLAUDE.md hard rule 1 refuses a
// verdict is that a DCF swings 40% or more across a defensible range of assumptions — and a
// single number, however well caveated, does not convey that.
//
// This draws the assumptions from distributions instead and reports the resulting spread.
// The headline is not a value. It is P(intrinsic value above today's price), together with
// the 10th and 90th percentiles of the value distribution — which is the honest shape of a
// DCF's answer.
//
// WHAT THE PROBABILITY DOES AND DOES NOT MEAN
//
// It is the fraction of simulated assumption sets under which this model values the company
// above its market price. It is NOT the probability the stock goes up, it is NOT a
// probability the price reaches any level, and it carries no horizon at all — CLAUDE.md
// hard rule 2. A company can be "80% undervalued by this model" and fall for three years.
//
// It is also not a probability in the frequentist sense, because the distributions the
// assumptions are drawn from are themselves chosen. A wider growth prior yields a spread-out
// answer and a narrower one yields a confident answer, from identical financials. The priors
// below are stated in the source and surfaced in the UI for exactly that reason.
//
// THE PRIORS, AND WHY EACH ONE
//
//   growth    normal around the fitted historical growth, sd 4pp. Wide, because extrapolating
//             a growth rate from five annual cash-flow points is the least reliable step in
//             the whole model.
//   discount  normal around the CAPM-derived rate, sd 1.5pp, clamped to [9%, 18%]. The clamp
//             is not cosmetic: below the terminal rate the geometric series diverges and the
//             model returns a meaningless enormous number.
//   terminal  normal around 4%, sd 0.8pp, clamped to [2%, 5.5%]. A terminal growth rate above
//             long-run nominal GDP implies the company eventually becomes the whole economy.
//
// Draws where the discount rate fails to exceed the terminal rate are DISCARDED rather than
// clamped, and the count is reported: silently clamping them would pile probability mass on
// the boundary and make the tail look tighter than it is.

import { quantileSorted } from '../models/stats.js';
import { rng, gauss } from '../models/random.js';

export const PRIORS = {
  growthSd: 0.04,
  discountSd: 0.015,
  discountMin: 0.09,
  discountMax: 0.18,
  terminalMean: 0.04,
  terminalSd: 0.008,
  terminalMin: 0.02,
  terminalMax: 0.055
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * @param {number} base      base free cash flow (OCF minus capex), from computeDcf
 * @param {number} shares    shares outstanding
 * @param {number} netDebt   total debt minus total cash
 * @param {number} price     today's market price
 * @param {number} gMid      centre of the growth prior — computeDcf's fitted growth
 * @param {number} dMid      centre of the discount prior — computeDcf's CAPM rate
 * @param {number} [runs]
 */
export function dcfMonteCarlo(base, shares, netDebt, price, gMid, dMid, runs = 20000){
  if (!(base > 0) || !(shares > 0) || !(price > 0)) return null;
  if (!Number.isFinite(gMid) || !Number.isFinite(dMid)) return null;

  const u = rng(13579);
  const vals = [];
  let discarded = 0;

  for (let i = 0; i < runs; i++){
    const g = gMid + gauss(u) * PRIORS.growthSd;
    const d = clamp(dMid + gauss(u) * PRIORS.discountSd, PRIORS.discountMin, PRIORS.discountMax);
    const tg = clamp(PRIORS.terminalMean + gauss(u) * PRIORS.terminalSd, PRIORS.terminalMin, PRIORS.terminalMax);
    if (d <= tg){ discarded++; continue; }

    let f = base, pv = 0;
    // Ten explicit years with growth fading 15% a year toward the terminal rate, then a
    // Gordon terminal value. Same structure as computeDcf, so the two are comparable — this
    // varies the inputs, it does not change the model.
    for (let y = 1; y <= 10; y++){
      const gy = g * Math.pow(0.85, y - 1);
      f = f * (1 + Math.max(tg, gy));
      pv += f / Math.pow(1 + d, y);
    }
    const terminal = (f * (1 + tg)) / (d - tg) / Math.pow(1 + d, 10);
    vals.push((pv + terminal - (netDebt || 0)) / shares);
  }

  if (vals.length < runs * 0.5) return null;   // too much of the prior was infeasible to trust
  vals.sort((a, b) => a - b);

  const above = vals.reduce((n, v) => n + (v > price ? 1 : 0), 0);
  const pUnder = above / vals.length;

  const median = quantileSorted(vals, 0.5);
  const p10 = quantileSorted(vals, 0.10);
  const p90 = quantileSorted(vals, 0.90);

  return {
    // "Under this model, on this fraction of drawn assumption sets, the company is worth
    // more than it currently trades for." Not a probability the price rises.
    pUndervalued: pUnder * 100,
    se: Math.sqrt(pUnder * (1 - pUnder) / vals.length) * 100,
    medianValue: median,
    p10Value: p10,
    p90Value: p90,
    // The spread as a multiple of the median. This is the number that makes the point: a
    // ratio near 3 means the 90th percentile is three times the 10th, from assumptions that
    // are all individually defensible.
    spreadRatio: p10 > 0 ? p90 / p10 : Infinity,
    medianUpsidePct: ((median / price) - 1) * 100,
    runs: vals.length,
    discarded,
    priors: PRIORS
  };
}
