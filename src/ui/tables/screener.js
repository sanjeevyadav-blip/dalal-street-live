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
import { deadSymbolWarning } from '../../data/symbol-health.js';
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
      failed[key].delete(t);
      const row = document.getElementById('s3-' + key + '-' + t);
      if (row) row.outerHTML = screenerRow2Html(r);
    } catch {
      failed[key].add(t);
      const row = document.getElementById('s3-' + key + '-' + t);
      if (row) row.outerHTML = failedRowHtml(t);
    }
  }, 5);
  loaded[key] = { list, bodyId };
  bindRowClicks(tbody);
  renderDeadSymbolNote(bodyId, list);
  // Sorting and filtering apply once the rows are in. Doing it per arriving row would
  // reorder the table under the reader's thumb while it is still filling.
  applyView(key);
  btn.disabled = false; btn.textContent = 'Refresh';
}

function failedRowHtml(t){
  return '<tr class="failed"><td class="sym">' + t + '</td><td colspan="12" style="color:var(--cream-dim)">Couldn\u2019t load</td></tr>';
}

// Delegated, once per tbody: applyView re-renders the rows wholesale, and per-row listeners
// would be lost on every sort.
function bindRowClicks(tbody){
  if (tbody.dataset.clicks) return;
  tbody.dataset.clicks = '1';
  tbody.addEventListener('click', function(e){
    const tr = e.target.closest('tr[data-sym]');
    if (tr && tbody.contains(tr)) openStock(tr.getAttribute('data-sym'));
  });
}

// ---- sort and filter -------------------------------------------------------------------
//
// Screener.in's core interaction is "show me only the ones that pass, in the order I care
// about". This gives most of that without its query language: tap a column heading to sort,
// and three filter chips for the questions people ask first.
//
// THE RULE THAT MATTERS: a missing value is never treated as a number. It sorts LAST in
// both directions, and it FAILS a filter rather than passing it. A loss-making company has
// no P/E; ranking it as the cheapest stock on screen, or letting it through "P/E under 15",
// would be a fabricated reading of a blank cell (CLAUDE.md hard rule 3). The count of rows
// hidden for want of data is shown, so the exclusion is visible rather than silent.

const failed = { large: new Set(), mid: new Set() };
const loaded = { large: null, mid: null };

// Column order matches the <th> order built in app.js rebuildScreener3.
export const SCREENER_COLUMNS = [
  { field:'ticker',    label:'Symbol',        text:true },
  { field:'price',     label:'Price' },
  { field:'change1d',  label:'1D %' },
  { field:'change1y',  label:'1Y %' },
  { field:'mcap',      label:'Market cap' },
  { field:'rsi',       label:'RSI(14)' },
  { field:'pe',        label:'P/E' },
  { field:'roe',       label:'ROE' },
  { field:'de',        label:'Debt / Equity' },
  { field:'divY',      label:'Dividend yield' },
  { field:'vs200',     label:'vs 200-DMA' },
  { field:'volRatio',  label:'Volume vs avg' },
  { field:'offHigh',   label:'Off 52w high' }
];

export const SCREENER_FILTERS = [
  { id:'pe',  field:'pe',  label:'P/E',         op:'max', options:[15, 25, 40],   unit:'',
    why:'no P/E reported (often a loss-maker)' },
  { id:'roe', field:'roe', label:'ROE',         op:'min', options:[10, 15, 20],   unit:'%',
    why:'no ROE reported' },
  { id:'de',  field:'de',  label:'Debt/Equity', op:'max', options:[25, 50, 100],  unit:'',
    why:'no debt/equity reported (common for banks)' }
];

const STORE_KEY = 'dsl.screener.view.v1';

function defaultView(){ return { sort:null, filters:{ pe:null, roe:null, de:null } }; }

// Saved on the device, never sent anywhere. Every access is guarded: storage can be
// unavailable (private mode, a locked-down WebView) and the screener must work regardless.
export function loadView(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultView();
    const v = JSON.parse(raw);
    const out = defaultView();
    if (v && v.sort && SCREENER_COLUMNS.some(c => c.field === v.sort.field) && (v.sort.dir === 1 || v.sort.dir === -1)){
      out.sort = { field:v.sort.field, dir:v.sort.dir };
    }
    for (const f of SCREENER_FILTERS){
      const x = v && v.filters ? v.filters[f.id] : null;
      out.filters[f.id] = f.options.includes(x) ? x : null;
    }
    return out;
  } catch { return defaultView(); }
}

