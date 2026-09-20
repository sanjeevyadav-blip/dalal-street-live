// docs/10-TEST-PLAN.md §10.4 — integration against live APIs.
//
// Every check here runs the project's OWN data module against the real upstream, rather
// than re-fetching the URL by hand. That matters: a test that builds its own request can
// stay green while the app is broken, because the thing that rotted was the app's URL, its
// header, or its unpacking. What is asserted is the shape and liveness of the contract, never
// a specific number — the price moves, the expiry rolls, the headlines change.
//
//   npm run test:integration
//
// These are not run by `npm run verify` and must never be: they fail when Yahoo or NSE has a
// bad ten minutes, which says nothing about this repo. Run weekly, and after any Worker edit.
//
// When one fails, read it as "this upstream contract moved":
//   docs/06-API-SPEC.md         the endpoint, its auth handshake, and the dead ends
//   docs/12-MAINTENANCE-SUPPORT.md  the feeds ranked by fragility, with fallbacks
//
// The known-dead endpoints (option-chain-equities, api/quote-equity, Google News RSS,
// Yahoo v1/finance/search) are deliberately NOT retried here. CLAUDE.md says to re-test
// before declaring a source dead, and that is right — but that is an investigation, run by
// hand, not a gate that fails the suite every week for a thing already known to be gone.

import { describe, it, expect, beforeAll } from 'vitest';

import { WORKER_URL } from '../../src/data/proxy.js';
import { fetchHistory, fetchFundamentals, fetchAnnuals, val } from '../../src/data/yahoo.js';
import { fetchOptionChain, fetchIpos } from '../../src/data/nse.js';
import { fetchNews } from '../../src/data/news.js';

// RELIANCE is the probe for everything: it is the one symbol in the fixture set that is
// large cap, F&O-enabled and covered by every endpoint at once, so a single ticker exercises
// the price feed, the crumb, the NSE session and the option chain.
const PROBE = 'RELIANCE';
const PROBE_NS = 'RELIANCE.NS';

