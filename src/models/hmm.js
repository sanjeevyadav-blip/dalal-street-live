// Two-state Gaussian hidden Markov model, fitted by Baum-Welch — EPIC-5 story E5-2.
//
// WHAT IT IS FOR
//
// Markets alternate between calm stretches with a mild upward drift and turbulent stretches
// with a sharp downward one. A single mean and standard deviation over two years describes
// neither: it produces a number no day actually looked like. This model assumes there are
// two hidden states, each with its own mean and volatility, and that today's state depends
// only on yesterday's. Baum-Welch (expectation-maximisation) infers the states, their
// parameters and the transition probabilities, all from the returns alone — nothing is
// labelled by hand.
//
// The useful outputs are not the state labels. They are:
//   - the PROBABILITY the market is currently in each state, which is a number between 0 and
//     1, not a verdict;
//   - how STICKY each state is, which says how long a regime tends to last and therefore how
//     much weight today's classification deserves.
//
// WHAT IT CANNOT DO, AND THE MISREADING TO AVOID
//
// This is a description of the past fitted to the present, not a forecast. The single most
// important caveat: the model is fitted on the WHOLE window including recent data, so its
// view of today is not an out-of-sample judgement. It will always look like it identified
// the last crash, because it was shown the last crash.
//
// A two-state model is also a strong assumption. Real markets have more than two moods, and
// a genuine third regime — say a slow grinding melt-up — gets split across the two states
// rather than recognised. When both states have similar means, the "regime" reported here is
// close to meaningless, which is why `separation` is returned: it says how distinguishable
// the two fitted states actually are, and a reader should discount everything else when it
// is low.
//
// Returns null below 200 returns.

import { logReturns, mean, stdev } from './stats.js';

const WINDOW = 756;
const MIN_RETURNS = 200;
const ITERATIONS = 40;
const FLOOR = 1e-300;   // keeps a vanishing density from zeroing the whole forward pass

