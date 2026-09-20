// Loads the captured API responses and reshapes them exactly as the app does, so tests
// operate on the same inputs the real code sees. Regenerate with:
//
//     node scripts/capture-fixtures.mjs
//
// Every fixture carries `capturedAt` and `upstream`, so a surprising test result can be
// traced to a stale fixture rather than a code change.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'tests/fixtures');

export function fixture(name) {
  return JSON.parse(readFileSync(resolve(DIR, `${name}.json`), 'utf8'));
}

/**
 * Mirrors fetchHistory() in src/index.html: unpacks a Yahoo chart response into parallel
 * arrays, skipping bars with a null close. Kept in step with that function by
 * tests/regression/golden-output.test.js, which fails if the packing changes.
 */
export function packHistory(chartFixture) {
  const result = chartFixture.body.chart.result[0];
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const dates = [], closes = [], opens = [], highs = [], lows = [], volumes = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close == null || q.close[i] == null) continue;
    dates.push(new Date(ts[i] * 1000));
    closes.push(q.close[i]);
    opens.push(q.open && q.open[i] != null ? q.open[i] : q.close[i]);
    highs.push(q.high && q.high[i] != null ? q.high[i] : q.close[i]);
    lows.push(q.low && q.low[i] != null ? q.low[i] : q.close[i]);
    volumes.push(q.volume && q.volume[i] != null ? q.volume[i] : 0);
  }
  return { meta: result.meta, dates, closes, opens, highs, lows, volumes };
}

/** Mirrors fetchAnnuals() in src/index.html. */
export function packAnnuals(annualsFixture) {
  const arr = annualsFixture.body?.timeseries?.result || [];
  const series = (name) => {
    const hit = arr.find((x) => x.meta && x.meta.type && x.meta.type[0] === name);
    if (!hit || !hit[name]) return [];
    return hit[name]
      .filter(Boolean)
      .map((p) => ({ date: p.asOfDate, v: p.reportedValue ? p.reportedValue.raw : null }))
      .filter((p) => p.v != null);
  };
  return {
    ocf: series('annualOperatingCashFlow'),
    capex: series('annualCapitalExpenditure'),
    ni: series('annualNetIncome'),
    rev: series('annualTotalRevenue'),
    assets: series('annualTotalAssets')
  };
}

export const history = (sym, range = '2y') => packHistory(fixture(`${sym}/chart-${range}`));
export const annuals = (sym) => packAnnuals(fixture(`${sym}/annuals`));
export const quoteSummary = (sym) => fixture(`${sym}/quote-summary`).body.quoteSummary.result[0];

export const STOCKS = ['reliance', 'tcs', 'hdfcbank', 'persistent', 'tmpv'];
