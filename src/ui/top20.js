// The Top 20 list: the twenty largest names in the large-cap universe, with live price and
// day change, in the same compact row the watchlist uses.
//
// WHY THIS IS NOT THE SCREENER
//
// The screener answers "show me valuation, momentum and quality across a universe" and
// needs thirteen columns and a horizontal scroller to do it. This answers "what is the
// market doing", which is three numbers per name and fits a phone. Loading the screener to
// get a price list would fetch fundamentals, compute indicators and take tens of seconds
// for data this view throws away.
//
// It shares quoteCache with the watchlist deliberately: a name in both — RELIANCE and TCS
// are, by default — is fetched once and rendered twice.

import { UNIV_LARGE } from '../data/universes.js';
import { fetchQuote, fetchQuotesBatch } from '../data/yahoo.js';
import { isShown } from './live.js';
import { runPool } from '../data/proxy.js';
import { quoteCache, quoteRow } from './watchlist.js';
import { openStock } from './navigate.js';

const COUNT = 20;
const SYMBOLS = UNIV_LARGE.slice(0, COUNT).map(s => s + '.NS');

let started = false;

export function mountTop20(){
  if (document.getElementById('top20Section')) return;
  const watch = document.querySelector('section.watchlist');
  if (!watch || !watch.parentNode) return;

  const sec = document.createElement('section');
  sec.className = 'watchlist';
  sec.id = 'top20Section';
  sec.innerHTML =
    '<div class="section-head"><h2>Top 20</h2>' +
    '<span class="hint">The twenty largest names on the NSE by weight — tap any row for the full detail panel</span></div>' +
    '<table class="book quote-list"><thead><tr><th>Symbol</th><th>Last price</th>' +
    '<th>Change</th><th>% Change</th><th></th></tr></thead>' +
    '<tbody id="top20Body"></tbody></table>';
  watch.parentNode.insertBefore(sec, watch.nextSibling);
  renderTop20();
}

export function renderTop20(){
  const body = document.getElementById('top20Body');
  if (!body) return;
  body.innerHTML = SYMBOLS.map(sym => quoteRow(sym, quoteCache[sym], false)).join('');
  body.querySelectorAll('tr.rowlink').forEach(tr => {
    tr.addEventListener('click', () => openStock(tr.getAttribute('data-sym')));
  });
}

// Called when the tab is first shown, not at boot. Twenty quotes is twenty proxied
// requests, and firing them during startup would compete with the indices and the
// watchlist for the same connection budget while the user is looking at neither.
//
// Concurrency 4 matches the rest of the app. A re-render happens per batch rather than per
// quote so the list fills in visible steps instead of thrashing the DOM twenty times.
export function loadTop20(){
  if (started) return Promise.resolve();
  started = true;
  const missing = SYMBOLS.filter(s => !quoteCache[s]);
  if (!missing.length){ renderTop20(); return Promise.resolve(); }
  // One batched request for all twenty, instead of twenty. If the batch endpoint fails the
  // old one-per-stock path still fills the list.
  return fetchQuotesBatch(missing)
    .then(map => {
      for (const s of missing){ const q = map.get(s); if (q) quoteCache[s] = q; }
      renderTop20();
      const still = missing.filter(s => !quoteCache[s]);
      return still.length ? loadOneByOne(still) : undefined;
    })
    .catch(() => loadOneByOne(missing));
}

/** Live while the list is on screen; nothing is fetched for it while its tab is hidden. */
export const top20Live = {
  name: 'top20',
  symbols: () => (started && isShown(document.getElementById('top20Body'))) ? SYMBOLS : [],
  apply(map){
    let any = false;
    for (const s of SYMBOLS){ const q = map.get(s); if (q){ quoteCache[s] = q; any = true; } }
    if (any) renderTop20();
  }
};

function loadOneByOne(missing){
  return runPool(missing, (sym) =>
    fetchQuote(sym)
      .then(q => { quoteCache[sym] = q; })
      // A dead ticker leaves its row on "fetching…" rather than removing the name. The
      // row count is the promise this list makes; silently dropping a name is the bug
      // EPIC-4 E4-1 was raised for.
      .catch(() => {})
      .then(() => renderTop20()),
  4).then(() => renderTop20());
}
