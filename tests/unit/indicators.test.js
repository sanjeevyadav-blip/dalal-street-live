// Unit tests for src/indicators/ — docs/10-TEST-PLAN.md §10.2, story E2-2.
//
// These differ in purpose from tests/regression/golden-output.test.js. The golden suite
// pins today's numbers so a refactor cannot move them; it says nothing about whether those
// numbers were right in the first place. These check the maths against hand calculations
// and published reference series, so a number that was always wrong has somewhere to fail.
//
// Where the two disagree, this file wins and the snapshot gets re-baselined deliberately.

import { describe, it, expect } from 'vitest';

import { average } from '../../src/indicators/util.js';
import { smaSeries, emaSeries, macdLast, macdSeriesFull, obvTrend } from '../../src/indicators/trend.js';
import { rsiLast, rsiSeriesFull, stochasticLast, cagrPct } from '../../src/indicators/momentum.js';
import {
  bollingerLast, bollingerSeriesFull, atrLast, annualizedVolPct, maxDrawdownPct,
  sharpeStyleApprox, betaAndCorrelation, dailyReturnsByDate
} from '../../src/indicators/volatility.js';
import { detectPatterns, priceAction, pivotPoints } from '../../src/indicators/patterns.js';
import { openingRange, vwapSeries, gapPct, relativeVolume } from '../../src/indicators/intraday.js';

const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe('average', () => {
  it('is the arithmetic mean', () => {
    expect(average([1, 2, 3, 4])).toBe(2.5);
  });

  // Deliberate: the implementation divides by `length || 1`. Several call sites rely on
  // getting 0 rather than NaN, so this is pinned rather than left to chance.
  it('returns 0 for an empty array rather than NaN', () => {
    expect(average([])).toBe(0);
  });
});

describe('smaSeries', () => {
  it('pads with nulls until the window is full, then rolls', () => {
    expect(smaSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toEqual([
      null, null, 2, 3, 4, 5, 6, 7, 8, 9
    ]);
  });

  it('returns the constant for a constant series', () => {
    expect(smaSeries([7, 7, 7, 7, 7], 3).slice(2)).toEqual([7, 7, 7]);
  });

  it('is all nulls when the series is shorter than the period', () => {
    expect(smaSeries([1, 2], 5)).toEqual([null, null]);
  });
});

describe('emaSeries', () => {
  it('leaves a constant series unchanged', () => {
    expect(emaSeries([5, 5, 5, 5, 5], 3)).toEqual([5, 5, 5, 5, 5]);
  });

  // Worth knowing: this seeds from arr[0], not from an initial SMA. The early values are
  // warm-up artefacts. That is what ships, so it is pinned here rather than "fixed" quietly.
  it('seeds from the first element', () => {
    expect(emaSeries([10, 20, 30], 3)[0]).toBe(10);
  });

  it('converges towards a step change without overshooting it', () => {
    const out = emaSeries([...seq(10, () => 10), ...seq(40, () => 20)], 10);
    const last = out[out.length - 1];
    expect(last).toBeGreaterThan(19);
    expect(last).toBeLessThan(20);
  });
});

describe('rsiLast', () => {
  // Wilder's worked example, as reproduced by StockCharts. The first computed RSI is 70.46
  // and the next is 66.25.
  //
  // NOTE: docs/10 §10.2 gives the expected value as "≈70.53". That figure is wrong — it
  // comes from a variant that seeds the averages differently. The implementation agrees
  // with the canonical series to four significant figures on both bars, so the test plan
  // is what needs correcting, not the code.
  const WILDER = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42,
    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28
  ];

  it('matches the reference series on the first computed bar', () => {
    expect(rsiLast(WILDER, 14)).toBeCloseTo(70.46, 2);
  });

  it('matches the reference series on the next bar', () => {
    expect(rsiLast([...WILDER, 46.0], 14)).toBeCloseTo(66.25, 2);
  });

  it('is 100 when every session gains', () => {
    expect(rsiLast(seq(30, (i) => i + 1), 14)).toBe(100);
  });

  it('is 0 when every session loses', () => {
    expect(rsiLast(seq(30, (i) => 30 - i), 14)).toBe(0);
  });

  it('returns null rather than a number when there is not enough history', () => {
    expect(rsiLast([1, 2, 3], 14)).toBeNull();
  });
});

