// The board: index cards, the scrolling ticker, the editable watchlist and the search box.
//
// The watchlist is the only user state this app keeps, and it lives in memory for the
// session — there is no account, no backend and no persistence (docs/01). Adding storage
// would be the first thing that makes this app hold personal data.
//
// wireSearch needs three characters before it will rank suggestions, because a one- or
// two-letter prefix matches too much of the directory to be useful.

import { INDICES, STOCK_DIRECTORY } from '../data/universes.js';
import { fetchQuote } from '../data/yahoo.js';
import { fmtNum } from './format.js';
import { fullSymbol } from './symbol.js';
import { openStock } from './navigate.js';

export let watchlist = ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','ITC.NS','SBIN.NS','BHARTIARTL.NS'];

export const quoteCache = Object.create(null);

export function renderIndices(){
  const grid = document.getElementById('indicesGrid');
  grid.innerHTML = INDICES.map(idx => {
    const q = quoteCache[idx.symbol];
    if (!q) return `<div class="index-card"><div class="name">${idx.name}</div><div class="full-name">${idx.full}</div><div class="price loading-dots">fetching…</div></div>`;
    const up = q.change >= 0; const arrow = up ? '▲' : '▼'; const cls = up ? 'up' : 'down';
    return `<div class="index-card">
      <div class="name">${idx.name}</div><div class="full-name">${idx.full}</div>
      <div class="price">${fmtNum(q.price, 2)}</div>
      <div class="delta ${cls}">${arrow} ${fmtNum(Math.abs(q.change),2)} (${fmtNum(Math.abs(q.changePercent),2)}%)</div>
      ${q.stale ? `<div class="stale">last known — feed unreachable</div>` : ''}
    </div>`;
  }).join('');
}

// One row shape, used by the watchlist and by the Top 20 list. They looked identical when
// they were two copies, which is exactly how two copies start; the mobile grid in
// styles.css places these cells by class, so a divergence here is a silent layout break in
// whichever list was not the one being looked at.
//
// `removable` is the only difference: the Top 20 is a fixed list of the largest names, so
// there is nothing to remove from it, but the cell is still rendered. The mobile row is a
// four-column grid and an absent fifth cell would let the price spill into its track.
export function quoteRow(sym, q, removable){
  const exch = sym.endsWith('.BO') ? 'BSE' : 'NSE';
  const displaySym = sym.replace(/\.(NS|BO)$/, '');
  const action = removable
    ? `<button data-remove="${sym}" aria-label="Remove ${displaySym} from the watchlist">×</button>`
    : '';
  const head = `<td class="sym" data-label="Symbol"><span class="tk">${displaySym}</span><span class="exch">${exch}</span></td>`;
  const tail = `<td class="remove" data-label="">${action}</td>`;
  if (!q){
    return `<tr class="rowlink" data-sym="${sym}">${head}` +
      `<td class="price loading-dots" data-label="Price">fetching…</td>` +
      `<td class="chg" data-label="Change"></td>` +
      `<td class="chg pct" data-label="% Chg"></td>${tail}</tr>`;
  }
  const up = q.change >= 0; const cls = up ? 'up':'down'; const arrow = up ? '▲' : '▼';
  return `<tr class="rowlink" data-sym="${sym}">${head}` +
    `<td class="price" data-label="Price">₹${fmtNum(q.price,2)}</td>` +
    `<td class="chg ${cls}" data-label="Change">${arrow} ${fmtNum(Math.abs(q.change),2)}</td>` +
    `<td class="chg pct ${cls}" data-label="% Chg">${fmtNum(Math.abs(q.changePercent),2)}%</td>${tail}</tr>`;
}

