// Shared statistics for the model layer — EPIC-5.
//
// These exist separately from src/indicators/util.js on purpose. `average` there divides by
// `arr.length || 1`, so an empty array returns 0 rather than NaN — deliberate, load-bearing
// at its call sites, and asserted in the indicator tests. That behaviour is wrong here: a
// model handed no data must not be told the mean is zero, because zero is a perfectly
// plausible mean log-return and the model would carry on and produce a confident-looking
// answer built on nothing. These return NaN and let the caller's guard clause fire.

/**
 * Continuously-compounded daily returns.
 *
 * Log returns rather than simple returns because they add across time, which is what every
 * model below relies on when it scales a daily figure to a horizon: a 10-day log return is
 * the sum of ten daily ones, so its variance is ten times the daily variance. Simple returns
 * compound instead of adding and that identity does not hold.
 *
 * Non-positive or non-finite closes are skipped rather than producing -Infinity or NaN:
 * Yahoo occasionally emits a zero close on a halted scrip.
 */
export function logReturns(closes){
  const out = [];
  if (!closes) return out;
  for (let i = 1; i < closes.length; i++){
    const prev = closes[i-1], now = closes[i];
    if (!(prev > 0) || !(now > 0)) continue;
    const r = Math.log(now / prev);
    if (Number.isFinite(r)) out.push(r);
  }
  return out;
}

/** Arithmetic mean. NaN on an empty array — see the note at the top. */
export function mean(a){
  if (!a || !a.length) return NaN;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

/**
 * SAMPLE standard deviation — divides by n-1, not n.
 *
 * These are samples of a return process, not a whole population, so the n-1 denominator is
 * the unbiased estimator. The difference is under half a percent at the 250+ observations
 * these models use, but getting it wrong understates volatility systematically, and
 * volatility understated in one place propagates into every probability downstream.
 */
export function stdev(a){
  if (!a || a.length < 2) return NaN;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++){ const d = a[i] - m; s += d * d; }
  return Math.sqrt(s / (a.length - 1));
}

/**
 * The value at percentile p (0..1) of an ALREADY SORTED ascending array.
 *
 * Nearest-rank, not interpolated. At the thousands of samples these models draw the two
 * agree to well past the precision anything is reported at, and nearest-rank has the
 * property that every quantile it returns is a value the simulation actually produced.
 */
export function quantileSorted(sorted, p){
  if (!sorted || !sorted.length) return NaN;
  const idx = Math.floor(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))];
}
