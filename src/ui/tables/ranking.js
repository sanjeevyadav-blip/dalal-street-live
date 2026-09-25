// The top-performers ranking: a 0-100 composite over a 55-stock universe.
//
// The blend is indicators 35%, relative strength 35%, candlesticks 15%, volume 15%. It
// ranks recent momentum and technical posture, which is NOT a view on the business, and it
// is not a buy list.
//
// Derivatives are deliberately excluded from the composite — not because the data is
// unavailable (the NSE option chain works and appears on individual F&O stocks) but because
// pulling 55 option chains would be far slower than this table should be, and only ~180 NSE
// names have options at all, which would make the comparison uneven.
//
// The two probability columns are model output from the stock's own return distribution,
// not forecasts, and are labelled as such in the UI (CLAUDE.md invariant 4).
//
// scoreStock20 lives here rather than in src/models/ because it fetches its own history per
// ticker — it is an orchestrator, not a pure model.

import { runPool } from '../../data/proxy.js';
import { fetchHistory } from '../../data/yahoo.js';
import { average } from '../../indicators/util.js';
import { smaSeries, macdLast } from '../../indicators/trend.js';
import { rsiLast } from '../../indicators/momentum.js';
import { detectPatterns } from '../../indicators/patterns.js';
import { gbmProbUp } from '../../models/gbm.js';
import { fmtNum } from '../format.js';
import { openStock } from '../navigate.js';
import { suppressed } from '../../suppressed.js';
import { renderDeadSymbolNote } from './screener.js';
import { isShown } from '../live.js';

export async function scoreStock20(ticker, niftyRet){
  const symbol = ticker + '.NS';
  const h = await fetchHistory(symbol, '1y', '1d');
  const c = h.closes, o = h.opens, hi = h.highs, lo = h.lows, v = h.volumes;
  if (c.length < 80) throw new Error('short history');
  const price = h.meta.regularMarketPrice != null ? h.meta.regularMarketPrice : c[c.length-1];
  const pats = detectPatterns(o, hi, lo, c);
  let cs = 50;
  pats.forEach(function(p){ if (p.bias==='bullish') cs += 12; else if (p.bias==='bearish') cs -= 12; });
  cs = Math.max(0, Math.min(100, cs));
  const rsi = rsiLast(c,14);
  const macd = macdLast(c);
  const s50 = smaSeries(c,50), s200 = smaSeries(c,200);
  const a50 = s50[s50.length-1], a200 = s200[s200.length-1];
  const above50 = a50 != null && price >= a50, above200 = a200 != null && price >= a200;
  let ind = 0;
  ind += rsi == null ? 12 : (rsi >= 45 && rsi <= 70 ? 25 : rsi > 70 ? 12 : rsi < 30 ? 8 : 16);
  ind += macd.hist >= 0 ? 25 : 5;
  ind += above50 ? 25 : 5;
  ind += above200 ? 25 : 5;
  const av20 = average(v.slice(-20)), av60 = average(v.slice(-60));
  const vr = av60 ? av20/av60 : 1;
  const upDays = c.slice(-20).filter(function(x,i,a){ return i>0 && x>a[i-1]; }).length;
  const vol = Math.max(0, Math.min(100, 50 + (vr-1)*40 + (upDays-10)*3));
  function ret(d){ const i = Math.max(0, c.length-1-d); return (c[c.length-1]/c[i]-1)*100; }
  const r3 = ret(63), r6 = ret(126);
  const rs3 = r3 - niftyRet.r3, rs6 = r6 - niftyRet.r6;
  const rs = Math.max(0, Math.min(100, 50 + rs3*1.2 + rs6*0.8));
  const composite = cs*0.15 + ind*0.35 + vol*0.15 + rs*0.35;
  const w = gbmProbUp(c, 5), mo = gbmProbUp(c, 21);
  const tilt = ((composite - 50)/50) * 6;   // at most +/-6 points
  const pWeek = w ? Math.max(5, Math.min(95, w.p + tilt)) : null;
  const pMonth = mo ? Math.max(5, Math.min(95, mo.p + tilt*1.3)) : null;
  const bits = [];
  if (w) bits.push((w.drift >= 0 ? 'Uptrend drift +' : 'Downtrend drift ') + fmtNum(w.drift,0) + '%/yr');
  bits.push(above200 ? 'above 200-DMA' : 'below 200-DMA');
  if (macd.hist >= 0) bits.push('MACD positive'); else bits.push('MACD negative');
  if (rsi != null){
    if (rsi > 70) bits.push('RSI ' + fmtNum(rsi,0) + ' overbought');
    else if (rsi < 30) bits.push('RSI ' + fmtNum(rsi,0) + ' oversold');
    else bits.push('RSI ' + fmtNum(rsi,0));
  }
  bits.push((rs3 >= 0 ? 'beating' : 'lagging') + ' Nifty by ' + fmtNum(Math.abs(rs3),1) + '% (3M)');
  if (w && w.vol > 35) bits.push('high volatility ' + fmtNum(w.vol,0) + '% widens both tails');
  if (pats.length && pats[0].bias !== 'neutral') bits.push(pats[0].name.toLowerCase());
  return { ticker, symbol, price, rsi, above50, above200, composite, ind, vol, rs, rs3,
    pWeek, pMonth, annVol: w ? w.vol : null, drift: w ? w.drift : null,
    reason: bits.slice(0,4).join(' \u00b7 '),
    topPattern: pats.length ? pats[0] : null };
}

