// Yahoo Finance endpoints.
//
// Three of these work only in a specific way, all established by testing (docs/06):
//   - quoteSummary returns 401 Invalid Cookie without the crumb the Worker attaches.
//   - cashflowStatementHistory now returns only netIncome, so multi-year cash flows come
//     from the fundamentals-timeseries endpoint instead.
//   - at range=1y, meta.previousClose is absent. See resolvePrevClose below.

import { fetchJsonThroughProxy } from './proxy.js';

export const historyCache = Object.create(null);

export function val(x){ return (x && typeof x === 'object' && 'raw' in x) ? x.raw : x; }

export async function fetchQuote(symbol){
  const h = await fetchHistory(symbol, '5d', '1d');
  const last = h.closes.length - 1;
  const price = h.meta.regularMarketPrice != null ? h.meta.regularMarketPrice : h.closes[last];
  const prevClose = h.meta.previousClose != null ? h.meta.previousClose : (h.meta.chartPreviousClose != null ? h.meta.chartPreviousClose : h.closes[last-1]);
  const change = price - prevClose;
  return {
    symbol, name: h.meta.shortName || h.meta.longName || symbol,
    price, change, changePercent: (change/prevClose)*100,
    currency: h.meta.currency || 'INR', time: Date.now(), stale:false
  };
}

export async function fetchHistory(symbol, range, interval){
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
    '?interval=' + interval + '&range=' + range;
  const data = await fetchJsonThroughProxy(url);
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.meta) throw new Error('No data for ' + symbol);
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const dates=[], closes=[], opens=[], highs=[], lows=[], volumes=[];
  for (let i=0;i<ts.length;i++){
    if (q.close == null || q.close[i] == null) continue;
    dates.push(new Date(ts[i]*1000));
    closes.push(q.close[i]);
    opens.push(q.open && q.open[i] != null ? q.open[i] : q.close[i]);
    highs.push(q.high && q.high[i] != null ? q.high[i] : q.close[i]);
    lows.push(q.low && q.low[i] != null ? q.low[i] : q.close[i]);
    volumes.push(q.volume && q.volume[i] != null ? q.volume[i] : 0);
  }
  const packed = { meta: result.meta, dates, closes, opens, highs, lows, volumes };
  historyCache[symbol + '|' + range + '|' + interval] = packed;
  return packed;
}

export async function fetchFundamentals(symbol){
  const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,recommendationTrend,earningsTrend,majorHoldersBreakdown,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory,earnings,price';
  const url = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(symbol) + '?modules=' + modules;
  const data = await fetchJsonThroughProxy(url);
  const result = data && data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result[0];
  if (!result) throw new Error('No fundamentals for ' + symbol);
  return result;
}

export async function fetchAnnuals(symbol){
  const p2 = Math.floor(Date.now()/1000), p1 = p2 - 7*365*24*3600;
  const types = 'annualOperatingCashFlow,annualCapitalExpenditure,annualNetIncome,annualTotalRevenue,annualTotalAssets';
  const url = 'https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/' +
    encodeURIComponent(symbol) + '?symbol=' + encodeURIComponent(symbol) +
    '&type=' + types + '&period1=' + p1 + '&period2=' + p2;
  const data = await fetchJsonThroughProxy(url);
  const arr = (data && data.timeseries && data.timeseries.result) || [];
  function series(name){
    const hit = arr.find(x => x.meta && x.meta.type && x.meta.type[0] === name);
    if (!hit || !hit[name]) return [];
    return hit[name].filter(Boolean).map(p => ({
      date: p.asOfDate,
      v: p.reportedValue ? p.reportedValue.raw : null
    })).filter(p => p.v != null);
  }
  return {
    ocf: series('annualOperatingCashFlow'),
    capex: series('annualCapitalExpenditure'),
    ni: series('annualNetIncome'),
    rev: series('annualTotalRevenue'),
    assets: series('annualTotalAssets')
  };
}

export async function fetchCatalysts(symbol){
  const url = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(symbol) +
    '?modules=calendarEvents,earningsHistory,financialData,defaultKeyStatistics';
  const data = await fetchJsonThroughProxy(url);
  const r = data && data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result[0];
  if (!r) return null;
  const ce = r.calendarEvents || {}, eh = r.earningsHistory || {}, fd = r.financialData || {};
  let nextEarnings = null;
  if (ce.earnings && ce.earnings.earningsDate && ce.earnings.earningsDate.length)
    nextEarnings = val(ce.earnings.earningsDate[0]);
  const surprises = (eh.history || []).slice(-4).map(h => ({
    date: val(h.quarter),
    actual: val(h.epsActual),
    est: val(h.epsEstimate),
    surprise: val(h.surprisePercent)
  })).filter(x => x.actual != null);
  return {
    nextEarnings,
    exDiv: val(ce.exDividendDate),
    divDate: val(ce.dividendDate),
    surprises,
    targetMean: val(fd.targetMeanPrice),
    targetHigh: val(fd.targetHighPrice),
    targetLow: val(fd.targetLowPrice),
    analysts: val(fd.numberOfAnalystOpinions),
    recKey: fd.recommendationKey || null
  };
}

/**
 * Pick the reference price for a one-day change.
 *
 * This exists because of a bug that shipped: the screener's 1-day change was showing the
 * 1-year change. The screener loads range=1y, and at that range Yahoo omits
 * meta.previousClose; the code fell through to meta.chartPreviousClose, which is the close
 * BEFORE the range started — a price a year old. Nothing caught it. A human noticed it on a
 * screenshot.
 *
 * meta.previousClose is therefore trusted only when it is within 25% of spot. That band is
 * what separates "yesterday's close, after a rough gap" from "a price from a different
 * year". Outside it, the second-to-last close in the series is used instead.
 *
 * tests/regression/prev-close.test.js covers both directions, including a case that
 * reproduces the original fallback to prove the test would have caught it.
 *
 * `spot` is passed explicitly by callers that have a live price: the screener compares
 * against meta.regularMarketPrice, not against the last close, and those differ intraday.
 * Defaulting it to the last close keeps the function usable on history alone.
 */
export function resolvePrevClose(meta, closes, spot){
  const ref = spot != null ? spot : closes[closes.length - 1];
  if (meta && meta.previousClose != null && Math.abs(meta.previousClose - ref) / ref < 0.25) {
    return meta.previousClose;
  }
  return closes[closes.length - 2];
}
