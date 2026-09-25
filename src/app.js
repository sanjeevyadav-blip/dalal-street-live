// Dalal Street Live — application entry point.
//
// Extracted verbatim from the inline <script> in index.html (PR-4 of
// engineering/22-REFACTOR-PLAN.md). EPIC-1 carves modules out of this file one
// directory at a time; what remains at the end is bootstrap and wiring only.

import { INDICES, NIFTY_SYMBOL, UNIV_LARGE, UNIV_MID } from './data/universes.js';
import { runPool } from './data/proxy.js';
import { historyCache, fetchQuote, fetchHistory, fetchFundamentals } from './data/yahoo.js';
import { fetchNews } from './data/news.js';

import { average } from './indicators/util.js';
import { rsiLast } from './indicators/momentum.js';
import { atrLast } from './indicators/volatility.js';
import { pivotPoints } from './indicators/patterns.js';


import { updateClock } from './ui/format.js';
import { showError, clearError } from './ui/errors.js';
import { detailState } from './ui/detail-state.js';
import { setStockDetailHandler } from './ui/navigate.js';
import { fullSymbol } from './ui/symbol.js';
import { GLOSSARY, hideGloss, annotateGlossary } from './ui/glossary.js';

import { drawChart } from './ui/charts.js';
import { loadIpos } from './ui/ipo.js';

import { countSelectHtml, loadScreener3, scrCache, screenerFilterBarHtml, wireScreenerControls } from './ui/tables/screener.js';
import { mountDiagnostics } from './ui/diagnostics-block.js';
import { mountTop20 } from './ui/top20.js';
import { mountMarketNews } from './ui/market-news.js';
import { mountMobileShell, openDetailView } from './ui/mobile-shell.js';
import { mountDetailTabs } from './ui/detail-tabs.js';
import { initNativeShell, shouldRegisterServiceWorker } from './ui/native.js';
import { initDiagnostics } from './diagnostics.js';
import { runRanking3, rankCache } from './ui/tables/ranking.js';

import { renderFundamentals, renderFundamentalsUnavailable } from './ui/fundamentals.js';
import { renderNews, renderNewsUnavailable } from './ui/news-block.js';
import { renderIntradayDesk, renderIntradayVWAP } from './ui/intraday-desk.js';
import { renderPeers } from './ui/peers.js';
import { mountCompare } from './ui/compare.js';
import { watchlist, quoteCache, renderIndices, renderWatchlist, renderTicker, addSymbolToWatchlist, wireSearch } from './ui/watchlist.js';


import { renderDetail } from './ui/detail.js';

// The IIFE that used to wrap this file is gone. It existed to keep the app out of the
// global scope when everything shipped as one inline <script>; an ES module already has
// its own scope and is always strict, so the wrapper did nothing but add a level of
// indentation. Removing it is what makes bootstrap() the visible entry point.

// Records an upstream failure that the UI deliberately rides out. The call sites below
// used to be empty catch blocks, which made "the feed failed" look exactly like "this
// company does not publish that number" — the one confusion CLAUDE.md invariant 3 exists
// to prevent. This does not change what renders; it makes the failure findable.
// EPIC-4 story E4-2 upgrades the individual blocks to render their own error state.

// ================= Config =================

 // symbol -> {meta,dates,closes,opens,highs,lows,volumes}


// Your own Cloudflare Worker (see worker.js). Paste its URL here — no
// trailing slash, e.g. 'https://dalal-proxy.yourname.workers.dev'.
// Leave as '' to fall back to the free public relays, which are unreliable.


// ================= Networking =================

// Runs `worker` over `items` with at most `concurrency` in flight at once —
// much faster than one-at-a-time, without hammering the free proxies all at once.


// ================= Market hours (IST) =================

// ================= Formatting =================

// ================= Technical indicators =================

// ---- Full-series versions (for charting subplots) ----

// ---- Risk / momentum metrics ----

// ================= Peer groups (for like-for-like comparison) =================
// Grouped by broad business line so comparisons are meaningful. Not an official
// index classification — just a sensible peer set for each name.


// ================= Day-trading metrics =================
// All derived from price/volume. Descriptive levels, not trade signals.

// ================= IPO data (NSE) =================

// ================= Rendering: indices =================

// ================= Rendering: watchlist =================


// ================= Refresh cycle (indices + watchlist) =================
let refreshing = false;
async function refreshAll(){
  if (refreshing) return; refreshing = true;
  let anyFailure = false;
  const symbols = INDICES.map(i => i.symbol).concat(watchlist);
  await runPool(symbols, async (sym) => {
    try { quoteCache[sym] = await fetchQuote(sym); }
    catch { anyFailure = true; if (quoteCache[sym]) quoteCache[sym].stale = true; }
    renderIndices(); renderWatchlist(); renderTicker();
  }, 5);
  if (anyFailure) showError('Some prices couldn\'t be refreshed — the free CORS relay may be rate-limited right now. Showing last known values where available.');
  else clearError();
  document.getElementById('lastUpdated').textContent = 'Last updated ' + new Date().toLocaleTimeString('en-IN', { hour12:false });
  refreshing = false;
}

// ================= Stock detail =================