export function fitHmm(closes){
  const r = logReturns((closes || []).slice(-WINDOW));
  if (r.length < MIN_RETURNS) return null;

  const sd = stdev(r), m = mean(r);
  if (!(sd > 0)) return null;

  // Initialised deliberately asymmetrically — one calmer state with a higher mean, one
  // volatile state with a lower one. EM finds a local optimum, so where it starts decides
  // which optimum it reaches; starting symmetric would let both states converge on the same
  // parameters and the fit would carry no information.
  const mu = [m + 0.3 * sd, m - 0.3 * sd];
  const sg = [sd * 0.7, sd * 1.6];
  const A = [[0.95, 0.05], [0.10, 0.90]];
  let pi = [0.5, 0.5];
  const N = r.length;

  const pdf = (x, i) => {
    const d = (x - mu[i]) / sg[i];
    return Math.exp(-0.5 * d * d) / (sg[i] * Math.sqrt(2 * Math.PI)) + FLOOR;
  };

  let gamma = null;
  for (let iter = 0; iter < ITERATIONS; iter++){
    // Forward pass, rescaled at every step. Without rescaling the joint probability of 750
    // observations underflows to zero within about 30 steps and the whole fit is NaN.
    const al = [], be = [], sc = [];
    const a0 = [pi[0] * pdf(r[0], 0), pi[1] * pdf(r[0], 1)];
    const s0 = a0[0] + a0[1];
    sc.push(s0);
    al.push([a0[0] / s0, a0[1] / s0]);
    for (let t = 1; t < N; t++){
      const prev = al[t-1];
      const a = [
        (prev[0] * A[0][0] + prev[1] * A[1][0]) * pdf(r[t], 0),
        (prev[0] * A[0][1] + prev[1] * A[1][1]) * pdf(r[t], 1)
      ];
      const s = a[0] + a[1];
      sc.push(s);
      al.push([a[0] / s, a[1] / s]);
    }

    // Backward pass, using the same scaling factors so alpha*beta is a proper posterior.
    be[N-1] = [1, 1];
    for (let t = N - 2; t >= 0; t--){
      const nx = be[t+1];
      be[t] = [
        (A[0][0] * pdf(r[t+1], 0) * nx[0] + A[0][1] * pdf(r[t+1], 1) * nx[1]) / sc[t+1],
        (A[1][0] * pdf(r[t+1], 0) * nx[0] + A[1][1] * pdf(r[t+1], 1) * nx[1]) / sc[t+1]
      ];
    }

    gamma = [];
    for (let t = 0; t < N; t++){
      const g0 = al[t][0] * be[t][0], g1 = al[t][1] * be[t][1];
      const s = (g0 + g1) || 1;
      gamma.push([g0 / s, g1 / s]);
    }

    // Re-estimate transitions, means and variances from the posteriors.
    const xi = [[0, 0], [0, 0]];
    for (let t = 0; t < N - 1; t++){
      for (let i = 0; i < 2; i++){
        for (let j = 0; j < 2; j++){
          xi[i][j] += al[t][i] * A[i][j] * pdf(r[t+1], j) * be[t+1][j] / sc[t+1];
        }
      }
    }
    for (let i = 0; i < 2; i++){
      const tot = (xi[i][0] + xi[i][1]) || 1;
      A[i][0] = xi[i][0] / tot;
      A[i][1] = xi[i][1] / tot;
      let gs = 0, ms = 0;
      for (let t = 0; t < N; t++){ gs += gamma[t][i]; ms += gamma[t][i] * r[t]; }
      mu[i] = ms / (gs || 1);
      let vs = 0;
      for (let t = 0; t < N; t++){ const d = r[t] - mu[i]; vs += gamma[t][i] * d * d; }
      // Falling back to the sample sd keeps a collapsed state (one that captured almost no
      // observations) from becoming a zero-width spike that swallows the likelihood.
      sg[i] = Math.sqrt(vs / (gs || 1)) || sd;
    }
    pi = [gamma[0][0], gamma[0][1]];
  }

  const now = gamma[N-1];
  // Label by fitted mean, not by index: EM has no notion of "bull", and which index ends up
  // as which state depends on the data.
  const bullIdx = mu[0] >= mu[1] ? 0 : 1;
  const bearIdx = 1 - bullIdx;

  const pBull = now[bullIdx];
  const nextBull = now[bullIdx] * A[bullIdx][bullIdx] + now[bearIdx] * A[bearIdx][bullIdx];
  const expRet = nextBull * mu[bullIdx] + (1 - nextBull) * mu[bearIdx];
  const blendVar = nextBull * sg[bullIdx] * sg[bullIdx] + (1 - nextBull) * sg[bearIdx] * sg[bearIdx];

  // How far apart the two fitted states actually are — Bhattacharyya distance between the
  // two Gaussians.
  //
  // The obvious measure, |mu1 - mu2| scaled by volatility, is wrong here and was tried
  // first. Equity regimes differ mainly in VOLATILITY, not in mean: a crash state is defined
  // by 40% annualised volatility far more than by its drift. A mean-only measure scored a
  // genuinely regime-switching series BELOW a plain random walk, because the switching
  // series' large volatility gap inflated the denominator.
  //
  // Bhattacharyya distance takes both terms — the variance ratio and the standardised mean
  // gap — so a pair of states that differ only in spread still registers as distinguishable.
  // Roughly: below 0.1 the split is arbitrary and everything else here should be discounted;
  // above 0.3 the two states are genuinely different animals.
  const v1 = sg[bullIdx] * sg[bullIdx], v2 = sg[bearIdx] * sg[bearIdx];
  const dMean = mu[bullIdx] - mu[bearIdx];
  const separation = (v1 > 0 && v2 > 0)
    ? 0.25 * Math.log(0.25 * (v1 / v2 + v2 / v1 + 2)) + 0.25 * (dMean * dMean) / (v1 + v2)
    : 0;

  return {
    pBullNow: pBull * 100,
    pBullNext: nextBull * 100,
    muBullAnn: mu[bullIdx] * 252 * 100,
    muBearAnn: mu[bearIdx] * 252 * 100,
    volBullAnn: sg[bullIdx] * Math.sqrt(252) * 100,
    volBearAnn: sg[bearIdx] * Math.sqrt(252) * 100,
    // P(staying) per day. 0.95 means a regime survives about 20 trading days on average.
    stickBull: A[bullIdx][bullIdx] * 100,
    stickBear: A[bearIdx][bearIdx] * 100,
    expectedDaysBull: A[bullIdx][bullIdx] < 1 ? 1 / (1 - A[bullIdx][bullIdx]) : Infinity,
    expectedDaysBear: A[bearIdx][bearIdx] < 1 ? 1 / (1 - A[bearIdx][bearIdx]) : Infinity,
    expRetAnn: expRet * 252 * 100,
    blendVolAnn: Math.sqrt(blendVar * 252) * 100,
    separation,
    regime: pBull > 0.6 ? 'Calmer, higher-drift state'
      : pBull < 0.4 ? 'Volatile, lower-drift state'
        : 'Between states',
    n: N
  };
}
