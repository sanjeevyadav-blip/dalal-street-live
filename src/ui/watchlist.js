// The board: index cards, the scrolling ticker, the editable watchlist and the search box.
//
// The watchlist is the only user state this app keeps, and it lives in memory for the
// session — there is no account, no backend and no persistence (docs/01). Adding storage
// would be the first thing that makes this app hold personal data.
//
// wireSearch suggests from every NSE-listed company (data/search.js), falling back to a
// live Yahoo search for BSE-only names and anything listed since the list was built.

import { INDICES } from '../data/universes.js';
import { localMatches, remoteMatches, mergeRemote } from '../data/search.js';
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
  // Every keystroke bumps this, and a live-search response only renders if it still
  // matches. Without it a slow reply for "zy" lands after the fast one for "zydus" and
  // replaces the right answer with a worse one.
  let generation = 0;
  let remoteTimer = null;

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function renderSuggestions(matches, { searching = false } = {}){
    currentMatches = matches; activeIdx = -1;
    if (matches.length === 0 && !searching){ box.classList.remove('show'); box.innerHTML=''; return; }
    box.innerHTML = matches.map(m =>
      `<div class="item" data-sym="${escapeHtml(m.sym)}" data-exch="${m.exch}">` +
      `<span class="sy">${escapeHtml(m.sym)}${m.exch === 'BO' ? '<span class="xb">BSE</span>' : ''}</span>` +
      `<span class="nm">${escapeHtml(m.name)}</span></div>`).join('') +
      (searching ? '<div class="searching">Searching all listings\u2026</div>' : '');
    box.classList.add('show');
    box.querySelectorAll('.item').forEach(el => el.addEventListener('click', () => pick(el)));
  }

  // The suggestion carries its own exchange. Picking a BSE-only company must open the BSE
  // listing even if the dropdown still says NSE — fullSymbol would otherwise swap the
  // suffix and open a ticker that does not exist on NSE.
  function pick(el){
    input.value = el.getAttribute('data-sym');
    const exch = el.getAttribute('data-exch');
    if (exch && [...exchSel.options].some(o => o.value === exch)) exchSel.value = exch;
    box.classList.remove('show');
    runSearch();
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    const mine = ++generation;
    clearTimeout(remoteTimer);
    // Two characters, not three as before: "LT" and "MM" are real tickers, and exact-
    // ticker matches rank first, so a short query no longer buries the right answer.
    if (q.length < 2){ renderSuggestions([]); return; }

    const local = localMatches(q, 10);
    // Local covers every NSE-listed company, so a full page of local hits means there is
    // nothing the network would add worth waiting for.
    if (local.length >= 6 || q.length < 3){ renderSuggestions(local); return; }

    renderSuggestions(local, { searching: true });
    // Debounced: fire once the typing pauses, not per keystroke.
    remoteTimer = setTimeout(() => {
      remoteMatches(q).then(remote => {
        if (mine !== generation) return;
        renderSuggestions(local.concat(mergeRemote(local, remote)).slice(0, 12));
      });
    }, 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown'){ e.preventDefault(); activeIdx = Math.min(activeIdx+1, currentMatches.length-1); highlight(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); highlight(); }
    else if (e.key === 'Enter'){
      const el = activeIdx >= 0 ? box.querySelectorAll('.item')[activeIdx] : null;
      if (el){ pick(el); return; }
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