async function loadStockDetail(symbol){
  detailState.symbol = symbol;
  const section = document.getElementById('detailSection');
  const card = document.getElementById('detailCard');
  section.classList.add('show');
  card.innerHTML = `<div class="loading-dots" style="padding:30px 0; text-align:center;">Loading ${symbol.replace(/\.(NS|BO)$/,'')}…</div>`;
  // On a phone the detail takes over the screen and the Back button returns you to the
  // tab you came from. A no-op on desktop, where the panel stays in the page and the
  // scroll below is the right behaviour.
  openDetailView();
  section.scrollIntoView({ behavior:'smooth', block:'start' });

  let hist, niftyHist;
  try {
    [hist, niftyHist] = await Promise.all([
      fetchHistory(symbol, '2y', '1d'),
      historyCache[NIFTY_SYMBOL+'|2y|1d'] ? Promise.resolve(historyCache[NIFTY_SYMBOL+'|2y|1d']) : fetchHistory(NIFTY_SYMBOL, '2y', '1d')
    ]);
  } catch {
    card.innerHTML = `<div class="banner show" style="margin:0;">Couldn't load ${symbol} — the symbol may not exist, or the data relay is temporarily unreachable. Try again in a moment.</div>`;
    return;
  }
  if (detailState.symbol !== symbol) return; // a newer search superseded this one

  renderDetail(symbol, hist, niftyHist);
  // Needs only the symbol and the search index, so it can render straight away rather than
  // waiting on fundamentals like the peer table does.
  mountCompare(symbol);

  // Context the peer + intraday panels need, computed from the 2y history we already have.
  const _c = hist.closes, _h = hist.highs, _l = hist.lows;
  const _price = hist.meta.regularMarketPrice != null ? hist.meta.regularMarketPrice : _c[_c.length-1];
  const _prevClose = hist.meta.previousClose != null ? hist.meta.previousClose
    : (hist.meta.chartPreviousClose != null ? hist.meta.chartPreviousClose : _c[_c.length-2]);
  const _oneY = _c.slice(-252);
  const detailCtx = {
    prevClose: _prevClose,
    avgVol20: average(hist.volumes.slice(-20)),
    atr14: atrLast(_h, _l, _c, 14),
    pivots: pivotPoints(_h, _l, _c),
    price: _price,
    chg1y: _oneY.length > 1 ? ((_price / _oneY[0]) - 1) * 100 : null,
    rsi: rsiLast(_c, 14)
  };

  // Best-effort extras, rendered when/if they arrive
  fetchFundamentals(symbol).then(f => {
    if (detailState.symbol !== symbol) return;
    renderFundamentals(f);
    renderPeers(symbol, detailCtx, f);
  }).catch(() => {
    if (detailState.symbol !== symbol) return;
    renderFundamentalsUnavailable();
    renderPeers(symbol, detailCtx, null);
  });

  fetchHistory(symbol, '1d', '5m').then(intraday => {
    if (detailState.symbol !== symbol) return;
    renderIntradayVWAP(intraday);
    renderIntradayDesk(intraday, detailCtx);
  }).catch(() => {
    const b = document.getElementById('intradayBlock');
    if (b) b.innerHTML = `<div class="note-inline">Intraday bars unavailable right now — Yahoo only serves them around and after market hours.</div>`;
  });

  const companyLabel = (hist.meta.longName || hist.meta.shortName || symbol.replace(/\.(NS|BO)$/,''));
  fetchNews(companyLabel).then(items => { if (detailState.symbol === symbol) renderNews(items); })
    .catch(() => { if (detailState.symbol === symbol) renderNewsUnavailable(); });
}


// ---------- Canvas chart ----------


// ================= Search =================


// ================= IPO rendering =================


// ================= Screener =================
// Cap-tier grouping here is illustrative (for organising this table), not an official AMFI/SEBI classification.


// ================= Wiring =================
let autoTimer = null;
function setAutoRefresh(ms){ if (autoTimer) clearInterval(autoTimer); if (ms > 0) autoTimer = setInterval(refreshAll, ms); }
// Every listener on an element that exists in the static markup. Runs first, before
// anything rebuilds a section, because the elements these bind to are the ones the
// markup ships with.
function wireControls(){
  document.getElementById('loadIpos').addEventListener('click', loadIpos);
  document.getElementById('intervalSelect').addEventListener('change', (e) => setAutoRefresh(parseInt(e.target.value,10)));
  document.getElementById('refreshNowBtn').addEventListener('click', refreshAll);
  document.getElementById('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('symbolInput');
    const exch = document.getElementById('exchangeSelect').value;
    const rawv = input.value.trim();
    if (!rawv) return;
    addSymbolToWatchlist(fullSymbol(rawv, exch));
    input.value = '';
  });
  window.addEventListener('resize', () => { if (detailState.chartData) drawChart(); });
}

// First paint and the refresh loop.
function startApp(){
  // ================= Init =================
  // Lets the UI modules open a stock without importing app.js back. See ui/navigate.js.
  setStockDetailHandler(loadStockDetail);
  wireSearch();
  renderIndices(); renderWatchlist(); renderTicker();
  updateClock(); setInterval(updateClock, 1000);
  setAutoRefresh(30000);
  refreshAll();
}


// ===== IPO detail extras: news + official filing links =====


// Was a wrap-by-reassignment (`showIpoDetail = function(){ orig(); extras(); }`). Written
// out as an ordinary two-step function so the name can live in a module — an imported
// binding cannot be reassigned. Behaviour is unchanged: the original already awaited the
// core render before appending the extras. The same treatment for renderDetailCore is
// PR-8, where it becomes a declared block list rather than a chain of three wraps.

// The three renderDetailCore wraps that used to sit here are gone. The panel's block
// list, its delays and the reason they exist now live in ui/detail.js — read the note at
// the top of that file before changing the timing.
// Creates the ranking section and places it above the screener. Its contents are filled
// in by rebuildRanking3 further down, which runs synchronously in this same script, so
// the placeholder below is never painted. Only the element, its id and its position in
// the document matter here \u2014 rebuildRanking3 bails out if #rankSection is absent.
function mountRanking(){
  const scr = document.querySelector('section.screener');
  if (!scr) return;
  const sec = document.createElement('section');
  sec.className = 'screener';
  sec.id = 'rankSection';
  scr.parentNode.insertBefore(sec, scr);
}