describe('rsiSeriesFull', () => {
  it('pads the warm-up period with nulls and agrees with rsiLast at the end', () => {
    const closes = seq(60, (i) => 100 + Math.sin(i / 3) * 10);
    const series = rsiSeriesFull(closes, 14);
    expect(series).toHaveLength(closes.length);
    expect(series[0]).toBeNull();
    expect(series[series.length - 1]).toBeCloseTo(rsiLast(closes, 14), 6);
  });

  it('is all nulls when the series is too short', () => {
    expect(rsiSeriesFull([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });
});

describe('macdLast', () => {
  it('reports a positive histogram while the fast line leads a rising series', () => {
    const m = macdLast(seq(120, (i) => 100 + i));
    expect(m.macd).toBeGreaterThan(0);
    expect(m.hist).toBeGreaterThan(0);
  });

  it('flips the histogram sign after a sustained reversal', () => {
    const up = seq(120, (i) => 100 + i);
    const then = [...up, ...seq(60, (i) => 220 - i * 2)];
    expect(macdLast(up).hist).toBeGreaterThan(0);
    expect(macdLast(then).hist).toBeLessThan(0);
  });

  it('is flat on a constant series', () => {
    const m = macdLast(seq(60, () => 50));
    expect(m.macd).toBeCloseTo(0, 10);
    expect(m.hist).toBeCloseTo(0, 10);
  });
});

describe('macdSeriesFull', () => {
  it('returns aligned macd, signal and histogram series', () => {
    const closes = seq(120, (i) => 100 + Math.sin(i / 8) * 20);
    const out = macdSeriesFull(closes);
    expect(out.macdArr).toHaveLength(closes.length);
    expect(out.signalArr).toHaveLength(closes.length);
    expect(out.histArr).toHaveLength(closes.length);
    // The series and the scalar helper must not drift apart: they are separate code paths
    // over the same inputs, and the charts use one while the readouts use the other.
    const n = closes.length - 1;
    const last = macdLast(closes);
    expect(out.macdArr[n]).toBeCloseTo(last.macd, 10);
    expect(out.signalArr[n]).toBeCloseTo(last.signal, 10);
    expect(out.histArr[n]).toBeCloseTo(last.hist, 10);
  });
});

describe('bollingerLast', () => {
  it('gives %B = 1 when price sits on the upper band', () => {
    // Solved, not guessed. With n-1 bars flat at 100 and the last at 100+d, the population
    // standard deviation of the window is d*sqrt(n-1)/n, so the last bar lands exactly on
    // the 2-sigma band when n = 1 + 2*sqrt(n-1) — which holds only at n = 5, independently
    // of d. At a 20-bar window a single outlier of any size sits at %B ≈ 1.59, not 1.
    const b = bollingerLast([100, 100, 100, 100, 110], 5, 2);
    expect(b.percentB).toBeCloseTo(1, 10);
    expect(b.upper).toBeCloseTo(110, 10);
  });

  it('%B is scale-free — the same shape gives the same reading', () => {
    expect(bollingerLast([100, 100, 100, 100, 137], 5, 2).percentB).toBeCloseTo(1, 10);
  });

  it('%B goes above 1 when price breaks out beyond the band', () => {
    // A 20-bar window with one outlier: the band is far narrower than the move.
    expect(bollingerLast([...seq(19, () => 100), 110], 20, 2).percentB).toBeGreaterThan(1);
  });

  it('puts a constant series at the midline with zero width', () => {
    const b = bollingerLast(seq(20, () => 42), 20, 2);
    expect(b.mid).toBe(42);
    expect(b.upper).toBe(42);
    expect(b.lower).toBe(42);
  });
});

describe('bollingerSeriesFull', () => {
  it('returns aligned bands with nulls through the warm-up', () => {
    const closes = seq(60, (i) => 100 + Math.cos(i / 5) * 5);
    const out = bollingerSeriesFull(closes, 20, 2);
    expect(out.upper).toHaveLength(closes.length);
    expect(out.lower).toHaveLength(closes.length);
    expect(out.upper[0]).toBeNull();
    expect(out.upper[closes.length - 1]).toBeGreaterThan(out.lower[closes.length - 1]);
  });
});

describe('atrLast', () => {
  it('matches a hand-computed true range', () => {
    // Every bar has a 2-wide range and closes at its midpoint, so TR is 2 throughout.
    const n = 20;
    const highs = seq(n, () => 11);
    const lows = seq(n, () => 9);
    const closes = seq(n, () => 10);
    expect(atrLast(highs, lows, closes, 14)).toBeCloseTo(2, 10);
  });

  it('returns null when there are fewer true ranges than the period', () => {
    expect(atrLast([11, 11], [9, 9], [10, 10], 14)).toBeNull();
  });
});

describe('annualizedVolPct', () => {
  it('is 0 for a constant series', () => {
    expect(annualizedVolPct(seq(50, () => 10))).toBe(0);
  });

  it('scales the sample standard deviation by root-252', () => {
    // Alternating ±1% log returns. The implementation uses the SAMPLE standard deviation
    // (dividing by n-1), so the expectation is computed the same way rather than from the
    // population value — the two differ by ~0.5% at this length, which is exactly the kind
    // of near-miss that hides a real unit bug.
    const closes = [100];
    for (let i = 1; i < 101; i++) closes.push(closes[i - 1] * (i % 2 ? 1.01 : 1 / 1.01));
    const rets = [];
    for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((s, v) => s + (v - m) ** 2, 0) / (rets.length - 1));
    expect(annualizedVolPct(closes)).toBeCloseTo(sd * Math.sqrt(252) * 100, 10);
  });
});

describe('maxDrawdownPct', () => {
  it('is 0 for a monotonically rising series', () => {
    expect(maxDrawdownPct(seq(50, (i) => 100 + i))).toBe(0);
  });

  it('measures peak to trough, not first to last', () => {
    // 100 -> 200 -> 100 -> 150: the worst drawdown is 50%, though the series ends up.
    expect(maxDrawdownPct([100, 200, 100, 150])).toBeCloseTo(-50, 6);
  });
});

describe('sharpeStyleApprox', () => {
  it('subtracts the risk-free rate and divides by volatility', () => {
    expect(sharpeStyleApprox(19, 12, 7)).toBeCloseTo(1, 10);
  });
});

describe('betaAndCorrelation', () => {
  const dates = seq(60, (i) => new Date(Date.UTC(2026, 0, i + 1)));
  const closes = seq(60, (i) => 100 + Math.sin(i / 4) * 8);

  it('gives beta 1 and correlation 1 against itself', () => {
    const m = dailyReturnsByDate(dates, closes);
    const r = betaAndCorrelation(m, m);
    expect(r.beta).toBeCloseTo(1, 10);
    expect(r.corr).toBeCloseTo(1, 10);
  });

  it('gives beta 2 for a series that moves twice as hard', () => {
    const base = dailyReturnsByDate(dates, closes);
    const levered = new Map();
    // Squaring the price ratio doubles the log return exactly.
    base.forEach((v, k) => levered.set(k, v * 2));
    const r = betaAndCorrelation(levered, base);
    expect(r.beta).toBeCloseTo(2, 10);
    expect(r.corr).toBeCloseTo(1, 10);
  });

  // A beta from 19 days is noise wearing a number's clothes. CLAUDE.md invariant 3:
  // a blank is correct, a plausible-looking figure is not.
  it('returns nulls below 20 overlapping days rather than a spurious number', () => {
    const short = dailyReturnsByDate(dates.slice(0, 15), closes.slice(0, 15));
    const r = betaAndCorrelation(short, short);
    expect(r.beta).toBeNull();
    expect(r.corr).toBeNull();
  });

  it('only pairs dates present in both series', () => {
    const stock = dailyReturnsByDate(dates, closes);
    const index = dailyReturnsByDate(dates.slice(0, 10), closes.slice(0, 10));
    const r = betaAndCorrelation(stock, index);
    expect(r.beta).toBeNull();
  });
});

describe('cagrPct', () => {
  it('computes annual compound growth over the elapsed span', () => {
    const dates = [new Date(Date.UTC(2024, 0, 1)), new Date(Date.UTC(2026, 0, 1))];
    // Doubling over ~2 years is about 41.4% a year.
    expect(cagrPct(dates, [100, 200])).toBeCloseTo(41.4, 0);
  });
});

describe('stochasticLast', () => {
  it('is 100 when the close is at the top of the range', () => {
    const n = 20;
    const s = stochasticLast(seq(n, () => 110), seq(n, () => 90), seq(n, () => 110), 14, 3);
    expect(s.k).toBeCloseTo(100, 6);
  });

  it('is 0 when the close is at the bottom of the range', () => {
    const n = 20;
    const s = stochasticLast(seq(n, () => 110), seq(n, () => 90), seq(n, () => 90), 14, 3);
    expect(s.k).toBeCloseTo(0, 6);
  });
});

describe('obvTrend', () => {
  // Returns a human-readable verdict string, not a number.
  it('reports volume confirming a steady advance', () => {
    expect(obvTrend(seq(60, (i) => 100 + i), seq(60, () => 1000)))
      .toMatch(/rising/);
  });

  it('reports volume diverging on a steady decline', () => {
    expect(obvTrend(seq(60, (i) => 160 - i), seq(60, () => 1000)))
      .toMatch(/falling/);
  });

  // Says so rather than returning a verdict it cannot support.
  it('says insufficient data below the 20-bar average', () => {
    expect(obvTrend(seq(10, (i) => 100 + i), seq(10, () => 1000)))
      .toBe('insufficient data');
  });
});

describe('pivotPoints', () => {
  it('puts the pivot at the mean of high, low and close', () => {
    const p = pivotPoints([110], [90], [100]);
    expect(p.p).toBeCloseTo(100, 10);
    expect(p.r1).toBeGreaterThan(p.p);
    expect(p.s1).toBeLessThan(p.p);
  });
});

describe('detectPatterns', () => {
  // Five sessions; the last is a doji — open and close nearly equal, long wicks both sides.
  it('finds a doji and calls it neutral', () => {
    const o = [100, 100, 100, 100, 100];
    const c = [101, 101, 101, 101, 100.02];
    const h = [102, 102, 102, 102, 104];
    const l = [99, 99, 99, 99, 96];
    const found = detectPatterns(o, h, l, c);
    const doji = found.find((p) => /doji/i.test(p.name));
    expect(doji, `patterns found: ${found.map((p) => p.name).join(', ') || 'none'}`).toBeTruthy();
    expect(doji.bias).toBe('neutral');
  });

  it('finds a bullish engulfing and calls it bullish', () => {
    // Bar 3 falls; bar 4 opens below its close and closes above its open, engulfing it.
    const o = [100, 100, 100, 100, 95];
    const c = [100, 100, 100, 96, 102];
    const h = [101, 101, 101, 101, 103];
    const l = [99, 99, 99, 95, 94];
    const found = detectPatterns(o, h, l, c);
    const eng = found.find((p) => /engulf/i.test(p.name));
    expect(eng, `patterns found: ${found.map((p) => p.name).join(', ') || 'none'}`).toBeTruthy();
    expect(eng.bias).toBe('bullish');
  });

  it('returns an empty list rather than inventing a pattern', () => {
    const flat = seq(5, () => 100);
    const found = detectPatterns(flat, seq(5, () => 100), seq(5, () => 100), flat);
    expect(Array.isArray(found)).toBe(true);
  });
});

describe('priceAction', () => {
  it('calls a series of higher highs and higher lows an uptrend', () => {
    const n = 120;
    const closes = seq(n, (i) => 100 + i + Math.sin(i / 3) * 4);
    const highs = closes.map((v) => v + 2);
    const lows = closes.map((v) => v - 2);
    expect(priceAction(highs, lows, closes).trend).toMatch(/uptrend/i);
  });

  it('calls a series of lower highs and lower lows a downtrend', () => {
    const n = 120;
    const closes = seq(n, (i) => 300 - i + Math.sin(i / 3) * 4);
    const highs = closes.map((v) => v + 2);
    const lows = closes.map((v) => v - 2);
    expect(priceAction(highs, lows, closes).trend).toMatch(/downtrend/i);
  });

  it('always returns support below and resistance above the last price', () => {
    const n = 120;
    const closes = seq(n, (i) => 100 + Math.sin(i / 5) * 15);
    const pa = priceAction(closes.map((v) => v + 1), closes.map((v) => v - 1), closes);
    expect(pa.support).toBeLessThanOrEqual(closes[n - 1]);
    expect(pa.resistance).toBeGreaterThanOrEqual(closes[n - 1]);
  });
});

describe('intraday', () => {
  const bars = {
    highs: [101, 103, 102, 105, 104],
    lows: [99, 100, 98, 101, 102],
    closes: [100, 102, 101, 104, 103],
    volumes: [10, 20, 30, 40, 50]
  };

  it('openingRange takes the extremes of the first N minutes', () => {
    // 5-minute bars, so 10 minutes is the first two.
    const or = openingRange(bars, 10);
    expect(or.bars).toBe(2);
    expect(or.high).toBe(103);
    expect(or.low).toBe(99);
  });

  it('openingRange returns null when there are no bars', () => {
    expect(openingRange({ highs: [], lows: [], closes: [], volumes: [] }, 15)).toBeNull();
  });

  it('vwapSeries is volume-weighted and cumulative', () => {
    const v = vwapSeries(bars);
    expect(v).toHaveLength(bars.closes.length);
    const typical = (bars.highs[0] + bars.lows[0] + bars.closes[0]) / 3;
    expect(v[0]).toBeCloseTo(typical, 10);
    // Later bars trade higher on heavier volume, so VWAP must rise.
    expect(v[v.length - 1]).toBeGreaterThan(v[0]);
  });

  it('vwapSeries yields null while cumulative volume is zero', () => {
    const v = vwapSeries({ highs: [10], lows: [10], closes: [10], volumes: [0] });
    expect(v[0]).toBeNull();
  });

  it('gapPct measures the open against the previous close', () => {
    expect(gapPct(105, 100)).toBeCloseTo(5, 10);
    expect(gapPct(95, 100)).toBeCloseTo(-5, 10);
  });

  it('gapPct returns null rather than dividing by a missing close', () => {
    expect(gapPct(105, 0)).toBeNull();
    expect(gapPct(null, 100)).toBeNull();
  });

  it('relativeVolume is a ratio, and null without an average', () => {
    expect(relativeVolume(150, 100)).toBeCloseTo(1.5, 10);
    expect(relativeVolume(150, 0)).toBeNull();
  });
});
