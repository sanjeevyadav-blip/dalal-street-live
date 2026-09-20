// The parity baseline for EPIC-1.
//
// Every pure function is run against the committed fixtures and its output snapshotted.
// Nothing here asserts that a number is *correct* — tests/unit/ does that. What it asserts
// is that the number does not CHANGE. That is the whole safety net: PR-2 deleted 315 lines
// of superseded code and PR-4..6 moved every function into modules, and none of it was
// allowed to move a single digit in this file.
//
// If a snapshot changes, the refactor changed behaviour. There is no benign case.
// Deliberate changes are re-baselined with `vitest -u` in their own commit, never folded
// into a refactor commit.

import { describe, it, expect } from 'vitest';
import { history, annuals, quoteSummary, STOCKS, fixture } from '../helpers/fixtures.js';

// Every function below is imported from a real module as of PR-6. The snapshots were written
// at PR-1, while all of this was still one IIFE inside index.html, and have not been
// regenerated since. That they still pass untouched across five extraction PRs is the proof
// the refactor moved code and nothing else.
import { smaSeries, emaSeries, macdLast, obvTrend } from '../../src/indicators/trend.js';
import { rsiLast, stochasticLast, cagrPct } from '../../src/indicators/momentum.js';
import {
  bollingerLast, atrLast, annualizedVolPct, maxDrawdownPct, sharpeStyleApprox,
  betaAndCorrelation, dailyReturnsByDate
} from '../../src/indicators/volatility.js';
import { detectPatterns, priceAction, pivotPoints } from '../../src/indicators/patterns.js';

import { computeDcf } from '../../src/valuation/dcf.js';
import { reverseDcf } from '../../src/valuation/reverse-dcf.js';
import { earningsQuality } from '../../src/valuation/earnings-quality.js';
import { nCdf } from '../../src/models/normal.js';
import { olsMulti } from '../../src/models/ols.js';
import { gbmProbUp } from '../../src/models/gbm.js';

// Snapshots compare formatted strings, not raw floats: a bare float would make a
// last-bit difference from a reordered sum look identical to a real regression.
const r = (x, dp = 6) => (x == null || Number.isNaN(x) ? null : Number(x).toFixed(dp));
const val = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : x);

const NIFTY = history('nsei');
// betaAndCorrelation takes date-keyed Maps, not packed histories: it intersects on the
// date string so a stock with a different holiday calendar still aligns to the index.
const NIFTY_RETURNS = dailyReturnsByDate(NIFTY.dates, NIFTY.closes);