function saveView(v){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

let view = null;
function currentView(){ if (!view) view = loadView(); return view; }

/** Rows that pass every active filter, plus a per-filter count of rows hidden for missing data. */
export function filterRows(rows, filters){
  const missing = {};
  const kept = rows.filter(r => {
    for (const f of SCREENER_FILTERS){
      const limit = filters[f.id];
      if (limit == null) continue;
      const x = r[f.field];
      if (x == null || !Number.isFinite(x)){ missing[f.id] = (missing[f.id] || 0) + 1; return false; }
      if (f.op === 'max' && x > limit) return false;
      if (f.op === 'min' && x < limit) return false;
    }
    return true;
  });
  return { kept, missing };
}

/** Stable sort; missing values last whichever way the column is sorted. */
export function sortRows(rows, sort){
  if (!sort) return rows.slice();
  const col = SCREENER_COLUMNS.find(c => c.field === sort.field);
  if (!col) return rows.slice();
  return rows
    .map((r, i) => [r, i])
    .sort((a, b) => {
      const x = a[0][sort.field], y = b[0][sort.field];
      const xn = x == null || (!col.text && !Number.isFinite(x));
      const yn = y == null || (!col.text && !Number.isFinite(y));
      if (xn && yn) return a[1] - b[1];
      if (xn) return 1;
      if (yn) return -1;
      const c = col.text ? String(x).localeCompare(String(y)) : x - y;
      return c !== 0 ? c * sort.dir : a[1] - b[1];
    })
    .map(p => p[0]);
}

export function applyView(key){
  const state = loaded[key];
  if (!state) return;
  const tbody = document.getElementById(state.bodyId);
  if (!tbody) return;
  const v = currentView();
  const rows = state.list.map(t => scrCache[key][t]).filter(Boolean);
  const { kept, missing } = filterRows(rows, v.filters);
  const shown = sortRows(kept, v.sort);
  const failedRows = state.list.filter(t => failed[key].has(t)).map(failedRowHtml);

  tbody.innerHTML = shown.map(screenerRow2Html).join('') +
    (shown.length === 0 && rows.length > 0
      ? '<tr class="empty"><td colspan="13" style="color:var(--cream-dim);padding:14px 12px">' +
        'No stock in this list passes the filters. Loosen one, or show more rows.</td></tr>'
      : '') +
    failedRows.join('');
  bindRowClicks(tbody);
  renderFilterSummary(key, rows.length, shown.length, missing);
  renderSortIndicators(tbody);
}

function renderFilterSummary(key, total, shown, missing){
  const state = loaded[key];
  const body = document.getElementById(state.bodyId);
  const host = body && body.closest('.screener-group');
  if (!host) return;
  let el = host.querySelector('.filter-summary');
  const active = SCREENER_FILTERS.some(f => currentView().filters[f.id] != null);
  if (!active){ if (el) el.remove(); return; }
  if (!el){
    el = document.createElement('div');
    el.className = 'filter-summary';
    host.insertBefore(el, host.querySelector('.rank-scroll'));
  }
  const hiddenForData = SCREENER_FILTERS
    .filter(f => missing[f.id])
    .map(f => missing[f.id] + ' with ' + f.why);
  el.textContent = 'Showing ' + shown + ' of ' + total + '.' +
    (hiddenForData.length ? ' Hidden for missing data: ' + hiddenForData.join('; ') + '.' : '');
}

function renderSortIndicators(tbody){
  const table = tbody.closest('table');
  if (!table) return;
  const v = currentView();
  table.querySelectorAll('thead th').forEach((th, i) => {
    const col = SCREENER_COLUMNS[i];
    if (!col) return;
    const on = v.sort && v.sort.field === col.field;
    th.setAttribute('aria-sort', on ? (v.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
    let ind = th.querySelector('.sort-ind');
    if (!ind){ ind = document.createElement('span'); ind.className = 'sort-ind'; ind.setAttribute('aria-hidden', 'true'); th.appendChild(ind); }
    ind.textContent = on ? (v.sort.dir === 1 ? ' \u25b2' : ' \u25bc') : '';
  });
}

function setSort(field){
  const v = currentView();
  const col = SCREENER_COLUMNS.find(c => c.field === field);
  if (!col) return;
  // First tap: the direction a reader most often wants \u2014 highest first for numbers, A to Z
  // for names. Second tap reverses. Third clears back to load order.
  const first = col.text ? 1 : -1;
  if (!v.sort || v.sort.field !== field) v.sort = { field, dir:first };
  else if (v.sort.dir === first) v.sort = { field, dir:-first };
  else v.sort = null;
  saveView(v);
  applyView('large'); applyView('mid');
  syncFilterControls();
}

function setFilter(id, value){
  const v = currentView();
  v.filters[id] = value;
  saveView(v);
  applyView('large'); applyView('mid');
  syncFilterControls();
}

function syncFilterControls(){
  const v = currentView();
  for (const f of SCREENER_FILTERS){
    const sel = document.getElementById('scrFilter-' + f.id);
    if (sel) sel.value = v.filters[f.id] == null ? '' : String(v.filters[f.id]);
  }
  const clear = document.getElementById('scrFilterClear');
  if (clear) clear.hidden = !SCREENER_FILTERS.some(f => v.filters[f.id] != null) && !v.sort;
}

/** The filter bar, placed above both screener tables by app.js. */
export function screenerFilterBarHtml(){
  return '<div class="scr-filters" role="group" aria-label="Filter the screener">' +
    SCREENER_FILTERS.map(f =>
      '<label class="chip"><span>' + f.label + (f.op === 'max' ? ' \u2264' : ' \u2265') + '</span>' +
      '<select id="scrFilter-' + f.id + '"><option value="">Any</option>' +
      f.options.map(o => '<option value="' + o + '">' + o + f.unit + '</option>').join('') +
      '</select></label>').join('') +
    '<button type="button" id="scrFilterClear" class="chip-clear" hidden>Clear sort &amp; filters</button>' +
    '</div>' +
    '<p class="scroll-hint">Tap a column heading to sort. Your choices are saved on this device.</p>';
}

/** Wire the headings and the filter bar. Idempotent; call after the section is rendered. */
export function wireScreenerControls(){
  for (const f of SCREENER_FILTERS){
    const sel = document.getElementById('scrFilter-' + f.id);
    if (!sel || sel.dataset.wired) continue;
    sel.dataset.wired = '1';
    sel.addEventListener('change', () => setFilter(f.id, sel.value === '' ? null : Number(sel.value)));
  }
  const clear = document.getElementById('scrFilterClear');
  if (clear && !clear.dataset.wired){
    clear.dataset.wired = '1';
    clear.addEventListener('click', () => {
      view = defaultView(); saveView(view);
      applyView('large'); applyView('mid'); syncFilterControls();
    });
  }
  for (const bodyId of ['largeCapBody', 'midCapBody']){
    const body = document.getElementById(bodyId);
    const table = body && body.closest('table');
    if (!table || table.dataset.sortWired) continue;
    table.dataset.sortWired = '1';
    table.querySelectorAll('thead th').forEach((th, i) => {
      const col = SCREENER_COLUMNS[i];
      if (!col) return;
      th.classList.add('sortable');
      th.tabIndex = 0;
      th.setAttribute('aria-sort', 'none');
      const go = (e) => {
        // The glossary marker inside a heading opens its explanation; that tap is not a sort.
        if (e.target.closest('.gloss')) return;
        setSort(col.field);
      };
      th.addEventListener('click', go);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(e); } });
    });
  }
  syncFilterControls();
}

/**
 * EPIC-4 E4-1: name the tickers that did not resolve, under the table that wanted them.
 *
 * The rows themselves already say "Couldn't load", but a reader scanning a 50-row table
 * does not reliably notice three of them — and cannot tell a dead ticker from a company
 * that happens to publish nothing. This states it once, by name, where it cannot be missed.
 */
export function renderDeadSymbolNote(bodyId, universe){
  const table = document.getElementById(bodyId);
  if (!table) return;
  const host = table.closest('.screener-group') || table.parentElement;
  if (!host) return;
  const noteId = bodyId + '-dead';
  const existing = document.getElementById(noteId);
  const msg = deadSymbolWarning(universe);
  if (!msg){ if (existing) existing.remove(); return; }
  const note = existing || document.createElement('div');
  note.id = noteId;
  note.className = 'note-inline';
  note.style.marginTop = '10px';
  note.textContent = msg;
  if (!existing) host.appendChild(note);
}
