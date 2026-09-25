// Captures live upstream responses into tests/fixtures/ so the test suite runs offline.
//
// Story E2-1 in engineering/18-DELIVERY-PLAN.md, and PR-1 in engineering/22-REFACTOR-PLAN.md.
// These fixtures are the safety net for EPIC-1: every pure function is run against them
// before and after extraction, and the outputs must match. Without them the refactor cannot
// prove behavioural parity, which is why docs/18 requires them before any code moves.
//
//   node scripts/capture-fixtures.mjs           capture everything
//   node scripts/capture-fixtures.mjs RELIANCE  capture one symbol
//
// Read-only: it fetches through the project's own Cloudflare Worker and writes local files.
// It does not touch the deployed site.

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const WORKER_URL = 'https://dalal-proxy.sanjeev-yadav.workers.dev';
const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures');

// Five stocks per docs/18 E2-1, chosen to cover the failure modes that have actually bitten:
//   RELIANCE   large cap, has a liquid NSE option chain
//   TCS        large cap, high ROE, net cash — the DCF net-debt path
//   HDFCBANK   a bank: no capex/OCF in the usual sense, so DCF must decline to compute
//   PERSISTENT mid cap, thinner data
//   TMPV       renamed ticker (was TATAMOTORS) — proves symbol rot is covered
// ^NSEI is the benchmark every beta, factor and relative-return calculation needs.
const SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'PERSISTENT', 'TMPV'];
const BENCHMARK = '^NSEI';

const QUOTE_MODULES = [
  'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile',
  'recommendationTrend', 'earningsTrend', 'majorHoldersBreakdown',
  'incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory',
  'earnings', 'price'
].join(',');

const ANNUAL_TYPES = [
  'annualOperatingCashFlow', 'annualCapitalExpenditure', 'annualNetIncome',
  'annualTotalRevenue', 'annualTotalAssets'
].join(',');

const chartUrl = (sym, range, interval) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
  `?interval=${interval}&range=${range}`;

const quoteSummaryUrl = (sym) =>
  `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
  `?modules=${QUOTE_MODULES}`;

const annualsUrl = (sym) => {
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - 7 * 365 * 24 * 3600;
  return `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/` +
    `${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}` +
    `&type=${ANNUAL_TYPES}&period1=${p1}&period2=${p2}`;
};

const nseContractInfoUrl = (t) =>
  `https://www.nseindia.com/api/option-chain-contract-info?symbol=${encodeURIComponent(t)}`;
const nseChainUrl = (t, expiry) =>
  `https://www.nseindia.com/api/option-chain-v3?type=Equity&symbol=${encodeURIComponent(t)}` +
  `&expiry=${encodeURIComponent(expiry)}`;
const nseShareholdingUrl = (t) =>
  `https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(t)}`;
const nsePledgeUrl = (t) =>
  `https://www.nseindia.com/api/corporate-pledgedata?index=equities&symbol=${encodeURIComponent(t)}`;
const newsUrl = (name) =>
  `https://www.bing.com/news/search?q=${encodeURIComponent(name + ' stock')}&format=RSS`;

const through = (u) => `${WORKER_URL}/?url=${encodeURIComponent(u)}`;