describe.each(STOCKS)('golden output — %s', (sym) => {
  const h = history(sym);
  const a = annuals(sym);
  const f = quoteSummary(sym);
  const price = h.meta.regularMarketPrice ?? h.closes[h.closes.length - 1];

  it('history unpacks to a consistent shape', () => {
    expect({
      bars: h.closes.length,
      allSeriesAligned:
        h.opens.length === h.closes.length &&
        h.highs.length === h.closes.length &&
        h.lows.length === h.closes.length &&
        h.volumes.length === h.closes.length &&
        h.dates.length === h.closes.length,
      currency: h.meta.currency,
      hasPreviousClose: h.meta.previousClose != null
    }).toMatchSnapshot();
  });

  it('indicators', () => {
    const c = h.closes;
    expect({
      sma50: r(smaSeries(c, 50).at(-1)),
      sma200: r(smaSeries(c, 200).at(-1)),
      ema12: r(emaSeries(c, 12).at(-1)),
      rsi14: r(rsiLast(c, 14)),
      macd: Object.fromEntries(Object.entries(macdLast(c)).map(([k, v]) => [k, r(v)])),
      bollinger: Object.fromEntries(
        Object.entries(bollingerLast(c, 20, 2)).map(([k, v]) => [k, r(v)])
      ),
      atr14: r(atrLast(h.highs, h.lows, c, 14)),
      volPct: r(annualizedVolPct(c))
    }).toMatchSnapshot();
  });

  it('risk and momentum', () => {
    const c = h.closes;
    const bc = betaAndCorrelation(dailyReturnsByDate(h.dates, c), NIFTY_RETURNS);
    const cagr = cagrPct(h.dates, c);
    const vol = annualizedVolPct(c);
    expect({
      beta: r(bc && bc.beta),
      corr: r(bc && bc.corr),
      cagrPct: r(cagr),
      maxDrawdownPct: r(maxDrawdownPct(c)),
      sharpeStyle: r(sharpeStyleApprox(cagr, vol, 7)),
      stochastic: JSON.parse(
        JSON.stringify(stochasticLast(h.highs, h.lows, c, 14, 3), (k, v) =>
          typeof v === 'number' ? r(v) : v
        )
      ),
      obv: obvTrend(c, h.volumes),
      pivots: JSON.parse(
        JSON.stringify(pivotPoints(h.highs, h.lows, c), (k, v) =>
          typeof v === 'number' ? r(v) : v
        )
      )
    }).toMatchSnapshot();
  });

  it('price action and candlestick patterns', () => {
    expect({
      priceAction: JSON.parse(
        JSON.stringify(priceAction(h.highs, h.lows, h.closes), (k, v) =>
          typeof v === 'number' ? r(v, 4) : v
        )
      ),
      patterns: detectPatterns(h.opens, h.highs, h.lows, h.closes)
    }).toMatchSnapshot();
  });

  it('valuation', () => {
    const ks = f.defaultKeyStatistics || {};
    const fd = f.financialData || {};
    const shares = val(ks.sharesOutstanding);
    const beta = val(ks.beta);
    const netDebt = (val(fd.totalDebt) || 0) - (val(fd.totalCash) || 0);

    const d = computeDcf(a, price, shares, beta, netDebt);

    // HDFCBANK is in the fixture set because a bank has no meaningful OCF-minus-capex.
    // Note what today's code actually does: it computes one anyway, with growth pinned at
    // the +20% cap. That is captured here as-is — EPIC-1 preserves behaviour, it does not
    // correct it. Whether a bank should get a DCF at all is a product question, raised
    // separately; changing it here would make the parity gate meaningless.
    const dcf = !d
      ? { outcome: 'no-dcf' }
      : d.error
        ? { outcome: 'declined', error: d.error }
        : {
            outcome: 'computed',
            intrinsic: r(d.intrinsic, 2),
            upside: r(d.upside, 2),
            base: r(d.base, 0),
            growth: r(d.growth),
            disc: r(d.disc),
            sens: d.sens.map((s) => ({ dr: r(s.dr), vals: s.vals.map((v) => r(v, 2)) }))
          };

    const rd =
      d && !d.error ? reverseDcf(price, d.base, shares, d.disc, d.tg, netDebt) : null;

    expect({
      dcf,
      // The growth the current price implies. `capped` matters: it means the bisection hit
      // its -20%/+60% bound, so the figure is a floor or ceiling, not a solution.
      reverseDcf: rd ? { implied: r(rd.implied), capped: rd.capped } : null,
      earningsQuality: JSON.parse(
        JSON.stringify(earningsQuality(a), (k, v) => (typeof v === 'number' ? r(v, 4) : v))
      )
    }).toMatchSnapshot();
  });

  it('models', () => {
    const gbm = (days) => {
      const g = gbmProbUp(h.closes, days);
      return g ? { p: r(g.p, 4), drift: r(g.drift, 4), vol: r(g.vol, 4) } : null;
    };
    expect({ gbm30: gbm(30), gbm90: gbm(90) }).toMatchSnapshot();
  });
});

describe('golden output — shared maths', () => {
  it('nCdf at reference points', () => {
    expect([-1.96, -1, 0, 1, 1.96, 2.576].map((x) => r(nCdf(x), 8))).toMatchSnapshot();
  });

  it('olsMulti on an exact linear system', () => {
    const y = [5, 7, 9, 11, 13];
    const X = [[1], [2], [3], [4], [5]];
    const out = olsMulti(y, X);
    expect(JSON.parse(JSON.stringify(out, (k, v) => (typeof v === 'number' ? r(v) : v))))
      .toMatchSnapshot();
  });

  it('option chain analysis inputs are intact', () => {
    const chain = fixture('reliance/option-chain').body;
    expect({
      strikes: chain.records.data.length,
      hasUnderlying: typeof chain.records.underlyingValue === 'number',
      firstStrikeHasBothSides: Boolean(chain.records.data[0].CE || chain.records.data[0].PE)
    }).toMatchSnapshot();
  });
});
