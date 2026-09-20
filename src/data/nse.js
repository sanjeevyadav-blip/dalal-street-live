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