export const rankCache = { large:null, mid:null };

export function renderRankRows(rows, n, bodyId){
  const tbody = document.getElementById(bodyId);
  const top = rows.slice(0, n);
  function pCls(p){ return p == null ? '' : p >= 55 ? 'up' : p <= 45 ? 'down' : 'info'; }
  function patCls(p){ return !p ? '' : p.bias === 'bullish' ? 'up' : p.bias === 'bearish' ? 'down' : ''; }
  tbody.innerHTML = top.map(function(r,i){
    return '<tr data-sym="' + r.symbol + '">' +
      '<td class="sym">' + (i+1) + '. ' + r.ticker + '</td>' +
      '<td class="num">\u20b9' + fmtNum(r.price,2) + '</td>' +
      '<td class="num"><b>' + fmtNum(r.composite,1) + '</b></td>' +
      '<td class="num">' + fmtNum(r.ind,0) + '</td>' +
      '<td class="num">' + fmtNum(r.vol,0) + '</td>' +
      '<td class="num ' + (r.rs3>=0?'up':'down') + '">' + fmtNum(r.rs3,1) + '%</td>' +
      '<td class="num">' + (r.rsi==null?'\u2014':fmtNum(r.rsi,0)) + '</td>' +
      '<td class="' + patCls(r.topPattern) + '">' + (r.topPattern ? r.topPattern.name : '\u2014') + '</td>' +
      '<td class="num ' + pCls(r.pWeek) + '"><b>' + (r.pWeek==null?'\u2014':fmtNum(r.pWeek,1)+'%') + '</b></td>' +
      '<td class="num ' + pCls(r.pMonth) + '"><b>' + (r.pMonth==null?'\u2014':fmtNum(r.pMonth,1)+'%') + '</b></td>' +
      '<td class="reason" style="font-size:11.5px;color:var(--cream-dim);line-height:1.5">' + r.reason + '</td>' +
    '</tr>';
  }).join('');
  tbody.querySelectorAll('tr[data-sym]').forEach(function(tr){
    tr.addEventListener('click', function(){ openStock(tr.getAttribute('data-sym')); });
  });
}

export async function runRanking3(univ, key, bodyId, btnId, selId, force){
  const tbody = document.getElementById(bodyId);
  const btn = document.getElementById(btnId);
  const n = parseInt(document.getElementById(selId).value, 10) || 20;
  if (rankCache[key] && !force){ renderRankRows(rankCache[key], n, bodyId); return; }
  btn.disabled = true; btn.textContent = 'Scoring\u2026';
  tbody.innerHTML = '<tr><td colspan="11" class="loading-dots">Scoring all ' + univ.length + ' stocks so the ranking is real \u2014 25\u201340 seconds. Switching the count afterwards is instant.</td></tr>';
  const nh = await fetchHistory('^NSEI','1y','1d');
  const nc = nh.closes;
  function nret(d){ const i = Math.max(0, nc.length-1-d); return (nc[nc.length-1]/nc[i]-1)*100; }
  const niftyRet = { r3: nret(63), r6: nret(126) };
  const rows = [];
  await runPool(univ, async function(t){
    try { rows.push(await scoreStock20(t, niftyRet)); } catch (err) { suppressed('ranking: score stock', err); }
  }, 6);
  rows.sort(function(a,b){ return b.composite - a.composite; });
  if (!rows.length){
    tbody.innerHTML = '<tr><td colspan="11" style="color:var(--cream-dim)">Couldn\u2019t score these right now \u2014 try again shortly.</td></tr>';
    btn.disabled = false; btn.textContent = 'Re-run'; return;
  }
  rankCache[key] = rows;
  renderRankRows(rows, n, bodyId);
  // EPIC-4 E4-1. This matters more here than in the screener: the ranking claims to score
  // the WHOLE universe, so silently scoring 52 of 55 makes the claim untrue.
  renderDeadSymbolNote(bodyId, univ);
  btn.disabled = false; btn.textContent = 'Re-run';
}

/**
 * Live prices for the ranking tables. Only the Price cell moves. The score, the sub-scores,
 * RSI and the P(up) odds are computed from daily history when the ranking runs, and re-scoring
 * a 55-stock universe every 15 seconds on intraday ticks would both cost the whole request
 * budget and mix a live price into daily-bar models. Re-run refreshes those.
 */
export const rankingLive = {
  name: 'ranking',
  symbols(){
    const out = [];
    for (const id of ['rankLargeBody', 'rankMidBody']){
      const body = document.getElementById(id);
      if (!isShown(body)) continue;
      body.querySelectorAll('tr[data-sym]').forEach(tr => out.push(tr.getAttribute('data-sym')));
    }
    return out;
  },
  apply(map){
    for (const id of ['rankLargeBody', 'rankMidBody']){
      const body = document.getElementById(id);
      if (!body) continue;
      body.querySelectorAll('tr[data-sym]').forEach(tr => {
        const q = map.get(tr.getAttribute('data-sym'));
        const cell = tr.children[1];
        if (!q || !cell) return;
        const text = '\u20b9' + fmtNum(q.price, 2);
        if (cell.textContent !== text) cell.textContent = text;
      });
    }
  }
};
