// Peer comparison: the same metrics for a stock's neighbours, with the open stock's position
// against the peer median.
//
// WHERE THE PEERS COME FROM
//
//   curated   the hand-maintained groups in data/universes.js — genuine business-line peers,
//             but only for the ~110 names the screener covers.
//   yahoo     for everything else, Yahoo's "recommendationsbysymbol": stocks people viewed
//             alongside this one. That is NOT an industry peer set. For Zydus Lifesciences it
//             returns three real pharma peers and then Motherson and Indus Towers.
//
// Search now reaches 2,585 companies, so without the fallback most stocks a user opens would
// say "no peer group". The fallback is kept honest two ways: the block says in words what the
// list is, and every row is tagged with whether it shares the selected stock's industry (from
// Yahoo's own assetProfile). The "vs peer median" figures are computed ONLY over same-industry
// rows — a pharma company's P/E against an auto-parts maker's median is a number that means
// nothing, and printing it would be a fabricated comparison (hard rule 3).

import { runPool, fetchJsonThroughProxy } from '../data/proxy.js';
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
    if (members.includes(t)) return { label, peers: members.filter(m => m !== t).slice(0,6), source:'curated' };
  }
  return null;
}

/** Yahoo's "viewed alongside" list, restricted to NSE listings. [] on any failure. */
export async function yahooNeighbours(symbol){
  try {
    const url = 'https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/' + encodeURIComponent(symbol);
    const data = await fetchJsonThroughProxy(url);
    const r = data && data.finance && data.finance.result && data.finance.result[0];
    return ((r && r.recommendedSymbols) || [])
      .map(x => x.symbol)
      .filter(s => /\.NS$/.test(s))
      .map(s => s.replace(/\.NS$/, ''))
      .slice(0, 6);
  } catch (err) {
    suppressed('peers: yahoo neighbours', err);
    return [];
  }
}

function rowFrom(t, isSelf, price, chg1y, rsi, f){
  const sd = (f && f.summaryDetail) || {};
  const ks = (f && f.defaultKeyStatistics) || {};
  const fd = (f && f.financialData) || {};
  const ap = (f && f.assetProfile) || {};
  return {
    t, isSelf, price, chg1y, rsi,
    pe: val(sd.trailingPE),
    pb: val(ks.priceToBook),
    roe: val(fd.returnOnEquity),
    margin: val(fd.profitMargins),
    revGrowth: val(fd.revenueGrowth),
    mcap: val(sd.marketCap),
    industry: ap.industry || null
  };
}

/** Median of a metric over the given rows, ignoring missing values. */
export function median(rows, key){
  const v = rows.map(r => r[key]).filter(x => x != null && Number.isFinite(x)).sort((a,b) => a-b);
  if (!v.length) return null;
  const m = Math.floor(v.length/2);
  return v.length % 2 ? v[m] : (v[m-1]+v[m])/2;
}

/**
 * Which rows count as peers for the median. Curated groups are peers by construction. For
 * the Yahoo list only rows in the selected stock's own industry count, and if the selected
 * stock's industry is unknown, none do — there is then nothing honest to compare against.
 */
export function comparableRows(rows, source){
  const others = rows.filter(r => !r.isSelf);
  if (source === 'curated') return others;
  const self = rows.find(r => r.isSelf);
  if (!self || !self.industry) return [];
  return others.filter(r => r.industry && r.industry === self.industry);
}