// Glossary tooltips. annotateGlossary cannot run once and be done: blocks render
// asynchronously and at staggered delays, so a MutationObserver re-annotates whatever
// arrives, debounced, plus one pass at 600ms for anything that beat the observer.
function wireGlossary(){
  document.addEventListener('click', function(e){
    if (!e.target.classList || !e.target.classList.contains('gloss')) hideGloss();
  });
  window.addEventListener('scroll', hideGloss, true);
  const glossObserver = new MutationObserver(function(muts){
    let touched = false;
    muts.forEach(function(m){ if (m.addedNodes && m.addedNodes.length) touched = true; });
    if (touched) { clearTimeout(window.__glossT); window.__glossT = setTimeout(function(){ annotateGlossary(); }, 250); }
  });
  glossObserver.observe(document.body, { childList:true, subtree:true });
  setTimeout(function(){ annotateGlossary(); }, 600);
}
/**
 * Rebuild the Glossary section's list from whatever is in GLOSSARY right now.
 *
 * Split out of mountGlossary because the two have to happen at different times.
 *
 * THE BUG THIS FIXES. mountGlossary read GLOSSARY once, and the four extendGlossaryFor*
 * calls run after it, so thirteen terms worked as tooltips but never appeared in the
 * section at all. CLAUDE.md recorded the remedy as "move mountGlossary to the end of
 * bootstrap". That does not work: mountManual positions itself with
 * insertBefore(#glossarySection), so mounting the glossary later leaves the manual
 * appended after the controls at the foot of the page. The documented one-liner would have
 * traded a missing-terms bug for a layout bug.
 *
 * So the section is still CREATED where it always was, leaving every other block's
 * positioning untouched, and only its LIST is re-rendered at the end of bootstrap once
 * every term has been registered. The search box listens on the input and queries
 * .gloss-entry at keystroke time, so replacing the entries underneath it is safe.
 */
function renderGlossaryList(){
  const list = document.getElementById('glossList');
  if (!list) return 0;
  const entries = Object.keys(GLOSSARY).map(function(k){ return GLOSSARY[k]; });
  const seen = {}, uniq = [];
  entries.forEach(function(e){ if (!seen[e[0]]){ seen[e[0]]=1; uniq.push(e); } });
  uniq.sort(function(a,b){ return a[0].localeCompare(b[0]); });
  list.innerHTML = uniq.map(function(e){
    return '<div class="news-item gloss-entry" style="cursor:default">' +
      '<div class="news-title" style="color:var(--gold)">' + e[0] + '</div>' +
      '<div style="font-size:12.5px;line-height:1.65;color:var(--cream-dim);margin-top:4px">' + e[1] + '</div></div>';
  }).join('');
  return uniq.length;
}

