// Walk-forward logistic classifier — EPIC-5 story E5-2.
//
// THE POINT OF THIS MODEL IS THAT IT USUALLY FAILS
//
// Every other model here says what it believes. This one says whether believing it would
// have been worth anything, which is a different and much harder question, and the honest
// answer for short-horizon equity direction is usually no.
//
// It fits a logistic regression on eight technical features — RSI, MACD histogram, distance
// from the 20- and 50-day averages, relative volume, and one- and three-month momentum — to
// predict whether the price is higher `horizon` days later. Then it evaluates strictly out
// of sample on data the fit never saw.
//
// THE NUMBER THAT MATTERS IS `edge`, NOT `accuracy`
//
// Accuracy alone is close to meaningless for this problem. If a stock rose on 56% of the
// days in the test window, a model that predicts "up" unconditionally scores 56% and has
// learned nothing. `edge` is out-of-sample accuracy minus the majority-class base rate —
// what the model adds over always guessing the more common answer. An edge at or below zero
// means the features carried no usable information, and that is the expected result. The
// acceptance criterion for this story is that the model REPORTS this, not that it wins.
//
// `brier` is the companion measure: the mean squared error of the probabilities themselves.
// A model can be accurate and badly calibrated — right about direction while wildly
// overconfident — and the Brier score is what exposes it. Below 0.25 is better than a
// constant 50% guess; above it, worse.
//
// HOW THE SPLIT WORKS, AND THE LEAK THAT IS AVOIDED
//
// Train on the first 70% of rows chronologically, test on the last 30%. Not a random split:
// a random split would put tomorrow in the training set and yesterday in the test set, and
// with overlapping `horizon`-day labels that leaks the answer directly. The rows are also
// built from index 210 onwards so every feature has its full lookback, and stop `horizon`
// days before the end so every row has a real outcome.
//
// The one leak NOT eliminated: consecutive rows overlap, because a 21-day-ahead label on
// Monday shares 20 of its days with Tuesday's. That inflates the effective sample size and
// makes the accuracy figure less precise than its row count suggests. Fixing it properly
// means non-overlapping blocks, which at 500 usable rows leaves about 24 test cases — too
// few to measure anything. The overlap is the lesser evil, and this is where it is recorded.

import { mean } from './stats.js';
import { smaSeries, macdSeriesFull } from '../indicators/trend.js';
import { rsiSeriesFull } from '../indicators/momentum.js';

const MIN_BARS = 320;
const MIN_ROWS = 120;
const WARMUP = 210;
const EPOCHS = 400;
const LEARNING_RATE = 0.05;
const L2 = 0.01;

function featureRow(c, i, volumes, s20, s50, rsiF, macdF){
  const vAvg = mean(volumes.slice(Math.max(0, i - 20), i));
  const vRef = vAvg > 0 ? vAvg : 1;
  // Each feature is scaled to roughly unit range so no single one dominates the gradient.
  // The constants are crude on purpose: standardising against the whole series would use
  // test-set statistics during training, which is the subtlest form of the leak above.
  return [
    1,
    (rsiF[i] - 50) / 25,
    macdF.histArr[i] / (c[i] * 0.02),
    (c[i] / s20[i] - 1) * 20,
    (c[i] / s50[i] - 1) * 10,
    Math.min(3, volumes[i] / vRef) - 1,
    (c[i] / c[i-21] - 1) * 5,
    (c[i] / c[i-63] - 1) * 3
  ].map((x) => (Number.isFinite(x) ? x : 0));
}

export function walkForwardLogistic(closes, volumes, horizon){
  const c = closes;
  if (!c || !volumes || !(horizon > 0)) return null;
  const n = c.length;
  if (n < MIN_BARS) return null;

  const s20 = smaSeries(c, 20), s50 = smaSeries(c, 50);
  const rsiF = rsiSeriesFull(c, 14), macdF = macdSeriesFull(c);

  const rows = [];
  for (let i = WARMUP; i < n - horizon; i++){
    if (rsiF[i] == null || s50[i] == null || s20[i] == null) continue;
    rows.push({ f: featureRow(c, i, volumes, s20, s50, rsiF, macdF), y: c[i + horizon] > c[i] ? 1 : 0 });
  }
  if (rows.length < MIN_ROWS) return null;

  const split = Math.floor(rows.length * 0.7);
  const train = rows.slice(0, split), test = rows.slice(split);
  if (!train.length || !test.length) return null;

  const k = train[0].f.length;
  const w = new Array(k).fill(0);
  // Batch gradient descent with L2. Not the fastest fitter available, but it is 15 lines,
  // has no dependency, and converges reliably on a problem this small.
  for (let ep = 0; ep < EPOCHS; ep++){
    const g = new Array(k).fill(0);
    for (let i = 0; i < train.length; i++){
      let z = 0;
      for (let j = 0; j < k; j++) z += w[j] * train[i].f[j];
      const p = 1 / (1 + Math.exp(-z));
      const err = p - train[i].y;
      for (let j = 0; j < k; j++) g[j] += err * train[i].f[j];
    }
    for (let j = 0; j < k; j++) w[j] -= LEARNING_RATE * (g[j] / train.length + L2 * w[j]);
  }

  const predict = (f) => {
    let z = 0;
    for (let j = 0; j < k; j++) z += w[j] * f[j];
    return 1 / (1 + Math.exp(-z));
  };

  let correct = 0, brier = 0;
  for (const row of test){
    const p = predict(row.f);
    if ((p > 0.5 ? 1 : 0) === row.y) correct++;
    brier += (p - row.y) * (p - row.y);
  }
  const accuracy = correct / test.length;
  const upRate = mean(test.map((r) => r.y));
  // The majority class is what a model must beat to have added anything. If the stock rose
  // on 56% of test days, predicting "up" every time scores 56%.
  const baseRate = Math.max(upRate, 1 - upRate);

  // Current prediction, from the most recent complete bar.
  const i = n - 1;
  if (rsiF[i] == null || s20[i] == null || s50[i] == null) return null;
  const pNow = predict(featureRow(c, i, volumes, s20, s50, rsiF, macdF));

  return {
    pUp: pNow * 100,
    accuracy: accuracy * 100,
    baseRate: baseRate * 100,
    upRate: upRate * 100,
    edge: (accuracy - baseRate) * 100,
    brier: brier / test.length,
    // Everything below 0 means the features added nothing out of sample, which is the
    // expected outcome and must be reported as prominently as the probability itself.
    hasEdge: accuracy > baseRate,
    nTrain: train.length,
    nTest: test.length,
    horizon
  };
}