describe('live API integration (§10.4)', () => {
  // Distinguish "this machine has no network" from "a feed died". Without this the whole
  // file goes red on a train, and the next person learns to ignore it.
  beforeAll(async () => {
    let reachable = false;
    try {
      const res = await fetch(WORKER_URL + '/?url=' + encodeURIComponent(
        'https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1d'
      ), { cache: 'no-store' });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    if (!reachable) {
      throw new Error(
        'Cannot reach the Worker at ' + WORKER_URL + '.\n' +
        'Check this machine is online before reading anything below as a feed failure.\n' +
        'If the machine is online, the Worker itself is down — see docs/11 §failure playbook.'
      );
    }
  });

  it('price feed — chart returns a year of bars', async () => {
    const h = await fetchHistory(PROBE_NS, '1y', '1d');
    expect(h.closes.length).toBeGreaterThan(200);
    // Parallel arrays must stay aligned or every indicator silently reads off-by-one.
    expect(h.opens.length).toBe(h.closes.length);
    expect(h.highs.length).toBe(h.closes.length);
    expect(h.lows.length).toBe(h.closes.length);
    expect(h.volumes.length).toBe(h.closes.length);
    expect(h.dates.length).toBe(h.closes.length);
    expect(h.meta.currency).toBe('INR');
    expect(typeof h.meta.regularMarketPrice).toBe('number');
  });

  it('price feed — at range=1y Yahoo still omits meta.previousClose', async () => {
    // Not a nice-to-have. This absence is what produced the shipped bug where 1D% equalled
    // 1Y%: the code fell through to chartPreviousClose, a price a year old. resolvePrevClose
    // and its 25% guard exist solely because of it. If Yahoo ever starts sending
    // previousClose at this range, this test flips and the guard can be reconsidered —
    // which is exactly the signal worth catching.
    const h = await fetchHistory(PROBE_NS, '1y', '1d');
    expect(h.meta.previousClose).toBeUndefined();
    expect(h.meta.chartPreviousClose).toBeTypeOf('number');
  });

  it('crumb auth — quoteSummary returns fundamentals', async () => {
    // A 401 here means the Worker's Yahoo cookie+crumb handshake broke. That takes
    // fundamentals, the DCF and the factor block down together; price and technicals survive
    // because they are computed locally. See docs/06 §Yahoo crumb.
    const f = await fetchFundamentals(PROBE_NS);
    expect(f).toBeTruthy();
    expect(f.summaryDetail).toBeTruthy();
    expect(val(f.summaryDetail.trailingPE)).toBeTypeOf('number');
    expect(f.defaultKeyStatistics).toBeTruthy();
    expect(val(f.defaultKeyStatistics.sharesOutstanding)).toBeGreaterThan(0);
  });

  it('timeseries — annual cash flows have enough history for a DCF', async () => {
    // cashflowStatementHistory now returns only netIncome, which is why multi-year cash
    // flows come from fundamentals-timeseries instead. computeDcf needs at least three
    // OCF points to fit a growth rate.
    const a = await fetchAnnuals(PROBE_NS);
    expect(a.ocf.length).toBeGreaterThanOrEqual(3);
    expect(a.capex.length).toBeGreaterThanOrEqual(3);
    expect(a.ocf.every((p) => typeof p.v === 'number' && p.date)).toBe(true);
  });

  it('NSE session + option chain — contract info and v3 chain both resolve', async () => {
    // Covers §10.4's "NSE session" and "option chain" rows in one call, because that is how
    // the app does it: fetchOptionChain reads the expiry list first and feeds the first
    // expiry into option-chain-v3. The explicit expiry is mandatory — without it the
    // endpoint returns nothing, and option-chain-equities is dead whatever headers you send.
    const chain = await fetchOptionChain(PROBE);
    expect(chain, 'option chain came back empty — NSE session cookies likely expired').toBeTruthy();
    expect(chain.expiries.length).toBeGreaterThanOrEqual(1);
    expect(chain.expiry).toBe(chain.expiries[0]);
    expect(chain.data.length).toBeGreaterThan(0);
    expect(chain.underlying).toBeGreaterThan(0);
    // A chain with strikes but no CE/PE payloads is the failure that renders as a wall of
    // zeros rather than an honest "no contracts".
    expect(chain.data.some((row) => row.CE || row.PE)).toBe(true);
  });

  it('news — Bing RSS returns parseable headlines', async () => {
    // Google News returns 503 to Cloudflare IPs and Yahoo's search endpoint returns generic
    // US headlines; both are recorded dead ends. Bing RSS is the only one left standing.
    const items = await fetchNews('Reliance Industries');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title.length).toBeGreaterThan(0);
    expect(items[0].link).toMatch(/^https?:\/\//);
  });

  it('IPO feed — all-upcoming-issues parses', async () => {
    // An empty array is a legitimate answer: there are weeks with no upcoming issues. What
    // is asserted is that the endpoint still returns an array rather than NSE's HTML block
    // page, and that any row present still carries the fields the IPO block reads.
    const ipos = await fetchIpos();
    expect(Array.isArray(ipos)).toBe(true);
    if (ipos.length) {
      expect(ipos[0]).toBeTypeOf('object');
      expect(Object.keys(ipos[0]).length).toBeGreaterThan(0);
    }
  });

  it('worker allowlist — a non-allowlisted host is refused', async () => {
    // The Worker is an open relay to anyone who finds the URL, so the allowlist is the only
    // thing stopping it being used to proxy arbitrary traffic. docs/08 §Worker allowlist.
    const res = await fetch(
      WORKER_URL + '/?url=' + encodeURIComponent('https://example.com/'),
      { cache: 'no-store' }
    );
    expect(res.status).toBe(403);
  });

  it('worker allowlist — a plain-http target is refused', async () => {
    const res = await fetch(
      WORKER_URL + '/?url=' + encodeURIComponent('http://query1.finance.yahoo.com/'),
      { cache: 'no-store' }
    );
    expect(res.status).toBe(403);
  });

  it('worker — a missing url parameter is a 400, not a crash', async () => {
    const res = await fetch(WORKER_URL + '/', { cache: 'no-store' });
    expect(res.status).toBe(400);
  });
});
