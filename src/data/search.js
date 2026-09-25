// Stock search: every NSE-listed company locally, and Yahoo live for what the list lacks.
//
// Two tiers, because they fail in different ways:
//
//   local   the curated directory (friendly names for the ~100 most-used stocks) merged with
//           NSE's full list of 2,585 mainboard equities. Instant, works offline, knows
//           nothing listed since scripts/build-equity-list.mjs last ran and nothing that
//           trades only on BSE.
//   remote  Yahoo's search, through the existing Worker. Knows BSE-only names and new
//           listings, costs a network round trip, and returns global noise — "zyd" also
//           finds a Finnish company on four German exchanges — so it is filtered to .NS
//           and .BO and only consulted when the local tier comes up short.
//
// Suggestions previously knew 109 companies. Typing "zyd" or "polyc" returned nothing, and
// a user who gets no suggestion reasonably concludes the stock is not covered.

import { STOCK_DIRECTORY } from './universes.js';
import { nseEquities } from './nse-equities.js';
import { fetchJsonThroughProxy } from './proxy.js';

let index = null;

/**
 * [{ sym, name, exch }] — curated names win over NSE's official ones, because "Tata
 * Consultancy Services" is what people type and "Tata Consultancy Services Limited" (or
 * NSE's ALL-CAPS variants) is not.
 */
export function searchIndex(){
  if (index) return index;
  const bySym = new Map();
  for (const [sym, name] of nseEquities()) bySym.set(sym, { sym, name, exch: 'NS' });
  for (const [sym, name] of STOCK_DIRECTORY) bySym.set(sym, { sym, name, exch: 'NS' });
  index = [...bySym.values()];
  return index;
}

/**
 * Ranked local matches. Ranking, best first: ticker starts with the query, name starts
 * with it, a later WORD of the name starts with it, ticker contains it, name contains it.
 *
 * The word-start tier is new and matters more with 2,600 names than it did with 109:
 * "motors" should find Tata Motors and Hero MotoCorp before it finds every name that merely
 * contains the letters somewhere.
 */
export function localMatches(query, limit = 10){
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const scored = [];
  for (const row of searchIndex()){
    const s = row.sym.toLowerCase(), n = row.name.toLowerCase();
    let score = -1;
    if (s === q) score = 0;
    else if (s.startsWith(q)) score = 1;
    else if (n.startsWith(q)) score = 2;
    else if (n.includes(' ' + q)) score = 3;
    else if (s.includes(q)) score = 4;
    else if (n.includes(q)) score = 5;
    if (score >= 0) scored.push([score, row]);
  }
  // Stable within a tier by ticker length, so RELIANCE comes before RELIANCEPP-type
  // variants and the shortest, most canonical ticker surfaces first.
  scored.sort((a, b) => a[0] - b[0] || a[1].sym.length - b[1].sym.length || a[1].sym.localeCompare(b[1].sym));
  return scored.slice(0, limit).map(([, row]) => row);
}

/**
 * Yahoo's search, restricted to Indian listings. Resolves to [] rather than rejecting on
 * any failure: this is a fallback, and a dead fallback must leave the local results on
 * screen untouched rather than replacing them with an error.
 */
export async function remoteMatches(query, limit = 8){
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) +
    '&quotesCount=15&newsCount=0&listsCount=0';
  try {
    const data = await fetchJsonThroughProxy(url);
    const out = [];
    for (const r of (data && data.quotes) || []){
      const m = /^(.+)\.(NS|BO)$/.exec(r.symbol || '');
      if (!m) continue;
      if (r.quoteType && r.quoteType !== 'EQUITY') continue;
      out.push({ sym: m[1], name: r.longname || r.shortname || m[1], exch: m[2], remote: true });
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Remote results the local tier does not already show. Keyed on symbol AND exchange: the
 * NSE row for ZYDUSLIFE and a BSE row for the same company are different listings, and a
 * BSE-only name has no NSE row to collide with at all.
 */
export function mergeRemote(local, remote){
  const have = new Set(local.map(r => r.sym + '.' + r.exch));
  // A BSE duplicate of a company the list already has on NSE is noise, not a new result —
  // most users mean the NSE listing, and the exchange picker is still there for the rest.
  const nseSyms = new Set(local.filter(r => r.exch === 'NS').map(r => r.sym));
  return remote.filter(r => !have.has(r.sym + '.' + r.exch) && !(r.exch === 'BO' && nseSyms.has(r.sym)));
}