function mountGlossary(){
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  const controls = wrap.querySelector('.controls');
  const sec = document.createElement('section');
  sec.className = 'screener';
  sec.id = 'glossarySection';
  sec.innerHTML =
    '<div class="section-head"><h2>Glossary</h2><span class="hint">Every term on this page, in plain English</span></div>' +
    '<div class="add-form"><input type="text" id="glossSearch" placeholder="Search a term \u2014 e.g. beta, DCF, open interest" autocomplete="off"></div>' +
    '<div id="glossList" class="news-list"></div>';
  if (controls) wrap.insertBefore(sec, controls); else wrap.appendChild(sec);
  renderGlossaryList();
  const inp = document.getElementById('glossSearch');
  if (inp) inp.addEventListener('input', function(){
    const q = inp.value.toLowerCase().trim();
    document.querySelectorAll('#glossList .gloss-entry').forEach(function(el){
      el.style.display = !q || el.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
    });
  });
}
function fixRankNote(){
  const sec = document.getElementById('rankSection');
  if (!sec) return;
  const note = sec.querySelector('.screener-note');
  if (!note) return;
  note.innerHTML = 'Each stock is scored 0\u2013100 on four factors and blended: indicators 35%, relative strength 35%, candlesticks 15%, volume 15%. ' +
    '<b>Derivatives are not part of this composite</b> \u2014 not because the data is unavailable (NSE\u2019s option chain now works, and you can see it on any individual F&amp;O stock), ' +
    'but because pulling 30 option chains would take far longer than this ranking should, and only about 180 NSE names have options at all, which would make the comparison uneven. ' +
    'This ranks <em>recent momentum and technical posture</em>, which is not the same as a view on the business. It is not a buy list.';
}
function extendGlossaryForRanking(){
  GLOSSARY['p(up) 1 week'] = ['Probability of a rise in one week',
    'The chance the price ends higher after five trading days, calculated from this stock\u2019s own past-year drift and volatility. It assumes the future resembles the recent past, which is exactly when it fails \u2014 around shocks and news. Values cluster near 50% because one week of stock movement is genuinely close to a coin flip.'];
  GLOSSARY['p(up) 1 month'] = ['Probability of a rise in one month',
    'Same calculation over roughly 21 trading days. Longer horizons let any upward drift accumulate, so this usually sits slightly above the one-week figure for a rising stock and below it for a falling one. Still a model output, not a prediction.'];
  GLOSSARY['reasoning'] = ['Reasoning',
    'The main factors actually moving that row\u2019s probability: the stock\u2019s drift, its position against the 200-day average, MACD, RSI, and how it is doing against the Nifty. If a reason surprises you, open the stock and check the detail panel rather than trusting the summary.'];
}
function mountManual(){
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  const gloss = document.getElementById('glossarySection');
  const sec = document.createElement('section');
  sec.className = 'screener';
  sec.id = 'manualSection';
  function step(n, title, body){
    return '<div style="margin-bottom:18px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">' +
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--gold);color:#1a1305;font-weight:700;font-size:12px;font-family:var(--mono)">' + n + '</span>' +
      '<span style="font-family:var(--serif);font-weight:600;font-size:15px">' + title + '</span></div>' +
      '<div style="font-size:13px;line-height:1.7;color:var(--cream-dim)">' + body + '</div></div>';
  }
  sec.innerHTML =
    '<div class="section-head"><h2>How to use this dashboard</h2><span class="hint">Read this once \u2014 it will save you from the common misreadings</span></div>' +
    '<div class="screener-group">' +
    step('1','Start with the ticker and indices',
      'The scrolling tape and the three index cards show where the market is overall. A stock falling 2% on a day the Nifty falls 2% has told you nothing about the company \u2014 always read a move against the index first.') +
    step('2','Search or click any stock',
      'Type three or more letters in the search box (\u201ctata\u201d, \u201chdfc\u201d, \u201cwip\u201d) and pick from the suggestions, or click any row in the watchlist, screener or ranking tables. The full detail panel opens below.') +
    step('3','Read the Snapshot table first',
      'Every row names its own source. <b>Computed here</b> means it was calculated in your browser from live price data and cannot be stale. <b>Yahoo Finance</b> rows are vendor data that can lag a quarter on fundamentals. The risk-free rate is a fixed assumption \u2014 a dial you can disagree with, not a measurement.') +
    step('4','Use the \u24d8 markers everywhere',
      'Every metric label has a small circled <b>i</b>. Hover it on desktop, tap it on mobile, for a plain-English explanation. If you only remember one thing from those notes: a large number with a weak t-statistic is noise, not a finding.') +
    step('5','Charts, then technicals',
      'The main chart carries 50 and 200-day averages plus Bollinger bands; below it sit volume, RSI and MACD. Technicals describe <em>what price has been doing</em> and where it might pause. They are descriptive, not predictive, and they fail regularly \u2014 which is why they carry only part of the weight in any score here.') +
    step('6','Valuation: read the range, never the point',
      'The DCF prints a single fair value, but the sensitivity grid beneath it shows that value swinging 40% or more across perfectly defensible assumptions. The <b>reverse DCF</b> is usually the better tool: instead of asking what the stock is worth, it tells you what growth rate today\u2019s price already assumes \u2014 then you judge whether that is believable.') +
    step('7','Earnings quality is the fraud-and-fragility check',
      'Cash flow versus reported profit, accruals, and whether cash growth keeps pace with revenue. A company can report rising profits for years while generating no cash. This section is where that shows up, and it matters more than any indicator on the page.') +
    step('8','Options-implied odds carry the most weight',
      'Where a stock has listed options, the market itself is pricing the probability of it finishing above today\u2019s price, with real money at stake. That beats any model here. Two caveats printed alongside it: these are <em>risk-neutral</em> probabilities, which embed a fear premium, and thin open interest makes far-out strikes unreliable.') +
    step('9','Factor decomposition tells you what you actually own',
      'It splits returns into market, size and momentum exposure, leaving alpha. If R\u00b2 is high, you mostly own market risk. If alpha looks large but its t-statistic sits between \u22122 and 2, it is noise \u2014 that is the single most common misreading in retail analysis.') +
    step('10','Probabilities in the ranking are odds, not promises',
      'The weekly and monthly columns come from each stock\u2019s own drift and volatility. They cluster near 50% on purpose. Short-horizon stock movement is close to a coin flip, and a dashboard that told you otherwise would be lying to you.') +
    step('11','Size the position before you decide anything',
      'In the thesis walkthrough, enter your capital, the percentage you are willing to risk, and a stop price. It returns the number of shares that keeps your loss to that amount. Watch the concentration warning: a tight stop produces a large position for the same rupee risk.') +
    step('12','The verdict panel does not give a verdict',
      'It reports valuation, earnings quality, momentum, risk and the street view separately, and deliberately stops there. Where the pillars agree, you do not need a label. Where they conflict, <b>that conflict is the finding</b> \u2014 and collapsing it into one BUY/HOLD/AVOID word would hide the most useful thing on the page. The synthesis depends on your horizon, your existing holdings and your tax position, none of which this page knows.') +
    '</div>' +
    '<p class="screener-note"><b>What this dashboard is not.</b> It is not investment advice, and nothing here is a recommendation to buy or sell. ' +
    'Publishing buy/sell calls and target prices in India is restricted to SEBI-registered research analysts. ' +
    'Price data comes from unofficial Yahoo endpoints and NSE\u2019s public APIs through a proxy you own \u2014 reliable enough to think with, not something to place trades on without checking your broker\u2019s own feed. ' +
    'Every model on this page is shown with its assumptions and its failure modes visible, because a number without its caveats is worse than no number at all.</p>';
  if (gloss) wrap.insertBefore(sec, gloss); else wrap.appendChild(sec);
}
function injectRankScrollStyles(){
  if (document.getElementById('rankScrollStyle')) return;
  const st = document.createElement('style');
  st.id = 'rankScrollStyle';
  st.textContent =
    '.rank-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--hair);' +
    'border-radius:10px;background:rgba(255,255,255,.012)}' +
    '.rank-scroll table.book{min-width:1180px;margin:0}' +
    '.rank-scroll table.book th,.rank-scroll table.book td{white-space:nowrap;padding-left:12px;padding-right:12px}' +
    '.rank-scroll table.book td.reason{white-space:normal;min-width:250px}' +
    '.rank-scroll::-webkit-scrollbar{height:9px}' +
    '.rank-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,.04);border-radius:6px}' +
    '.rank-scroll::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:6px}' +
    '.rank-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}' +
    '.scroll-hint{font-size:11.5px;color:var(--cream-dim);margin:0 0 7px;font-family:var(--sans)}' +
    '@media (max-width:720px){' +
    '.rank-scroll table.book,.rank-scroll table.book thead,.rank-scroll table.book tbody,' +
    '.rank-scroll table.book tr,.rank-scroll table.book td,.rank-scroll table.book th{display:revert;width:auto}' +
    '.rank-scroll table.book thead{display:table-header-group}' +
    '.rank-scroll table.book tr{display:table-row;padding:0;border-bottom:1px solid var(--hair)}' +
    '.rank-scroll table.book td{display:table-cell;border:none;padding:12px}' +
    '.rank-scroll table.book td::before{content:none}' +
    '}' +
    // A thirteen-column table scrolled sideways loses the one column that says which row
    // you are reading: by the time P/E is on screen the symbol is long gone, and every
    // row is an anonymous line of numbers. Screener.in pins the name for exactly this
    // reason. The first cell stays put while the rest slides under it.
    //
    // The pinned cell needs an OPAQUE background — the scroller's own is a 1.2% white
    // wash over the page, and a translucent sticky cell has the scrolling columns
    // travelling visibly through the text. --ink is the page ground beneath it.
    //
    // z-index matters in two directions: the pinned cell sits above the sliding body
    // cells, and the pinned HEADER cell above both, or it is overlapped at the corner
    // while scrolling.
    '.rank-scroll table.book th:first-child,.rank-scroll table.book td:first-child{' +
    'position:sticky;left:0;z-index:2;background:var(--ink);' +
    'box-shadow:1px 0 0 var(--hair)}' +
    '.rank-scroll table.book thead th:first-child{z-index:3}' +
    // The sticky cell is painted from its own background, so the row hover and the
    // zebra-free body would otherwise stop dead at the pinned column's edge.
    '.rank-scroll table.book tbody tr:hover td:first-child{background:#0F1A26}' +
    '@media (hover:none){.rank-scroll table.book tbody tr:active td:first-child{background:#0F1A26}}';
  document.head.appendChild(st);
}
function extendGlossaryForScreener(){
  GLOSSARY['volume'] = ['Volume score', 'A 0\u2013100 sub-score, not raw share count. It compares the last 20 days of turnover against the last 60, and counts how many of the recent sessions closed higher. Above 50 means participation is picking up on rising days.'];
  GLOSSARY['1d %'] = ['One-day change', 'Price change versus the previous trading session\u2019s close. If this ever matches the 1Y figure exactly, something is broken \u2014 that was a real bug here, caused by falling back to a year-old reference price.'];
  GLOSSARY['1y %'] = ['One-year change', 'Price change over roughly the last 252 trading sessions. Compare it against the Nifty\u2019s own move before reading anything into it.'];
  GLOSSARY['market cap'] = ['Market capitalisation', 'The whole company\u2019s value: share price \u00d7 shares outstanding. Shown in crore. It sets the context for every other number \u2014 a 30% ROE means something different at \u20b9500 Cr than at \u20b95 lakh Cr.'];
  GLOSSARY['debt / equity'] = ['Debt-to-equity', 'Borrowings against shareholder funds, as a percentage. Under 40 is conservative, over 100 means the company owes more than its owners have put in. Leverage magnifies both good and bad years.'];
  GLOSSARY['vs 200-dma'] = ['Distance from the 200-day average', 'How far price sits above or below its 200-day moving average. Above is generally read as an uptrend. A stock far above it may be extended; far below, it may be broken or oversold.'];
  GLOSSARY['volume vs avg'] = ['Volume versus average', 'The last 20 days of turnover divided by the last 60. Above 1.25\u00d7 means unusual activity \u2014 something is drawing attention. Below 0.75\u00d7 means interest is fading.'];
  GLOSSARY['off 52w high'] = ['Distance from the 52-week high', 'How far the price has fallen from its highest point in the past year. A deep drawdown is either an opportunity or a warning, and this column alone cannot tell you which.'];
  GLOSSARY['dividend yield'] = ['Dividend yield', 'Annual dividend as a percentage of the share price \u2014 the cash return for simply holding, before any price movement. A very high yield often signals the price has fallen, not that the dividend rose.'];
}
function rebuildScreener3(){
  const body = document.getElementById('largeCapBody');
  if (!body) return;
  let sec = body;
  while (sec && sec.tagName !== 'SECTION') sec = sec.parentNode;
  if (!sec) return;
  const head = '<tr><th>Symbol</th><th>Price</th><th>1D %</th><th>1Y %</th><th>Market cap</th>' +
    '<th>RSI(14)</th><th>P/E</th><th>ROE</th><th>Debt / Equity</th><th>Dividend yield</th>' +
    '<th>vs 200-DMA</th><th>Volume vs avg</th><th>Off 52w high</th></tr>';
  function group(title, bodyId, btnId, selId){
    return '<div class="screener-group">' +
      '<div class="screener-head"><h3>' + title + '</h3><div>' + countSelectHtml(selId, 10) +
      '<button id="' + btnId + '">Load</button></div></div>' +
      '<p class="scroll-hint">\u2194 Scroll sideways for all thirteen columns.</p>' +
      '<div class="rank-scroll"><table class="book screener-table"><thead>' + head + '</thead>' +
      '<tbody id="' + bodyId + '"><tr><td colspan="13" style="color:var(--cream-dim);padding:14px 12px">Not loaded yet \u2014 pick a count and click Load.</td></tr></tbody></table></div></div>';
  }
  sec.innerHTML =
    '<div class="section-head"><h2>Screener</h2>' +
    '<span class="hint">Live, objective metrics only \u2014 no buy/sell calls, no invented targets</span></div>' +
    '<p class="screener-note">Price, momentum, valuation, quality and participation for each name, pulled live. ' +
    'Each table has its own row-count selector, drawn from a 55-stock universe; already-fetched rows are cached, so widening from 10 to 50 only fetches the new names. ' +
    'There is deliberately no \u201ctarget price\u201d or \u201cprobability of success\u201d column: nobody can honestly compute the odds a stock reaches a price by a date, and a target is a forecast dressed as a fact. ' +
    'In India, publishing buy/sell/target recommendations is restricted to <a href="https://www.sebi.gov.in" target="_blank" rel="noopener">SEBI</a>-registered Research Analysts and Investment Advisers. ' +
    'A starting point for your own research, not a tip sheet.</p>' +
    screenerFilterBarHtml() +
    group('Large cap', 'largeCapBody', 'loadLargeCap', 'scrLargeCount') +
    group('Mid cap', 'midCapBody', 'loadMidCap', 'scrMidCount');
  wireScreenerControls();
  document.getElementById('loadLargeCap').addEventListener('click', function(){ loadScreener3(UNIV_LARGE,'large','largeCapBody','loadLargeCap','scrLargeCount'); });
  document.getElementById('loadMidCap').addEventListener('click', function(){ loadScreener3(UNIV_MID,'mid','midCapBody','loadMidCap','scrMidCount'); });
  document.getElementById('scrLargeCount').addEventListener('change', function(){
    if (Object.keys(scrCache.large).length) loadScreener3(UNIV_LARGE,'large','largeCapBody','loadLargeCap','scrLargeCount');
  });
  document.getElementById('scrMidCount').addEventListener('change', function(){
    if (Object.keys(scrCache.mid).length) loadScreener3(UNIV_MID,'mid','midCapBody','loadMidCap','scrMidCount');
  });
}
function rebuildRanking3(){
  const sec = document.getElementById('rankSection');
  if (!sec) return;
  const head = '<tr><th>Rank</th><th>Price</th><th>Score</th><th>Indicators</th><th>Volume</th>' +
    '<th>RS vs Nifty (3M)</th><th>RSI</th><th>Pattern</th><th>P(up) 1 week</th><th>P(up) 1 month</th><th>Reasoning</th></tr>';
  function group(title, bodyId, btnId, selId){
    return '<div class="screener-group">' +
      '<div class="screener-head"><h3>' + title + '</h3><div>' + countSelectHtml(selId, 20) +
      '<button id="' + btnId + '">Rank</button></div></div>' +
      '<p class="scroll-hint">\u2194 Scroll sideways for all eleven columns.</p>' +
      '<div class="rank-scroll"><table class="book screener-table"><thead>' + head + '</thead>' +
      '<tbody id="' + bodyId + '"><tr><td colspan="11" style="color:var(--cream-dim);padding:14px 12px">Not ranked yet \u2014 pick a count and click Rank.</td></tr></tbody></table></div></div>';
  }
  sec.innerHTML =
    '<div class="section-head"><h2>Top performers</h2>' +
    '<span class="hint">Technical ranking, model-derived odds, and the reasoning behind each row</span></div>' +
    '<p class="screener-note">Stocks are ranked 0\u2013100 by a blend of indicators (35%), relative strength (35%), candlestick patterns (15%) and volume (15%). ' +
    '<b>The whole 55-stock universe is scored every time</b>, then the top N you select is shown \u2014 ranking only the first 10 names would not be a ranking. Changing the count afterwards is instant; press Re-run for fresh prices. ' +
    '<b>Indicators</b> and <b>Volume</b> are the 0\u2013100 sub-scores feeding the blend, so you can see which part carries a stock\u2019s rank. ' +
    '<b>The probability columns are model output, not forecasts.</b> They come from each stock\u2019s own past-year drift and volatility: if the next week or month behaves like the past year, what are the odds the price ends higher? ' +
    'A small tilt (at most \u00b16 points) comes from the technical score. Expect most values between 45% and 60% \u2014 that narrow band is the honest answer, and any tool showing 85% confidence on a one-week move is selling you something. ' +
    'This ranks <em>momentum and technical posture</em>, not business quality. It is not a buy list.</p>' +
    group('Large cap', 'rankLargeBody', 'rankLargeBtn', 'rankLargeCount') +
    group('Mid cap', 'rankMidBody', 'rankMidBtn', 'rankMidCount');
  document.getElementById('rankLargeBtn').addEventListener('click', function(){ runRanking3(UNIV_LARGE,'large','rankLargeBody','rankLargeBtn','rankLargeCount', true); });
  document.getElementById('rankMidBtn').addEventListener('click', function(){ runRanking3(UNIV_MID,'mid','rankMidBody','rankMidBtn','rankMidCount', true); });
  document.getElementById('rankLargeCount').addEventListener('change', function(){
    if (rankCache.large) runRanking3(UNIV_LARGE,'large','rankLargeBody','rankLargeBtn','rankLargeCount', false);
  });
  document.getElementById('rankMidCount').addEventListener('change', function(){
    if (rankCache.mid) runRanking3(UNIV_MID,'mid','rankMidBody','rankMidBtn','rankMidCount', false);
  });
}
// Added AFTER mountGlossary has already built the list — see bootstrap() below.
// Terms the probability lab introduces (EPIC-5 E5-4).
//
// glossaryLookup prefix-matches, so these keys attach to the lab's full metric labels even
// though those carry a horizon in them ("geometric brownian motion — p(higher in 21
// trading days)").
//
// Called BEFORE mountGlossary in bootstrap(), unlike the three extendGlossaryFor* functions
// below it, so these terms appear in the Glossary section and not only as tooltips. That the
// others do not is the long-standing finding recorded in CLAUDE.md; this does not fix it,
// but new terms should not be added to it either.
function extendGlossaryForLab(){
  GLOSSARY['geometric brownian motion'] = ['Geometric Brownian motion (GBM)',
    'The textbook model of a share price: a steady drift plus random noise, with the noise the same size every day. Its probability of finishing higher is honest arithmetic on the past two years — but it assumes moves are independent and normally distributed, and real prices cluster and gap. It therefore understates the chance of a big move, most when one is most likely. Read the first digit and ignore the decimal.'];
  GLOSSARY['garch'] = ['GARCH(1,1)',
    'A model of how volatility itself moves. Every other volatility figure on this page is an average over a window, which answers "how volatile has this been"; GARCH answers "how volatile is it now", because calm follows calm and turbulence follows turbulence. The half-life tells you how long a shock takes to fade. It cannot represent the fact that falls raise volatility more than rises do.'];
  GLOSSARY['hidden markov regime model'] = ['Regime model (hidden Markov)',
    'Assumes the market is always in one of two unobserved states with different drift and volatility, and infers which one it is probably in now. Two cautions. It is fitted on the whole window including today, so it is not an out-of-sample judgement — it will always look like it spotted the last crash. And check the state separation: below about 0.1 the two states overlap so heavily that the split is arbitrary, and the probability means nothing.'];
  GLOSSARY['walk-forward classifier'] = ['Walk-forward classifier',
    'A model trained on the older 70% of history and scored only on the newer 30% it never saw. The number that matters is the EDGE, not the accuracy: if a stock rose on 60% of test days, predicting "up" every time scores 60% and has learned nothing. No edge is the normal, expected result, and this row exists to report that rather than to be beaten.'];
  GLOSSARY['blended'] = ['Blended probability',
    'The models combined by adding their weighted log-odds. Trust it less than the rows above it, not more. Combining evidence this way assumes the models are independent, and they are not — they read the same price series and in places share a drift estimate — so agreement between them is partly an echo rather than confirmation. Where they disagree, the disagreement is the more useful finding.'];
  GLOSSARY['dcf monte carlo'] = ['DCF Monte Carlo',
    'Runs the discounted cash flow model thousands of times with growth, discount and terminal rates drawn from a range instead of fixed, and reports the spread. The headline is the share of runs valuing the company above its market price. It is NOT a probability the share price rises and carries no time horizon at all — a company can be 80% undervalued here and fall for three years. The width of the band is the real output.'];
  GLOSSARY['state separation'] = ['State separation',
    'How distinguishable the regime model’s two states actually are, measured across both their average return and their volatility. The model will always split the data in two and always report a confident-looking probability, even when there is nothing to split. Below roughly 0.1 treat that probability as noise; above 0.3 the two states are genuinely different.'];
  GLOSSARY['brier score'] = ['Brier score',
    'The average squared error of the probabilities themselves, so it judges calibration rather than direction. A model that always says 50% scores exactly 0.25. Below that is better than guessing; above it is worse. A model can be accurate and still score badly here, which means it is right about direction while being far too confident about it.'];
}