async function fetchUpstream(url, { text = false } = {}) {
  const res = await fetch(through(url), {
    cache: 'no-store',
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return text ? res.text() : res.json();
}

async function save(name, payload) {
  const path = resolve(FIXTURE_DIR, `${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const size = JSON.stringify(payload).length;
  console.log(`  saved ${name}.json (${(size / 1024).toFixed(1)} kB)`);
  return { name, size };
}

// Each fixture records the upstream URL it came from and when, so a stale fixture is
// obvious rather than silently wrong. `capturedAt` is what tells you a DCF that changed
// is a real change and not just a newer filing.
const envelope = (url, body) => ({
  capturedAt: new Date().toISOString(),
  upstream: url,
  body
});

async function captureSymbol(sym) {
  const yahooSym = sym.startsWith('^') ? sym : `${sym}.NS`;
  const key = sym.replace('^', '').toLowerCase();
  console.log(`\n${yahooSym}`);

  const jobs = [
    // 2y is what the detail panel loads: enough bars for a 200-DMA plus a year of context.
    ['chart-2y', chartUrl(yahooSym, '2y', '1d')],
    // 1y is the range that triggered the 1D% == 1Y% bug: Yahoo omits meta.previousClose
    // here, and falling through to chartPreviousClose gives a year-old reference price.
    // docs/10 §10.3 asserts against exactly this fixture.
    ['chart-1y', chartUrl(yahooSym, '1y', '1d')],
    ['chart-5d', chartUrl(yahooSym, '5d', '1d')]
  ];

  if (!sym.startsWith('^')) {
    jobs.push(['quote-summary', quoteSummaryUrl(yahooSym)]);
    jobs.push(['annuals', annualsUrl(yahooSym)]);
  }

  const results = [];
  for (const [suffix, url] of jobs) {
    try {
      const body = await fetchUpstream(url);
      results.push(await save(`${key}/${suffix}`, envelope(url, body)));
    } catch (err) {
      console.log(`  FAILED ${suffix}: ${err.message}`);
      results.push({ name: `${key}/${suffix}`, error: err.message });
    }
  }
  return results;
}

async function captureOptions(ticker) {
  console.log(`\nNSE option chain: ${ticker}`);
  const key = ticker.toLowerCase();
  const out = [];
  try {
    const ciUrl = nseContractInfoUrl(ticker);
    const ci = await fetchUpstream(ciUrl);
    out.push(await save(`${key}/option-contract-info`, envelope(ciUrl, ci)));

    const expiry = ci?.expiryDates?.[0];
    if (!expiry) throw new Error('no expiry dates returned');
    console.log(`  nearest expiry: ${expiry}`);

    const ocUrl = nseChainUrl(ticker, expiry);
    const oc = await fetchUpstream(ocUrl);
    const strikes = oc?.records?.data?.length ?? 0;
    if (!strikes) throw new Error('empty chain');
    out.push(await save(`${key}/option-chain`, envelope(ocUrl, oc)));
    console.log(`  ${strikes} strikes, underlying ${oc.records.underlyingValue}`);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    out.push({ name: `${key}/option-chain`, error: err.message });
  }
  return out;
}

// Shareholding pattern and promoter pledge. Both are NSE and share its intermittent 520s from
// Cloudflare's edge, so each is captured independently: one failing must not cost the other.
async function captureShareholding(ticker) {
  console.log(`
NSE shareholding: ${ticker}`);
  const key = ticker.toLowerCase();
  const out = [];
  for (const [name, url, check] of [
    ['shareholding', nseShareholdingUrl(ticker), (b) => Array.isArray(b) && b.length],
    ['pledge', nsePledgeUrl(ticker), (b) => b && Array.isArray(b.data)]
  ]) {
    try {
      const body = await fetchUpstream(url);
      if (!check(body)) throw new Error('unexpected shape');
      out.push(await save(`${key}/${name}`, envelope(url, body)));
    } catch (err) {
      console.log(`  ${name} FAILED: ${err.message}`);
      out.push({ name: `${key}/${name}`, error: err.message });
    }
  }
  return out;
}

async function captureNews(name) {
  console.log(`\nNews RSS: ${name}`);
  try {
    const url = newsUrl(name);
    const xml = await fetchUpstream(url, { text: true });
    const items = (xml.match(/<item>/g) || []).length;
    if (!items) throw new Error('no <item> elements parsed');
    console.log(`  ${items} items`);
    return [await save('news/reliance-rss', envelope(url, xml))];
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    return [{ name: 'news/reliance-rss', error: err.message }];
  }
}

async function main() {
  const only = process.argv[2];
  const symbols = only ? [only.toUpperCase()] : SYMBOLS;

  console.log(`Capturing fixtures through ${WORKER_URL}`);
  console.log(`Output: ${FIXTURE_DIR}`);

  const all = [];
  for (const sym of symbols) all.push(...await captureSymbol(sym));
  if (!only) {
    all.push(...await captureSymbol(BENCHMARK));
    all.push(...await captureOptions('RELIANCE'));
    all.push(...await captureShareholding('RELIANCE'));
    all.push(...await captureNews('Reliance Industries'));
  }

  const failed = all.filter((r) => r.error);
  const ok = all.filter((r) => !r.error);
  const bytes = ok.reduce((a, r) => a + r.size, 0);

  console.log(`\n${'-'.repeat(52)}`);
  console.log(`captured ${ok.length} fixtures, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  if (failed.length) {
    console.log(`\n${failed.length} FAILED:`);
    for (const f of failed) console.log(`  ${f.name}: ${f.error}`);
    // A partial capture is worse than none: a missing fixture makes a test silently skip
    // rather than fail, which is exactly how the 1D/1Y bug survived to production.
    process.exitCode = 1;
  }
}

main();
