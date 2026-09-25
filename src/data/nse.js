// NSE India endpoints.
//
// These need the session cookies the Worker establishes, and the option chain needs an
// explicit expiry. Two dead ends, both tested, both documented in docs/06 — do not
// re-attempt them: option-chain-equities is deprecated and returns {} whatever headers you
// send, and api/quote-equity returns 403 behind Akamai.
//
// NSE responses are deliberately not edge-cached: the session cookies make caching unsafe.

import { fetchJsonThroughProxy } from './proxy.js';

export async function fetchOptionChain(ticker){
  const base = 'https://www.nseindia.com/api/';
  const ci = await fetchJsonThroughProxy(base + 'option-chain-contract-info?symbol=' + encodeURIComponent(ticker));
  const exps = ci && ci.expiryDates ? ci.expiryDates : null;
  if (!exps || !exps.length) return null;
  const expiry = exps[0];
  const oc = await fetchJsonThroughProxy(base + 'option-chain-v3?type=Equity&symbol=' +
    encodeURIComponent(ticker) + '&expiry=' + encodeURIComponent(expiry));
  const rec = oc && oc.records;
  if (!rec || !rec.data || !rec.data.length) return null;
  return { expiry, expiries: exps, underlying: rec.underlyingValue, data: rec.data, timestamp: rec.timestamp || null };
}

export async function fetchIpos(){
  const url = 'https://www.nseindia.com/api/all-upcoming-issues?category=ipo';
  const data = await fetchJsonThroughProxy(url);
  return Array.isArray(data) ? data : [];
}

// ---- shareholding pattern and promoter pledge ---------------------------------------------
//
// Two NSE endpoints, both through the existing Worker (www.nseindia.com/api/ is already on
// the allowlist, so no deploy):
//
//   corporate-share-holdings-master   one row per shareholding filing: promoter % and public %
//   corporate-pledgedata              the latest promoter-pledge disclosure, as raw share counts
//
// WHAT IS NOT HERE: the FII / DII split. This summary publishes only promoter and public; the
// institutional breakdown lives inside each filing's XBRL document on a different NSE host.
// The block says so rather than leaving an empty column that looks like zero.

export async function fetchShareholding(ticker){
  const url = 'https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=' + encodeURIComponent(ticker);
  const data = await fetchJsonThroughProxy(url);
  return Array.isArray(data) ? data : [];
}

export async function fetchPledge(ticker){
  const url = 'https://www.nseindia.com/api/corporate-pledgedata?index=equities&symbol=' + encodeURIComponent(ticker);
  const data = await fetchJsonThroughProxy(url);
  return (data && Array.isArray(data.data) && data.data[0]) || null;
}

const MONTHS = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };

/** "30-JUN-2026" or "30-Jun-2026" -> Date (UTC), or null. */
export function parseNseDate(s){
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const mon = MONTHS[m[2].toUpperCase()];
  if (mon == null) return null;
  return new Date(Date.UTC(+m[3], mon, +m[1]));
}

function num(x){
  const n = parseFloat(String(x == null ? '' : x).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * One row per calendar quarter, newest first.
 *
 * Companies file off-cycle as well — RELIANCE has a 29-OCT-2024 filing alongside
 * 31-DEC-2024, for a bonus issue — and plotting every filing would put two points in one
 * quarter and read as a quarter-on-quarter move that was really one event. So filings are
 * bucketed by calendar quarter and the latest date in each bucket wins.
 *
 * A filing whose promoter figure is missing is dropped rather than shown as 0%: a company
 * with no promoter holding and a filing that failed to parse are different facts.
 */
export function shareholdingQuarters(rows, limit = 8){
  const byQuarter = new Map();
  for (const r of rows){
    const d = parseNseDate(r.date);
    const promoter = num(r.pr_and_prgrp);
    if (!d || promoter == null) continue;
    const key = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
    const prev = byQuarter.get(key);
    if (!prev || d > prev.date) byQuarter.set(key, { date: d, promoter, public: num(r.public_val) });
  }
  const out = [...byQuarter.values()].sort((a, b) => b.date - a.date).slice(0, limit);
  for (let i = 0; i < out.length; i++){
    const older = out[i + 1];
    out[i].change = older ? +(out[i].promoter - older.promoter).toFixed(2) : null;
  }
  return out;
}

/**
 * The pledge disclosure as two honest ratios, computed from the raw share counts.
 *
 * NSE's own percentage fields are ambiguous. For RELIANCE, percSharesPledged is 1.35, and
 * that turns out to be pledged shares over TOTAL issued shares — not over the promoter's
 * stake, which is what "promoter pledge" usually means and what investors look for. Over
 * the promoter holding it is 2.6%. Deriving both from the counts avoids repeating a label
 * that reads as the one and means the other.
 */
export function pledgeSummary(p){
  if (!p) return null;
  const pledged = num(p.numSharesPledged);
  const promoter = num(p.totPromoterHolding);
  const issued = num(p.totIssuedShares);
  if (pledged == null) return null;
  return {
    asOf: parseNseDate(p.shp),
    sharesPledged: pledged,
    ofPromoter: promoter ? (pledged / promoter) * 100 : null,
    ofCompany: issued ? (pledged / issued) * 100 : null
  };
}
