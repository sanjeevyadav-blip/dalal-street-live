// Peer comparison: the same handful of metrics for a stock's sector neighbours, with the
// open stock's rank against the group median.
//
// Peer groups are hand-maintained in data/universes.js rather than derived from a sector
// classification, because no free, reliable NSE sector mapping is available to this app.
// A stock with no group gets no peer block — an arbitrary group would be worse than none.

import { runPool } from '../data/proxy.js';
import { fetchHistory, fetchFundamentals, val } from '../data/yahoo.js';
import { PEER_GROUPS } from '../data/universes.js';
import { detailState } from './detail-state.js';
import { fmtNum, fmtCr, fmtPct } from './format.js';
import { rsiLast } from '../indicators/momentum.js';
import { openStock } from './navigate.js';
import { suppressed } from '../suppressed.js';

export function peersFor(ticker){
  const t = ticker.replace(/\.(NS|BO)$/,'');
  for (const [label, members] of PEER_GROUPS){
    if (members.includes(t)) return { label, peers: members.filter(m => m !== t).slice(0,6) };
  }
  return null;
}

export async function renderPeers(symbol, selfMeta, selfFund){
  const block = document.getElementById('peerBlock');
  if (!block) return;
  const grp = peersFor(symbol);
  if (!grp){
    block.innerHTML = `<div class="note-inline">No peer group mapped for this symbol yet — peer comparison covers the ~110 large and mid caps in the built-in directory.</div>`;
    return;
  }
  block.innerHTML = `<div class="note-inline">Loading ${grp.peers.length} peers in ${grp.label}…</div>`;

  const selfTicker = symbol.replace(/\.(NS|BO)$/,'');
  const rows = [];
  // self row first
  rows.push({
    t: selfTicker, isSelf: true,
    price: selfMeta.price, chg1y: selfMeta.chg1y, rsi: selfMeta.rsi,
    pe: selfFund ? val(selfFund.summaryDetail && selfFund.summaryDetail.trailingPE) : null,
    pb: selfFund ? val(selfFund.defaultKeyStatistics && selfFund.defaultKeyStatistics.priceToBook) : null,
    roe: selfFund ? val(selfFund.financialData && selfFund.financialData.returnOnEquity) : null,
    margin: selfFund ? val(selfFund.financialData && selfFund.financialData.profitMargins) : null,
    mcap: selfFund ? val(selfFund.summaryDetail && selfFund.summaryDetail.marketCap) : null,
  });

  await runPool(grp.peers, async (t) => {
    const sym = t + '.NS';
    try {
      const h = await fetchHistory(sym, '1y', '1d');
      const closes = h.closes;
      const price = h.meta.regularMarketPrice != null ? h.meta.regularMarketPrice : closes[closes.length-1];
      const chg1y = closes.length > 1 ? ((price / closes[0]) - 1) * 100 : null;
      const rsi = rsiLast(closes, 14);
      let f = null;
      try { f = await fetchFundamentals(sym); } catch (err) { suppressed('screener row: fundamentals', err); }
      rows.push({
        t, isSelf: false, price, chg1y, rsi,
        pe: f ? val(f.summaryDetail && f.summaryDetail.trailingPE) : null,
        pb: f ? val(f.defaultKeyStatistics && f.defaultKeyStatistics.priceToBook) : null,
        roe: f ? val(f.financialData && f.financialData.returnOnEquity) : null,
        margin: f ? val(f.financialData && f.financialData.profitMargins) : null,
        mcap: f ? val(f.summaryDetail && f.summaryDetail.marketCap) : null,
      });
    } catch { /* skip peers that fail */ }
  }, 3);

  if (detailState.symbol !== symbol) return;

  // rank helper: where does the selected stock sit among peers on a metric?
  function rankOf(key, higherIsBetter){
    const vals = rows.map(r => r[key]).filter(v => v != null && !isNaN(v));
    const me = rows.find(r => r.isSelf)[key];
    if (me == null || isNaN(me) || vals.length < 2) return null;
    const sorted = vals.slice().sort((a,b) => higherIsBetter ? b-a : a-b);
    return { pos: sorted.indexOf(me) + 1, total: sorted.length };
  }
  const med = (key) => {
    const v = rows.filter(r=>!r.isSelf).map(r=>r[key]).filter(x=>x!=null&&!isNaN(x)).sort((a,b)=>a-b);
    if (!v.length) return null;
    const m = Math.floor(v.length/2);
    return v.length % 2 ? v[m] : (v[m-1]+v[m])/2;
  };

  const self = rows.find(r=>r.isSelf);
  const peRank = rankOf('pe', false);
  const roeRank = rankOf('roe', true);
  const chgRank = rankOf('chg1y', true);

  const cmp = (mine, median, betterHigh) => {
    if (mine == null || median == null) return '';
    const higher = mine > median;
    const good = betterHigh ? higher : !higher;
    return `<span class="${good?'up':'down'}">${higher?'above':'below'} peer median</span>`;
  };

  rows.sort((a,b) => (b.mcap||0) - (a.mcap||0));

  block.innerHTML = `
    <div class="peer-head">
      <span class="peer-label">${grp.label}</span>
      <span class="peer-sub">${rows.length} companies compared on the same metrics</span>
    </div>
    <div class="metric-grid" style="margin-bottom:14px;">
      <div class="metric"><div class="k">P/E vs peers</div><div class="v">${self.pe==null?'—':fmtNum(self.pe,1)}</div>
        <div class="sub">Median ${med('pe')==null?'—':fmtNum(med('pe'),1)} · ${cmp(self.pe, med('pe'), false)}${peRank?` · cheapest #${peRank.pos} of ${peRank.total}`:''}</div></div>
      <div class="metric"><div class="k">ROE vs peers</div><div class="v">${self.roe==null?'—':fmtPct(self.roe*100,1)}</div>
        <div class="sub">Median ${med('roe')==null?'—':fmtPct(med('roe')*100,1)} · ${cmp(self.roe, med('roe'), true)}${roeRank?` · #${roeRank.pos} of ${roeRank.total}`:''}</div></div>
      <div class="metric"><div class="k">1-year return vs peers</div><div class="v ${self.chg1y>=0?'up':'down'}">${self.chg1y==null?'—':fmtPct(self.chg1y,1)}</div>
        <div class="sub">Median ${med('chg1y')==null?'—':fmtPct(med('chg1y'),1)} · ${cmp(self.chg1y, med('chg1y'), true)}${chgRank?` · #${chgRank.pos} of ${chgRank.total}`:''}</div></div>
      <div class="metric"><div class="k">Profit margin vs peers</div><div class="v">${self.margin==null?'—':fmtPct(self.margin*100,1)}</div>
        <div class="sub">Median ${med('margin')==null?'—':fmtPct(med('margin')*100,1)} · ${cmp(self.margin, med('margin'), true)}</div></div>
    </div>
    <table class="book peer-table">
      <thead><tr><th>Company</th><th>Market cap</th><th>Price</th><th>1Y %</th><th>P/E</th><th>P/B</th><th>ROE</th><th>Margin</th><th>RSI</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-sym="${r.t}.NS" class="${r.isSelf?'peer-self':''}">
            <td class="sym">${r.t}${r.isSelf?' <span class="exch">selected</span>':''}</td>
            <td class="num">${r.mcap==null?'—':fmtCr(r.mcap)}</td>
            <td class="num">₹${fmtNum(r.price,2)}</td>
            <td class="num ${r.chg1y>=0?'up':'down'}">${r.chg1y==null?'—':fmtNum(r.chg1y,1)+'%'}</td>
            <td class="num">${r.pe==null?'—':fmtNum(r.pe,1)}</td>
            <td class="num">${r.pb==null?'—':fmtNum(r.pb,1)}</td>
            <td class="num">${r.roe==null?'—':fmtNum(r.roe*100,1)+'%'}</td>
            <td class="num">${r.margin==null?'—':fmtNum(r.margin*100,1)+'%'}</td>
            <td class="num">${r.rsi==null?'—':fmtNum(r.rsi,0)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="note-inline" style="margin-top:12px;">Peer sets are grouped by business line. A low P/E or high ROE relative to peers is information, not a verdict — companies can trade cheap for good reasons and expensive for good reasons.</div>
  `;
  block.querySelectorAll('tr[data-sym]').forEach(tr => {
    tr.addEventListener('click', () => openStock(tr.getAttribute('data-sym')));
  });
}
