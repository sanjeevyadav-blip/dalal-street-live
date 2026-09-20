// GARCH(1,1) — EPIC-5 story E5-1.
//
// WHAT IT IS FOR
//
// Every other volatility number in this app is an average over a window: annualizedVolPct
// takes the standard deviation of the last year and calls it "the" volatility. That answers
// "how volatile has this been", which is not the question anyone actually has. The question
// is "how volatile is this NOW", and those differ whenever the market has just moved.
//
// GARCH exists because volatility clusters. A large move is followed by more large moves,
// and calm is followed by calm — the single most reliable empirical regularity in equity
// returns, and the one a rolling-window standard deviation averages away. The model says
// tomorrow's variance is a blend of three things:
//
//     sigma2(t) = omega + alpha * e(t-1)^2 + beta * sigma2(t-1)
//                 \_ long-run  \_ yesterday's   \_ yesterday's
//                    anchor       surprise         variance
//
// alpha is how sharply it reacts to news; beta is how long it remembers. Their sum is the
// persistence, and it is usually just under 1 for equities, which is why a volatility shock
// takes weeks rather than days to decay.
//
// HOW IT IS FITTED, AND THE HONEST LIMITATION
//
// A coarse grid search on (alpha, beta) maximising the Gaussian log-likelihood, with omega
// pinned so the model's unconditional variance matches the sample variance — "variance
// targeting". That is not a proper optimiser: a real implementation would run BFGS on all
// three parameters at once and report standard errors on each.
//
// The grid is used anyway, deliberately. It runs in a few milliseconds in a browser with no
// dependencies, it cannot diverge or return a non-stationary fit, and at a 0.02 grid step
// the log-likelihood surface for GARCH(1,1) is flat enough that the fitted next-day
// volatility is within a few tenths of a percent of the optimum. What is genuinely lost is
// parameter uncertainty: this reports alpha and beta as though they were known, and they are
// not. Treat the persistence and half-life as indicative, not measured.
//
// Returns null below 250 returns, because a model with three parameters fitted to less than
// a year of daily data is fitting noise.

import { logReturns, mean } from './stats.js';

const WINDOW = 756;          // three years
const MIN_RETURNS = 250;
const LOG_2PI = Math.log(2 * Math.PI);

export function fitGarch(closes){
  const r = logReturns((closes || []).slice(-WINDOW));
  if (r.length < MIN_RETURNS) return null;

  const m = mean(r);
  const e = r.map((x) => x - m);
  const varUnc = mean(e.map((x) => x * x));
  if (!(varUnc > 0)) return null;

  let best = null;
  for (let a = 0.02; a <= 0.30 + 1e-9; a += 0.02){
    for (let b = 0.55; b <= 0.97 + 1e-9; b += 0.02){
      // alpha + beta >= 1 is a non-stationary fit: unconditional variance is infinite and
      // the half-life below would be meaningless. Skipped rather than fitted and caveated.
      if (a + b >= 0.999) continue;
      const w = varUnc * (1 - a - b);
      let s2 = varUnc, ll = 0, ok = true;
      for (let i = 0; i < e.length; i++){
        if (!(s2 > 0)){ ok = false; break; }
        ll += -0.5 * (LOG_2PI + Math.log(s2) + (e[i] * e[i]) / s2);
        s2 = w + a * e[i] * e[i] + b * s2;
      }
      if (ok && (best === null || ll > best.ll)) best = { a, b, w, ll, nextVar: s2 };
    }
  }
  if (!best || !(best.nextVar > 0)) return null;

  const persistence = best.a + best.b;
  // Trading days for a volatility shock to decay halfway back to the long-run level. The
  // single most useful output here: it turns "volatility is elevated" into "and it will take
  // about three weeks to come back", which is a different decision.
  const halfLife = persistence < 1 ? Math.log(0.5) / Math.log(persistence) : Infinity;

  const nextDayVol = Math.sqrt(best.nextVar);
  return {
    alpha: best.a,
    beta: best.b,
    omega: best.w,
    logLik: best.ll,
    persistence,
    halfLife,
    nextDayVol,                                        // daily, as a fraction
    nextDayVolPct: nextDayVol * 100,
    annVolNow: Math.sqrt(best.nextVar * 252) * 100,    // conditional, annualised
    annVolUnc: Math.sqrt(varUnc * 252) * 100,          // long-run, annualised
    // Above 1 means the market is currently more volatile than its own three-year norm.
    // This ratio is what makes the two numbers comparable at a glance.
    volRatio: Math.sqrt(best.nextVar / varUnc),
    n: r.length
  };
}