function extendGlossaryForRowCount(){
  GLOSSARY['show'] = ['Row count', 'How many rows this table displays. Each table keeps its own setting \u2014 changing one does not affect the others. In the ranking, the full universe is always scored first and the count only decides how much of the result you see.'];
}
function mobileLayer(){
  function meta(name, content, prop){
    const m = document.createElement('meta');
    if (prop) m.setAttribute('property', name); else m.name = name;
    m.content = content;
    document.head.appendChild(m);
  }
  if (!document.querySelector('link[rel="manifest"]')){
    const l = document.createElement('link');
    l.rel = 'manifest'; l.href = 'manifest.json';
    document.head.appendChild(l);
  }
  meta('theme-color', '#0B1520');
  meta('apple-mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  meta('apple-mobile-web-app-title', 'Dalal Street');
  meta('mobile-web-app-capable', 'yes');
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  // Not registered inside the Capacitor shell: the assets are already on the device, so the
  // worker caches nothing worth caching, and its network-first-with-cache-fallback rule can
  // keep a stale shell alive across an app update. See ui/native.js.
  if ('serviceWorker' in navigator && shouldRegisterServiceWorker()){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
  const st = document.createElement('style');
  st.id = 'mobileStyle';
  st.textContent = [
    ':root{--safe-b:env(safe-area-inset-bottom,0px);--safe-t:env(safe-area-inset-top,0px)}',
    'button,select,input{min-height:40px}',
    '@media (hover:none){.gloss{width:18px;height:18px;font-size:11px;opacity:.9}}',
    '@media (max-width:760px){',
    'body{padding-bottom:calc(64px + var(--safe-b))}',
    '.wrap{padding:0 13px 30px}',
    'header.masthead{padding:16px 0 12px;position:sticky;top:0;z-index:40;',
    'background:linear-gradient(180deg,var(--ink) 78%,rgba(11,21,32,.92));backdrop-filter:blur(8px);',
    'padding-top:calc(16px + var(--safe-t))}',
    '.masthead h1{font-size:25px}',
    '.masthead p.sub{display:none}',
    '.status-block{text-align:left}',
    '.status-pill{padding:4px 10px;font-size:10.5px}',
    '.status-block .clock{font-size:11px;margin-top:4px}',
    '.search-row{flex-wrap:wrap;gap:7px}',
    '.search-row input[type=text]{flex:1 1 100%;font-size:16px;padding:12px}',
    '.search-row select{flex:0 0 auto}',
    '.search-row button{flex:1 1 auto}',
    '.add-form{flex-wrap:wrap;gap:7px}',
    '.add-form input[type=text]{flex:1 1 100%;font-size:16px}',
    '.add-form select{flex:0 0 auto}',
    '.add-form button{flex:1 1 auto}',
    'section.indices{display:flex;overflow-x:auto;gap:11px;scroll-snap-type:x mandatory;',
    'padding-bottom:6px;-webkit-overflow-scrolling:touch}',
    'section.indices::-webkit-scrollbar{display:none}',
    '.index-card{flex:0 0 78%;scroll-snap-align:start;padding:15px 16px}',
    '.index-card .price{font-size:25px}',
    '.detail-card{padding:15px 13px;border-radius:12px}',
    '.detail-head h3{font-size:19px;line-height:1.3}',
    '.price-hero .big{font-size:31px}',
    '.price-hero{gap:9px}',
    '.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
    '.metric{padding:10px 11px}',
    '.metric .v{font-size:14.5px;word-break:break-word}',
    '.metric .k{font-size:10px}',
    '.metric .sub{font-size:10.5px}',
    '.metric[style*="span 2"]{grid-column:1 / -1 !important}',
    '.stat-row{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.section-label{font-size:14.5px;margin:20px 0 9px}',
    '.chart-wrap{height:230px}',
    '.subplot-wrap{height:78px}',
    '.range-btns button{padding:7px 12px;font-size:12.5px}',
    '.legend{font-size:10.5px;gap:9px;flex-wrap:wrap}',
    '.rank-scroll{border-radius:9px}',
    '.rank-scroll table.book{min-width:960px}',
    '.screener-head{flex-wrap:wrap;gap:9px}',
    '.screener-head h3{font-size:15px}',
    '.screener-note,.note-inline{font-size:12px;line-height:1.65}',
    '.section-head h2{font-size:18px}',
    '.section-head .hint{font-size:11.5px}',
    '.gloss-pop{max-width:calc(100vw - 22px);font-size:13px;padding:13px 15px}',
    '.controls{flex-direction:column;align-items:stretch;gap:9px}',
    '.controls .left{justify-content:space-between}',
    '}',
    '@media (max-width:380px){',
    '.metric-grid,.stat-row{grid-template-columns:1fr}',
    '.masthead h1{font-size:22px}',
    '.price-hero .big{font-size:27px}',
    '}',
    '#mnav{display:none}',
    '@media (max-width:760px){',
    '#mnav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;',
    'background:rgba(13,25,39,.97);backdrop-filter:blur(12px);border-top:1px solid var(--hair);',
    'padding:7px 4px calc(7px + var(--safe-b))}',
    '#mnav a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;',
    'text-decoration:none;color:var(--cream-dim);font-size:10px;font-family:var(--sans);padding:4px 2px}',
    '#mnav a span.ic{font-size:16px;line-height:1}',
    '#mnav a:active{color:var(--gold)}',
    '}'
  ].join('');
  document.head.appendChild(st);
  // The element only. mountMobileShell fills it and wires the clicks, because the labels
  // and the click behaviour belong with the panels they switch between \u2014 this used to
  // hold five anchors that smooth-scrolled one very long page.
  const nav = document.createElement('nav');
  nav.id = 'mnav';
  document.body.appendChild(nav);
  let deferred = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferred = e;
    const bar = document.createElement('div');
    bar.id = 'installBar';
    bar.style.cssText = 'position:fixed;left:11px;right:11px;bottom:calc(72px + var(--safe-b));z-index:70;' +
      'background:var(--panel);border:1px solid var(--gold);border-radius:11px;padding:12px 14px;' +
      'display:flex;align-items:center;gap:11px;box-shadow:0 10px 30px rgba(0,0,0,.5)';
    bar.innerHTML = '<div style="flex:1;font-size:12.5px;line-height:1.5;color:var(--cream)">' +
      '<b>Install Dalal Street Live</b><div style="color:var(--cream-dim);font-size:11.5px;margin-top:2px">' +
      'Adds an icon to your home screen and opens fullscreen.</div></div>' +
      '<button id="instYes" style="background:var(--gold);color:#1a1305;border:none;padding:9px 15px;' +
      'border-radius:8px;font-weight:600;font-size:12.5px;cursor:pointer">Install</button>' +
      '<button id="instNo" style="background:none;border:none;color:var(--cream-dim);font-size:19px;cursor:pointer;padding:0 4px">\u00d7</button>';
    document.body.appendChild(bar);
    document.getElementById('instYes').addEventListener('click', function(){
      bar.remove();
      if (deferred){ deferred.prompt(); deferred = null; }
    });
    document.getElementById('instNo').addEventListener('click', function(){ bar.remove(); });
  });
}

