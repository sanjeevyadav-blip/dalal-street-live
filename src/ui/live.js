// Live prices for everything on screen.
//
// Before this, only the index strip, the watchlist and the ticker refreshed themselves. The
// Top 20 list, an open stock's price, the screener and the ranking were fetched once and then
// sat still, so the number a user was reading could be minutes old with nothing saying so.
//
// HOW IT STAYS CHEAP. Each view registers a provider: which symbols it is showing right now,
// and how to apply fresh quotes to itself. One refresh collects every visible symbol, asks
// Yahoo for all of them in batched requests (data/yahoo.js fetchQuotesBatch — 20 per request),
// and hands each view its own. A screen full of prices costs two or three requests per cycle,
// not one per stock, which matters against the Worker's 300-a-minute limit per IP when a
// mobile carrier puts many users behind one address.
//
// "Visible" means on screen now: on a phone only the active tab's view is refreshed, and a
// hidden tab catches up the moment it is opened.
//
// WHAT "LIVE" MEANS HERE, honestly: Yahoo's NSE prices were measured at three seconds old
// during market hours, and the app polls every 15 seconds. That is live enough to read a
// market by; it is not the tick-by-tick stream a broker app shows, which needs a paid,
// licensed exchange feed.

import { fetchQuotesBatch } from '../data/yahoo.js';
import { isMarketOpen } from '../data/alerts.js';
import { suppressed } from '../suppressed.js';

const providers = [];

/** A view that shows prices. symbols() -> string[] of what is on screen; apply(Map) updates it. */
export function registerLive(provider){ providers.push(provider); }

/** Displayed right now — not merely in the DOM. A display:none tab has no client rects. */
export function isShown(el){ return !!el && el.getClientRects().length > 0; }

const state = { lastOk: null, newestQuote: null, lastAttempt: null, failed: false };
export function liveState(){ return { ...state }; }

// While the market is shut the prices cannot move, so there is no point asking every 15
// seconds. One refresh every five minutes still catches the closing auction settling and the
// pre-open, without spending the rate-limit budget on unchanging numbers.
const CLOSED_EVERY_MS = 5 * 60 * 1000;

let running = null;

/**
 * Refresh every visible price. Resolves to { updated, failed }. `force` ignores the
 * market-closed throttle — for a user pressing Refresh, or opening a view.
 */
export function refreshLive({ force = false } = {}){
  if (running) return running;
  const now = Date.now();
  if (!force && !isMarketOpen(new Date(now)) && state.lastAttempt && now - state.lastAttempt < CLOSED_EVERY_MS){
    return Promise.resolve({ updated: 0, skipped: true });
  }
  state.lastAttempt = now;

  const active = [];
  for (const p of providers){
    let syms = [];
    try { syms = p.symbols() || []; } catch (err) { suppressed('live: ' + p.name + ' symbols', err); }
    if (syms.length) active.push({ p, syms });
  }
  const all = [...new Set(active.flatMap(a => a.syms))];
  if (!all.length) return Promise.resolve({ updated: 0 });

  running = fetchQuotesBatch(all).then(map => {
    for (const { p } of active){
      try { p.apply(map); } catch (err) { suppressed('live: ' + p.name + ' apply', err); }
    }
    state.lastOk = Date.now();
    state.failed = false;
    for (const q of map.values()) if (q.time && (!state.newestQuote || q.time > state.newestQuote)) state.newestQuote = q.time;
    renderStamp();
    return { updated: map.size };
  }).catch(err => {
    suppressed('live: batch', err);
    state.failed = true;
    renderStamp();
    return { updated: 0, failed: true };
  }).finally(() => { running = null; });
  return running;
}

// ---- the "how fresh is this" line ----------------------------------------------------------

const hhmm = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export function stampText(now = Date.now()){
  if (state.failed && state.lastOk && now - state.lastOk > 2 * 60 * 1000){
    return { text: 'Prices could not be refreshed · last at ' + hhmm(state.lastOk), cls: 'bad' };
  }
  if (!state.lastOk) return { text: 'Fetching live prices…', cls: '' };
  if (!isMarketOpen(new Date(now))){
    return { text: 'Market closed · prices as of ' + hhmm(state.newestQuote || state.lastOk), cls: 'closed' };
  }
  const secs = Math.max(0, Math.round((now - state.lastOk) / 1000));
  return { text: 'Live · updated ' + (secs < 5 ? 'just now' : secs + 's ago'), cls: 'live' };
}

export function renderStamp(){
  const el = document.getElementById('liveStamp');
  if (!el) return;
  const { text, cls } = stampText();
  if (el.textContent !== text) el.textContent = text;
  el.className = 'live-stamp' + (cls ? ' ' + cls : '');
}

let started = false;
/** Start the stamp ticking and refresh on the ways a user comes back to the app. */
export function startLive(){
  if (started) return;
  started = true;
  setInterval(renderStamp, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshLive({ force: true });
  });
  // A tab or a stock page opening shows prices that were not being refreshed while hidden.
  document.addEventListener('dsl:viewchange', () => refreshLive({ force: true }));
}