export function renderWatchlist(){
  const body = document.getElementById('watchlistBody');
  if (watchlist.length === 0){
    body.innerHTML = `<tr class="empty"><td colspan="5" style="color:var(--cream-dim); padding:16px 10px;">Your board is empty. Add a symbol above.</td></tr>`;
    return;
  }
  body.innerHTML = watchlist.map(sym => quoteRow(sym, quoteCache[sym], true)).join('');

  body.querySelectorAll('button[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      watchlist = watchlist.filter(s => s !== btn.getAttribute('data-remove'));
      renderWatchlist(); renderTicker();
    });
  });
  body.querySelectorAll('tr.rowlink').forEach(tr => {
    tr.addEventListener('click', () => openStock(tr.getAttribute('data-sym')));
  });
}

export function renderTicker(){
  const all = INDICES.map(i => ({ label:i.name, symbol:i.symbol })).concat(watchlist.map(s => ({ label:s.replace(/\.(NS|BO)$/,''), symbol:s })));
  const items = all.map(({label, symbol}) => {
    const q = quoteCache[symbol];
    if (!q) return `<span class="ticker-item">${label} <span style="color:var(--cream-dim)">—</span></span>`;
    const up = q.change >= 0; const cls = up ? 'up':'down'; const arrow = up ? '▲':'▼';
    return `<span class="ticker-item"><b>${label}</b> ${fmtNum(q.price,2)} <span class="${cls}">${arrow} ${fmtNum(Math.abs(q.changePercent),2)}%</span></span>`;
  }).join('');
  document.getElementById('tickerTrack').innerHTML = items + items;
}

export function addSymbolToWatchlist(sym){
  if (!watchlist.includes(sym)) watchlist.push(sym);
  renderWatchlist(); renderTicker();
  if (!quoteCache[sym]) fetchQuote(sym).then(q => { quoteCache[sym]=q; renderWatchlist(); renderTicker(); }).catch(()=>{});
}

export function wireSearch(){
  const input = document.getElementById('searchInput');
  const exchSel = document.getElementById('searchExchange');
  const box = document.getElementById('suggestions');
  let activeIdx = -1, currentMatches = [];

  function renderSuggestions(matches){
    currentMatches = matches; activeIdx = -1;
    if (matches.length === 0){ box.classList.remove('show'); box.innerHTML=''; return; }
    box.innerHTML = matches.map(([sym,name]) => `<div class="item" data-sym="${sym}"><span class="sy">${sym}</span><span class="nm">${name}</span></div>`).join('');
    box.classList.add('show');
    box.querySelectorAll('.item').forEach(el => el.addEventListener('click', () => {
      input.value = el.getAttribute('data-sym'); box.classList.remove('show'); runSearch();
    }));
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 3){ renderSuggestions([]); return; }
    const scored = [];
    STOCK_DIRECTORY.forEach(([sym,name]) => {
      const s = sym.toLowerCase(), nm = name.toLowerCase();
      let score = -1;
      if (s.startsWith(q)) score = 0;
      else if (nm.startsWith(q)) score = 1;
      else if (s.includes(q)) score = 2;
      else if (nm.includes(q)) score = 3;
      if (score >= 0) scored.push([score, sym, name]);
    });
    scored.sort((a,b) => a[0]-b[0]);
    renderSuggestions(scored.slice(0,10).map(([,sym,name]) => [sym,name]));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown'){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, currentMatches.length-1); highlight(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); highlight(); }
    else if (e.key === 'Enter'){
      if (activeIdx >= 0 && currentMatches[activeIdx]){ input.value = currentMatches[activeIdx][0]; }
      box.classList.remove('show'); runSearch();
    } else if (e.key === 'Escape'){ box.classList.remove('show'); }
  });
  function highlight(){
    box.querySelectorAll('.item').forEach((el,i) => el.classList.toggle('active', i===activeIdx));
  }
  document.addEventListener('click', (e) => { if (!box.contains(e.target) && e.target !== input) box.classList.remove('show'); });

  function runSearch(){
    const raw = input.value.trim();
    if (!raw) return;
    const sym = fullSymbol(raw, exchSel.value);
    openStock(sym);
  }
  document.getElementById('searchBtn').addEventListener('click', runSearch);
}
