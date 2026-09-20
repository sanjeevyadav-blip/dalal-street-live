// Serves the committed API fixtures to the browser, so the E2E suite is deterministic.
//
// The alternative — pointing Playwright at the live Worker — was rejected. Those specs would
// fail when NSE has a bad afternoon, pass or fail differently depending on whether the market
// is open, and assert nothing stable about the app itself. Liveness of the feeds is already
// covered, separately and honestly, by tests/integration/live-apis.test.js (§10.4). What is
// under test HERE is the page: does it wire up, render its blocks, and stay usable.
//
// So every request the app makes through the Cloudflare Worker is intercepted and answered
// from tests/fixtures/ — the same 31 files the 217 offline unit tests already run against.
// One fixture set, two consumers, no drift.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES = resolve(process.cwd(), 'tests/fixtures');

// The app tries the Worker first and two fallback proxies after it; intercept all three so a
// spec can never leak a real request, whichever one the proxy rotation happens to be on.
export const PROXY_GLOB = '**/{dalal-proxy.sanjeev-yadav.workers.dev,api.allorigins.win,api.codetabs.com}/**';

// Yahoo symbol -> fixture directory. Anything outside this set is synthesised (see below):
// the screener and ranking universes are ~100 tickers and capturing all of them would make
// the fixture set unmaintainable for no extra coverage.
const FIXTURE_DIRS = {
  'RELIANCE.NS': 'reliance',
  'TCS.NS': 'tcs',
  'HDFCBANK.NS': 'hdfcbank',
  'PERSISTENT.NS': 'persistent',
  'TMPV.NS': 'tmpv',
  '^NSEI': 'nsei'
};

// Ranges the app actually asks for, mapped onto the three that were captured. 1d/5m
// (intraday) and 1mo (IPO listing history) have no fixture of their own; the 5d and 1y files
// are the right shape and that is all the page needs to render its block.
const RANGE_FILE = { '5d': 'chart-5d', '1y': 'chart-1y', '2y': 'chart-2y', '1d': 'chart-5d', '1mo': 'chart-1y' };

function readFixture(rel) {
  const path = resolve(FIXTURES, rel + '.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')).body;
}

// A chart response for a ticker with no fixture of its own: the RELIANCE series with the
// symbol relabelled. The numbers are not that company's numbers and no spec asserts they
// are — what the screener and ranking specs check is row count, slicing and re-fetch
// behaviour, all of which need a well-formed response per ticker and nothing more.
function syntheticChart(symbol, range) {
  const base = readFixture('reliance/' + (RANGE_FILE[range] || 'chart-1y'));
  if (!base) return null;
  const clone = JSON.parse(JSON.stringify(base));
  const result = clone.chart.result[0];
  result.meta.symbol = symbol;
  result.meta.shortName = symbol.replace(/\.(NS|BO)$/, '');
  result.meta.longName = result.meta.shortName;
  return clone;
}

function chartResponse(target) {
  const m = /\/v8\/finance\/chart\/([^?]+)/.exec(target.pathname + target.search);
  if (!m) return null;
  const symbol = decodeURIComponent(m[1]);
  const range = target.searchParams.get('range') || '1y';
  const dir = FIXTURE_DIRS[symbol];
  if (dir) {
    const hit = readFixture(dir + '/' + (RANGE_FILE[range] || 'chart-1y'));
    if (hit) return hit;
  }
  return syntheticChart(symbol, range);
}

function quoteSummaryResponse(target) {
  const m = /\/v10\/finance\/quoteSummary\/([^?]+)/.exec(target.pathname + target.search);
  if (!m) return null;
  const dir = FIXTURE_DIRS[decodeURIComponent(m[1])];
  // No fixture: answer the way Yahoo answers for a symbol it has no modules for. The page
  // must degrade to price-and-technicals, which is itself worth exercising.
  if (!dir) return { quoteSummary: { result: [], error: null } };
  return readFixture(dir + '/quote-summary');
}

function annualsResponse(target) {
  const m = /\/timeseries\/([^?]+)/.exec(target.pathname + target.search);
  if (!m) return null;
  const dir = FIXTURE_DIRS[decodeURIComponent(m[1])];
  if (!dir) return { timeseries: { result: [], error: null } };
  return readFixture(dir + '/annuals');
}

/**
 * Install fixture routing on a page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {boolean} [opts.offline]  Fail every upstream call, to exercise the dead-network path.
 * @param {string[]} [opts.fnoSymbols]  Tickers that have a listed option chain. Everything
 *   else gets an empty expiry list, which is how NSE answers for a non-F&O name — that is
 *   what drives the "no contracts" state rather than a wall of zeros.
 * @returns {{count: () => number}} request counter, for asserting a re-render did not re-fetch.
 */
export async function installFixtureRoutes(page, opts = {}) {
  const { offline = false, fnoSymbols = ['RELIANCE'] } = opts;
  let requests = 0;

  await page.route(PROXY_GLOB, async (route) => {
    requests++;

    if (offline) {
      await route.abort('failed');
      return;
    }

    const proxied = new URL(route.request().url());
    const raw = proxied.searchParams.get('url') || proxied.searchParams.get('quest');
    if (!raw) {
      await route.fulfill({ status: 400, body: 'Missing url' });
      return;
    }
    const target = new URL(raw);
    const path = target.pathname;

    const json = (data) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data)
    });

    if (path.includes('/v8/finance/chart/')) {
      const data = chartResponse(target);
      return data ? json(data) : route.fulfill({ status: 404, body: 'no fixture' });
    }
    if (path.includes('/v10/finance/quoteSummary/')) {
      const data = quoteSummaryResponse(target);
      return data ? json(data) : route.fulfill({ status: 404, body: 'no fixture' });
    }
    if (path.includes('/finance/timeseries/')) {
      const data = annualsResponse(target);
      return data ? json(data) : route.fulfill({ status: 404, body: 'no fixture' });
    }
    if (path.includes('/api/option-chain-contract-info')) {
      const sym = target.searchParams.get('symbol');
      if (!fnoSymbols.includes(sym)) return json({ expiryDates: [], strikePrice: [] });
      return json(readFixture('reliance/option-contract-info'));
    }
    if (path.includes('/api/option-chain-v3')) {
      return json(readFixture('reliance/option-chain'));
    }
    if (path.includes('/api/all-upcoming-issues')) {
      return json([]);
    }
    if (target.hostname === 'www.bing.com') {
      return route.fulfill({
        status: 200,
        contentType: 'text/xml',
        body: readFixture('news/reliance-rss')
      });
    }

    // Anything unrecognised is a 404 rather than a pass-through. A spec that silently
    // reached the real internet would be exactly the flakiness this file exists to prevent.
    return route.fulfill({ status: 404, body: 'unrouted: ' + raw });
  });

  return { count: () => requests };
}

/** Google Fonts is the one external request the shell makes directly. Stub it so runs are offline-clean. */
export async function stubFonts(page) {
  await page.route('**/fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', (route) => route.abort());
}