export async function renderPeers(symbol, selfMeta, selfFund){
  const block = document.getElementById('peerBlock');
  if (!block) return;
  const selfTicker = symbol.replace(/\.(NS|BO)$/,'');

  let grp = peersFor(symbol);
  if (!grp){
    block.innerHTML = '<div class="note-inline">No curated peer group for ' + selfTicker + ' — looking up stocks viewed alongside it…</div>';
    const peers = await yahooNeighbours(symbol);
    if (detailState.symbol !== symbol) return;
    if (!peers.length){
      block.innerHTML = '<div class="note-inline">No peer group is mapped for this company, and Yahoo returned no related NSE listings. Compare it by hand with the Compare section below.</div>';
      return;
    }
    grp = { label: 'Viewed alongside ' + selfTicker, peers, source:'yahoo' };
  }
  block.innerHTML = '<div class="note-inline">Loading ' + grp.peers.length + ' companies…</div>';

  const rows = [rowFrom(selfTicker, true, selfMeta.price, selfMeta.chg1y, selfMeta.rsi, selfFund)];

  await runPool(grp.peers, async (t) => {
    const sym = t + '.NS';
    try {
      const h = await fetchHistory(sym, '1y', '1d');
      const closes = h.closes;
      const price = h.meta.regularMarketPrice != null ? h.meta.regularMarketPrice : closes[closes.length-1];
      const chg1y = closes.length > 1 ? ((price / closes[0]) - 1) * 100 : null;
      let f = null;
      try { f = await fetchFundamentals(sym); } catch (err) { suppressed('peers: fundamentals', err); }
      rows.push(rowFrom(t, false, price, chg1y, rsiLast(closes, 14), f));
    } catch (err) { suppressed('peers: history', err); }
  }, 3);

  if (detailState.symbol !== symbol) return;

  const self = rows.find(r => r.isSelf);
  const comparable = comparableRows(rows, grp.source);

  function rankOf(key, higherIsBetter){
    const pool = comparable.concat([self]);
    const vals = pool.map(r => r[key]).filter(v => v != null && Number.isFinite(v));
    const me = self[key];
    if (me == null || !Number.isFinite(me) || vals.length < 3) return null;
    const sorted = vals.slice().sort((a,b) => higherIsBetter ? b-a : a-b);
    return { pos: sorted.indexOf(me) + 1, total: sorted.length };
  }
  const med = (key) => median(comparable, key);
  const cmp = (mine, m, betterHigh) => {
    if (mine == null || m == null) return '';
    const higher = mine > m;
    const good = betterHigh ? higher : !higher;
    return '<span class="' + (good?'up':'down') + '">' + (higher?'above':'below') + ' peer median</span>';
  };

  // Too few genuine peers to say anything about a median. Two is the floor: with one peer
  // the "median" is just that company, and calling it a peer median overstates it.
  const enoughPeers = comparable.length >= 2;

  rows.sort((a,b) => (b.isSelf - a.isSelf) || ((b.mcap||0) - (a.mcap||0)));

  const sourceNote = grp.source === 'yahoo'
    ? '<div class="note-inline" style="margin-bottom:12px"><b>Not a sector peer set.</b> These are the stocks Yahoo users viewed alongside ' +
      selfTicker + ', which is an interest signal, not an industry classification. Rows tagged <i>same industry</i> share ' +
      selfTicker + '’s industry' + (self.industry ? ' (' + escapeHtml(self.industry) + ')' : '') +
      ', and only those are used for the medians below.</div>'
    : '';

  const summary = enoughPeers
    ? '<div class="metric-grid" style="margin-bottom:14px;">' +
      '<div class="metric"><div class="k">P/E vs peers</div><div class="v">' + (self.pe==null?'—':fmtNum(self.pe,1)) + '</div>' +
        '<div class="sub">Median ' + (med('pe')==null?'—':fmtNum(med('pe'),1)) + ' · ' + cmp(self.pe, med('pe'), false) + (rankOf('pe', false) ? ' · cheapest #' + rankOf('pe', false).pos + ' of ' + rankOf('pe', false).total : '') + '</div></div>' +
      '<div class="metric"><div class="k">ROE vs peers</div><div class="v">' + (self.roe==null?'—':fmtPct(self.roe*100,1)) + '</div>' +
        '<div class="sub">Median ' + (med('roe')==null?'—':fmtPct(med('roe')*100,1)) + ' · ' + cmp(self.roe, med('roe'), true) + (rankOf('roe', true) ? ' · #' + rankOf('roe', true).pos + ' of ' + rankOf('roe', true).total : '') + '</div></div>' +
      '<div class="metric"><div class="k">Revenue growth vs peers</div><div class="v">' + (self.revGrowth==null?'—':fmtPct(self.revGrowth*100,1)) + '</div>' +
        '<div class="sub">Median ' + (med('revGrowth')==null?'—':fmtPct(med('revGrowth')*100,1)) + ' · ' + cmp(self.revGrowth, med('revGrowth'), true) + ' · year on year</div></div>' +
      '<div class="metric"><div class="k">1-year return vs peers</div><div class="v ' + (self.chg1y>=0?'up':'down') + '">' + (self.chg1y==null?'—':fmtPct(self.chg1y,1)) + '</div>' +
        '<div class="sub">Median ' + (med('chg1y')==null?'—':fmtPct(med('chg1y'),1)) + ' · ' + cmp(self.chg1y, med('chg1y'), true) + (rankOf('chg1y', true) ? ' · #' + rankOf('chg1y', true).pos + ' of ' + rankOf('chg1y', true).total : '') + '</div></div>' +
      '</div>'
    : '<div class="note-inline" style="margin-bottom:12px">Fewer than two of these share ' + selfTicker +
      '’s industry, so there is no honest peer median to set it against. The table is shown for reference only.</div>';

  const industryTag = (r) => {
    if (grp.source !== 'yahoo' || r.isSelf) return '';
    const same = self.industry && r.industry && r.industry === self.industry;
    return '<span class="peer-tag ' + (same ? 'same' : 'diff') + '">' + (same ? 'same industry' : (r.industry ? 'other industry' : 'industry unknown')) + '</span>';
  };

  block.innerHTML =
    '<div class="peer-head">' +
      '<span class="peer-label">' + escapeHtml(grp.label) + '</span>' +
      '<span class="peer-sub">' + rows.length + ' companies on the same metrics</span>' +
    '</div>' +
    sourceNote + summary +
    '<p class="scroll-hint">↔ Scroll sideways for all ten columns.</p>' +
    // Inside .rank-scroll, which is what gets it a horizontal scroller and a pinned name
    // column on a phone. Outside it, the generic mobile rule for table.book broke every row
    // into stacked, unlabelled lines — the same bug the watchlist had.
    '<div class="rank-scroll"><table class="book peer-table screener-table">' +
      '<thead><tr><th>Company</th><th>Market cap</th><th>Price</th><th>1Y %</th><th>Revenue growth</th>' +
      '<th>P/E</th><th>P/B</th><th>ROE</th><th>Margin</th><th>RSI</th></tr></thead>' +
      '<tbody>' + rows.map(r =>
        '<tr data-sym="' + r.t + '.NS" class="' + (r.isSelf?'peer-self':'') + '">' +
          '<td class="sym">' + r.t + (r.isSelf ? ' <span class="exch">selected</span>' : '') + industryTag(r) + '</td>' +
          '<td class="num">' + (r.mcap==null?'—':fmtCr(r.mcap)) + '</td>' +
          '<td class="num">' + (r.price==null?'—':'₹' + fmtNum(r.price,2)) + '</td>' +
          '<td class="num ' + (r.chg1y==null?'':r.chg1y>=0?'up':'down') + '">' + (r.chg1y==null?'—':fmtNum(r.chg1y,1)+'%') + '</td>' +
          '<td class="num">' + (r.revGrowth==null?'—':fmtNum(r.revGrowth*100,1)+'%') + '</td>' +
          '<td class="num">' + (r.pe==null?'—':fmtNum(r.pe,1)) + '</td>' +
          '<td class="num">' + (r.pb==null?'—':fmtNum(r.pb,1)) + '</td>' +
          '<td class="num">' + (r.roe==null?'—':fmtNum(r.roe*100,1)+'%') + '</td>' +
          '<td class="num">' + (r.margin==null?'—':fmtNum(r.margin*100,1)+'%') + '</td>' +
          '<td class="num">' + (r.rsi==null?'—':fmtNum(r.rsi,0)) + '</td>' +
        '</tr>').join('') +
      '</tbody></table></div>' +
    '<div class="note-inline" style="margin-top:12px;">A low P/E or high ROE relative to peers is information, not a verdict — companies can trade cheap for good reasons and expensive for good reasons.</div>';

  block.querySelectorAll('tr[data-sym]').forEach(tr => {
    tr.addEventListener('click', () => openStock(tr.getAttribute('data-sym')));
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