// ================= Bootstrap =================
//
// The whole start-up sequence, in one place and in execution order. Until PR-9 this was
// eight IIFEs and a scatter of loose statements interleaved between them, and the order
// was whatever the file happened to be in.
//
// THE ORDER IS LOAD-BEARING. Two dependencies in particular:
//
//   - mountRanking CREATES <section id="rankSection">. rebuildRanking3 only fills it and
//     returns early if it is absent, so mounting must come first or the entire ranking
//     feature disappears with no error.
//   - mountGlossary reads GLOSSARY once to build the Glossary section. Anything added to
//     GLOSSARY after that call is a tooltip only and never appears in the section.
//
// That second one is a real bug, and this sequence preserves it deliberately: the three
// extendGlossary* calls below all run AFTER mountGlossary, so thirteen terms — the
// probability columns, the screener columns and the row-count selector — work as tooltips
// but are missing from the Glossary list. Moving mountGlossary to the end of this function
// fixes it in one line. That is a behavioural change, so it is not part of PR-9.
function bootstrap(){
  wireControls();
  startApp();

  mountRanking();
  wireGlossary();
  extendGlossaryForLab();
  mountGlossary();
  fixRankNote();
  extendGlossaryForRanking();
  mountManual();
  injectRankScrollStyles();
  extendGlossaryForScreener();
  rebuildScreener3();
  rebuildRanking3();
  extendGlossaryForRowCount();
  mobileLayer();

  // Every extendGlossaryFor* call has now run, so rebuild the list. Without this the
  // thirteen terms they add exist as tooltips and nowhere else. See renderGlossaryList
  // for why the section itself is not simply mounted later instead.
  renderGlossaryList();

  // EPIC-4 E4-4. Last, and after mobileLayer, so the panel picks up the mobile stylesheet.
  // initDiagnostics only decides whether the panel is SHOWN; the failure buffer has been
  // filling since the first module loaded.
  initDiagnostics();
  mountDiagnostics();

  // EPIC-6. A no-op on the website; inside the Capacitor shell it routes external links to
  // the system browser, themes the status bar and dismisses the splash.
  initNativeShell();

  // The two sections the phone shell adds, then the shell itself. Order matters twice:
  // both must exist before the shell sorts sections into panels, and the shell must be
  // last of everything, because it moves nodes that every earlier mount* wired up.
  mountTop20();
  mountMarketNews();
  mountMobileShell();
  // Watches #detailCard, which exists in the static markup, so this can go anywhere after
  // the DOM is ready. It is last only to keep the phone-layout mounts together.
  mountDetailTabs();
}

bootstrap();

