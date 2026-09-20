// docs/10-TEST-PLAN.md §10.3 — the bug that actually shipped.
//
// The screener's 1-day change equalled its 1-year change. Cause: the screener loads
// range=1y, and at that range Yahoo omits meta.previousClose. The code fell through to
// meta.chartPreviousClose, which is the close *before the range started* — a year-old
// price. So "yesterday's move" was silently reporting the whole year's move.
//
// Nothing caught it. It was spotted by a human looking at a screenshot. These tests are
// the reason it cannot come back.
//
// As of PR-4 this imports the real function from src/data/yahoo.js rather than restating
// the rule. That is the point of the extraction: while the guard was inline inside
// fetchScreenerRow2, docs/10 §10.3 could only describe it, and a test that restates the
// logic it is checking proves nothing.

import { describe, it, expect } from 'vitest';
import { history, STOCKS } from '../helpers/fixtures.js';
import { resolvePrevClose } from '../../src/data/yahoo.js';
import { rsiLast } from '../../src/indicators/momentum.js';

// Mirrors the reference-price half of fetchScreenerRow2 in src/app.js.
function screenerRow(hist) {
  const c = hist.closes;
  const meta = hist.meta;
  const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : c[c.length - 1];
  const prev = resolvePrevClose(meta, c, price);
  return {
    price,
    change1d: prev ? ((price - prev) / prev) * 100 : null,
    change1y: c.length > 1 ? (price / c[0] - 1) * 100 : null,
    rsi: rsiLast(c, 14)
  };
}

describe('previousClose resolution', () => {
  it('rejects an implausible previousClose and falls back to the series', () => {
    // 500 is >25% away from a spot of 1257 — a year-old reference price, not yesterday's.
    expect(resolvePrevClose({ previousClose: 500 }, [1250, 1257])).toBe(1250);
  });

  it('trusts a previousClose that is close to spot', () => {
    expect(resolvePrevClose({ previousClose: 1250 }, [1240, 1257])).toBe(1250);
  });

  it('falls back when previousClose is absent, which is what range=1y does', () => {
    expect(resolvePrevClose({}, [1250, 1257])).toBe(1250);
  });

  it('accepts a real gap-down just inside the band', () => {
    // -24% overnight is extreme but real; -26% is a data error. The band draws that line.
    expect(resolvePrevClose({ previousClose: 124 }, [130, 100])).toBe(124);
    expect(resolvePrevClose({ previousClose: 126 }, [130, 100])).toBe(130);
  });
});

describe.each(STOCKS)('screener row from the 1y range — %s', (sym) => {
  const hist = history(sym, '1y');

  it('Yahoo really does omit previousClose at range=1y', () => {
    // If this ever fails, Yahoo changed its response and the guard below is load-bearing
    // for a different reason than the one documented. Worth knowing either way.
    expect(hist.meta.previousClose).toBeUndefined();
  });

  it('1-day change is not the 1-year change', () => {
    const row = screenerRow(hist);
    expect(row.change1d).not.toBeCloseTo(row.change1y, 1);
  });

  it('1-day change is within a plausible single-session range', () => {
    const row = screenerRow(hist);
    expect(Math.abs(row.change1d)).toBeLessThan(25);
  });

  it('would have failed under the old chartPreviousClose fallback', () => {
    // Reproduces the bug to prove the test would have caught it.
    const c = hist.closes;
    const price = hist.meta.regularMarketPrice ?? c[c.length - 1];
    const buggyPrev = hist.meta.chartPreviousClose;
    const buggy1d = ((price - buggyPrev) / buggyPrev) * 100;
    const real1y = (price / c[0] - 1) * 100;
    expect(buggy1d).toBeCloseTo(real1y, 0);
  });
});
