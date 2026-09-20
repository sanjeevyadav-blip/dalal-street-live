// GBM Monte Carlo — EPIC-5 story E5-1.
//
// src/models/gbm.js already answers "what is the probability the price is higher in N days"
// in closed form, because under geometric Brownian motion that question has an exact answer
// and simulating it would be theatre. What simulation adds is the SHAPE of the distribution:
// how wide the model's own uncertainty is, and how asymmetric, which no single number shows.
//
// WHAT THIS DELIBERATELY DOES NOT PRODUCE
//
// No target price, and no "probability of reaching price X by date Y" — CLAUDE.md hard rule
// 2, and scripts/check-invariants.sh fails the build over either. The distinction being held
// to is not cosmetic:
//
//   A target price asserts where the price WILL go.
//   A simulated interval states how wide THIS MODEL'S uncertainty is, under assumptions
//   printed next to it, given that the future resembles the estimation window.
//
// The second is a statement about the model; only the first is a forecast. To keep that
// distinction visible rather than merely intended, the spread is returned in PERCENT of
// today's price and never as rupee levels: a number like "₹1,480" invites being read as a
// destination, where "-12%" reads as dispersion.
//
// THE ASSUMPTION THAT FAILS
//
// GBM assumes returns are independent, identically distributed and normal. Real equity
// returns are none of those: they cluster (a volatile day is followed by a volatile day,
// which is what GARCH in garch.js exists to capture), they have fat tails, and they gap on
// news. So this understates the chance of a large move, and it understates it most in
// exactly the situations a reader most wants to know about.

import { logReturns, mean, stdev, quantileSorted } from './stats.js';
import { rng, gauss } from './random.js';

const ESTIMATION_WINDOW = 504;   // two years of trading days, overridable via opts.window
const MIN_RETURNS = 60;

/**
 * Simulate `paths` price paths `horizonDays` ahead.
 *
 * @param {number[]} closes
 * @param {number} horizonDays
 * @param {number} [paths]
 * @param {object} [opts]  `dailyVol` overrides the historical volatility — that is how the
 *   GARCH-conditional variant is produced, without duplicating the path loop. `seed` is
 *   fixed by default so the figure only moves when the input moves; see random.js.
 */
export function gbmMonteCarlo(closes, horizonDays, paths = 20000, opts = {}){
  if (!closes || !(horizonDays > 0) || !(paths > 0)) return null;
  // `window` is overridable so this can be pointed at the same data as the closed form in
  // models/gbm.js, which uses 252. Two models answering the same question must be comparable
  // on demand, or "they agree" is never checkable.
  const window = opts.window != null ? opts.window : ESTIMATION_WINDOW;
  const r = logReturns(closes.slice(-window));
  if (r.length < MIN_RETURNS) return null;

  const mu = mean(r);
  const histVol = stdev(r);
  const sig = opts.dailyVol != null ? opts.dailyVol : histVol;
  if (!(sig > 0) || !Number.isFinite(mu)) return null;

  const S0 = closes[closes.length - 1];
  if (!(S0 > 0)) return null;

  const u = rng(opts.seed != null ? opts.seed : 20260829);
  const ends = new Array(paths);

  // NO Ito correction here, and that is the fix relative to the unshipped lab source.
  //
  // probability-lab.NOT-DEPLOYED.js simulated `exp((mu - 0.5*sig^2)*dt + sig*sqrt(dt)*Z)`
  // with `mu` set to the mean of LOG returns. That formula is correct only when mu is the
  // ARITHMETIC drift — the -0.5*sig^2 term is what converts arithmetic drift into log drift.
  // Applying it to a mu that is already a log drift subtracts the correction twice and biases
  // every simulated path downward.
  //
  // It also silently disagreed with the closed form already shipped in models/gbm.js, which
  // computes z = mu*h / (sig*sqrt(h)) with no correction. Two models answering the same
  // question differently is worse than either being slightly wrong, so the Monte Carlo now
  // matches it — and a test asserts the two agree to within simulation error.
  const drift = mu;
  for (let p = 0; p < paths; p++){
    let logS = 0;
    for (let t = 0; t < horizonDays; t++) logS += drift + sig * gauss(u);
    // Accumulate in log space and exponentiate once: multiplying `paths * horizonDays`
    // floats compounds rounding error into the tails, which are the part being measured.
    ends[p] = S0 * Math.exp(logS);
  }
  ends.sort((a, b) => a - b);

  const upCount = ends.reduce((n, x) => n + (x > S0 ? 1 : 0), 0);
  const pUp = upCount / paths;
  const pct = (v) => ((v / S0) - 1) * 100;

  return {
    pUp: pUp * 100,
    // Binomial standard error of the simulation itself. It says how precisely the SIMULATION
    // pinned its own answer; it says nothing about whether the model is right.
    se: Math.sqrt(pUp * (1 - pUp) / paths) * 100,
    medianPct: pct(quantileSorted(ends, 0.5)),
    p05Pct: pct(quantileSorted(ends, 0.05)),
    p95Pct: pct(quantileSorted(ends, 0.95)),
    annDrift: mu * 252 * 100,
    annVol: sig * Math.sqrt(252) * 100,
    histAnnVol: histVol * Math.sqrt(252) * 100,
    usedConditionalVol: opts.dailyVol != null,
    horizonDays,
    paths
  };
}

/**
 * The same simulation run on the GARCH-implied next-day volatility.
 *
 * Worth reporting side by side with the unconditional run rather than instead of it. When
 * the two disagree, the disagreement IS the finding: it means current volatility is far from
 * its long-run level, so the calm-market answer and the current-conditions answer differ —
 * and a reader who saw only one of them would not know that.
 */
export function gbmConditional(closes, horizonDays, dailyVol, paths = 20000){
  if (!(dailyVol > 0)) return null;
  return gbmMonteCarlo(closes, horizonDays, paths, { dailyVol, seed: 987654321 });
}
