// The screener table: thirteen columns of live, measurable metrics across a 55-stock
// universe, with an independent row-count selector.
//
// There is deliberately no target price and no "probability of success" column. Nobody can
// honestly compute the odds a stock reaches a price by a date, a target price is a forecast
// dressed as a fact, and in India publishing buy/sell/target calls is restricted to
// SEBI-registered Research Analysts (docs/14 ADR-003).
//
// scrCache holds already-fetched rows per universe, so widening from 10 to 50 fetches only
// the new names rather than re-pulling everything.
//
// fetchScreenerRow2 loads range=1y, which is the range at which Yahoo omits
// meta.previousClose — hence resolvePrevClose rather than a naive fallback. That is the
// exact path the 1D% == 1Y% bug shipped on.

import { runPool } from '../../data/proxy.js';
import { fetchHistory, fetchFundamentals, val, resolvePrevClose } from '../../data/yahoo.js';
import { average } from '../../indicators/util.js';
import { smaSeries } from '../../indicators/trend.js';
import { rsiLast } from '../../indicators/momentum.js';
import { fmtNum, fmtCr } from '../format.js';
import { COUNTS } from '../../data/universes.js';
import { openStock } from '../navigate.js';
import { suppressed } from '../../suppressed.js';

export async function fetchScreenerRow2(ticker){
  const symbol = ticker + '.NS';
  const hist = await fetchHistory(symbol, '1y', '1d');
  const c = hist.closes, meta = hist.meta;
  if (c.length < 30) throw new Error('short history');
  const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : c[c.length-1];
  const prev = resolvePrevClose(meta, c, price);
  const change1d = prev ? ((price - prev)/prev)*100 : null;
  const change1y = c.length > 1 ? ((price/c[0]) - 1)*100 : null;
  const rsi = rsiLast(c,14);
  const wkHigh = meta.fiftyTwoWeekHigh != null ? meta.fiftyTwoWeekHigh : Math.max.apply(null, hist.highs);
  const offHigh = wkHigh ? ((price - wkHigh)/wkHigh)*100 : null;
  const s200 = smaSeries(c,200);
  const a200 = s200[s200.length-1];
  const vs200 = a200 != null ? ((price - a200)/a200)*100 : null;
  const v = hist.volumes;
  const av20 = average(v.slice(-20)), av60 = average(v.slice(-60));
  const volRatio = av60 ? av20/av60 : null;
  let pe=null, mcap=null, roe=null, de=null, divY=null;
  try {
    const f = await fetchFundamentals(symbol);
    const sd = f.summaryDetail||{}, fd = f.financialData||{};
    pe = val(sd.trailingPE);
    mcap = val(sd.marketCap);
    roe = val(fd.returnOnEquity);
    de = val(fd.debtToEquity);
    divY = val(sd.dividendYield);
  } catch (err) { suppressed('screener row: fundamentals', err); }
  return { symbol, ticker, price, change1d, change1y, rsi, pe, offHigh,
    mcap, roe: roe!=null?roe*100:null, de, divY: divY!=null?divY*100:null, vs200, volRatio };
}

export function screenerRow2Html(r){
  function cls(x){ return x==null ? '' : x>=0 ? 'up' : 'down'; }
  function pct(x,d){ return x==null ? '\u2014' : (x>=0?'\u25b2 ':'\u25bc ') + fmtNum(Math.abs(x), d==null?2:d) + '%'; }
  return '<tr data-sym="' + r.symbol + '">' +
    '<td class="sym">' + r.ticker + '</td>' +
    '<td class="num">\u20b9' + fmtNum(r.price,2) + '</td>' +
    '<td class="num ' + cls(r.change1d) + '">' + pct(r.change1d,2) + '</td>' +
    '<td class="num ' + cls(r.change1y) + '">' + pct(r.change1y,1) + '</td>' +
    '<td class="num">' + (r.mcap==null?'\u2014':fmtCr(r.mcap)) + '</td>' +
    '<td class="num">' + (r.rsi==null?'\u2014':fmtNum(r.rsi,1)) + '</td>' +
    '<td class="num">' + (r.pe==null?'\u2014':fmtNum(r.pe,1)) + '</td>' +
    '<td class="num ' + (r.roe!=null && r.roe>=15 ? 'up' : r.roe!=null && r.roe<8 ? 'down' : '') + '">' + (r.roe==null?'\u2014':fmtNum(r.roe,1)+'%') + '</td>' +
    '<td class="num ' + (r.de!=null && r.de>100 ? 'down' : r.de!=null && r.de<40 ? 'up' : '') + '">' + (r.de==null?'\u2014':fmtNum(r.de,0)) + '</td>' +
    '<td class="num">' + (r.divY==null?'\u2014':fmtNum(r.divY,2)+'%') + '</td>' +
    '<td class="num ' + cls(r.vs200) + '">' + (r.vs200==null?'\u2014':fmtNum(r.vs200,1)+'%') + '</td>' +
    '<td class="num ' + (r.volRatio!=null && r.volRatio>1.25 ? 'up' : r.volRatio!=null && r.volRatio<0.75 ? 'down' : '') + '">' + (r.volRatio==null?'\u2014':fmtNum(r.volRatio,2)+'\u00d7') + '</td>' +
    '<td class="num ' + cls(r.offHigh) + '">' + (r.offHigh==null?'\u2014':fmtNum(r.offHigh,1)+'%') + '</td>' +
  '</tr>';
}

export function countSelectHtml(id, def){
  return '<label style="font-size:12px;color:var(--cream-dim);display:inline-flex;align-items:center;gap:6px;margin-right:10px">' +
    'Show <select id="' + id + '" style="background:var(--panel);border:1px solid var(--hair);color:var(--cream);' +
    'padding:5px 8px;border-radius:7px;font-family:var(--sans);font-size:12.5px;cursor:pointer">' +
    COUNTS.map(function(n){ return '<option value="' + n + '"' + (n===def?' selected':'') + '>' + n + '</option>'; }).join('') +
    '</select></label>';
}

export const scrCache = { large:{}, mid:{} };

export async function loadScreener3(univ, key, bodyId, btnId, selId){
  const tbody = document.getElementById(bodyId);
  const btn = document.getElementById(btnId);
  const n = parseInt(document.getElementById(selId).value, 10) || 10;
  const list = univ.slice(0, n);
  btn.disabled = true; btn.textContent = 'Loading\u2026';
  const cache = scrCache[key];
  tbody.innerHTML = list.map(function(t){
    return cache[t] ? screenerRow2Html(cache[t])
      : '<tr id="s3-' + key + '-' + t + '"><td class="sym">' + t + '</td><td colspan="12" class="loading-dots">fetching\u2026</td></tr>';
  }).join('');
  const missing = list.filter(function(t){ return !cache[t]; });
  await runPool(missing, async function(t){
    try {
      const r = await fetchScreenerRow2(t);
      cache[t] = r;
      const row = document.getElementById('s3-' + key + '-' + t);
      if (row) row.outerHTML = screenerRow2Html(r);
    } catch {
      const row = document.getElementById('s3-' + key + '-' + t);
      if (row) row.outerHTML = '<tr><td class="sym">' + t + '</td><td colspan="12" style="color:var(--cream-dim)">Couldn\u2019t load</td></tr>';
    }
  }, 5);
  tbody.querySelectorAll('tr[data-sym]').forEach(function(tr){
    tr.addEventListener('click', function(){ openStock(tr.getAttribute('data-sym')); });
  });
  btn.disabled = false; btn.textContent = 'Refresh';
}
