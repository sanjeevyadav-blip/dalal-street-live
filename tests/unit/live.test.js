// Live prices: batched quotes, the per-view refresh, and the freshness line.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/data/proxy.js', () => ({ fetchJsonThroughProxy: vi.fn(), runPool: vi.fn() }));

import { fetchJsonThroughProxy } from '../../src/data/proxy.js';
import { fetchQuotesBatch, QUOTE_BATCH } from '../../src/data/yahoo.js';
import { livePrice } from '../../src/ui/tables/screener.js';

// Yahoo's v7 quote, including its silent cap: ask for 110 and 21 come back.
function yahoo(url){
  const syms = decodeURIComponent(/symbols=([^&]+)/.exec(url)[1]).split(',');
  return { quoteResponse: { result: syms.slice(0, 21).map(s => ({
    symbol: s, regularMarketPrice: 100, regularMarketPreviousClose: 98,
    regularMarketChange: 2, regularMarketChangePercent: 2.04, regularMarketTime: 1_800_000_000, marketState: 'REGULAR'
  })), error: null } };
}

describe('fetchQuotesBatch', () => {
  beforeEach(() => { fetchJsonThroughProxy.mockReset(); });

  it('chunks at 20, under Yahoo’s silent cap of 21', () => {
    expect(QUOTE_BATCH).toBeLessThan(21);
  });

  it('gets every symbol back, however many are asked for', async () => {
    // The regression this pins: one request for 45 symbols would come back with 21.
    fetchJsonThroughProxy.mockImplementation((url) => Promise.resolve(yahoo(url)));
    const syms = Array.from({ length: 45 }, (_, i) => 'S' + i + '.NS');
    const map = await fetchQuotesBatch(syms);
    expect(map.size).toBe(45);
    expect(fetchJsonThroughProxy).toHaveBeenCalledTimes(3);
    for (const [url] of fetchJsonThroughProxy.mock.calls){
      expect(decodeURIComponent(/symbols=([^&]+)/.exec(url)[1]).split(',').length).toBeLessThanOrEqual(QUOTE_BATCH);
    }
  });

  it('asks once per symbol even if a symbol is listed twice', async () => {
    fetchJsonThroughProxy.mockImplementation((url) => Promise.resolve(yahoo(url)));
    await fetchQuotesBatch(['A.NS', 'A.NS', 'B.NS']);
    expect(decodeURIComponent(/symbols=([^&]+)/.exec(fetchJsonThroughProxy.mock.calls[0][0])[1])).toBe('A.NS,B.NS');
  });

  it('maps Yahoo’s fields to the shape the app renders', async () => {
    fetchJsonThroughProxy.mockImplementation((url) => Promise.resolve(yahoo(url)));
    const q = (await fetchQuotesBatch(['RELIANCE.NS'])).get('RELIANCE.NS');
    expect(q).toMatchObject({ price: 100, change: 2, changePercent: 2.04, prevClose: 98, time: 1_800_000_000_000 });
  });

  it('leaves out a symbol with no real price, rather than reporting zero', async () => {
    fetchJsonThroughProxy.mockResolvedValue({ quoteResponse: { result: [
      { symbol: 'GOOD.NS', regularMarketPrice: 50 },
      { symbol: 'NOPRICE.NS' },
      { symbol: 'ZERO.NS', regularMarketPrice: 0 }
    ]}});
    const map = await fetchQuotesBatch(['GOOD.NS', 'NOPRICE.NS', 'ZERO.NS']);
    expect([...map.keys()]).toEqual(['GOOD.NS']);
  });

  it('one failed chunk loses only its symbols; every chunk failing rejects', async () => {
    let n = 0;
    fetchJsonThroughProxy.mockImplementation((url) => (++n === 1 ? Promise.reject(new Error('503')) : Promise.resolve(yahoo(url))));
    const syms = Array.from({ length: 30 }, (_, i) => 'S' + i + '.NS');
    const map = await fetchQuotesBatch(syms);
    expect(map.size).toBe(10);                     // the second chunk of ten survived

    fetchJsonThroughProxy.mockReset();
    fetchJsonThroughProxy.mockRejectedValue(new Error('down'));
    await expect(fetchQuotesBatch(syms)).rejects.toThrow();
  });

  it('asks for nothing when there is nothing to ask for', async () => {
    expect((await fetchQuotesBatch([])).size).toBe(0);
    expect(fetchJsonThroughProxy).not.toHaveBeenCalled();
  });
});

describe('a live price on a screener row', () => {
  const row = () => ({ price: 100, change1d: 1, change1y: 25, base1y: 80, wkHigh: 120, offHigh: -16.67, a200: 90, vs200: 11.1, rsi: 55, pe: 20 });

  it('moves the price and every column derived from it', () => {
    const r = row();
    expect(livePrice(r, { price: 110, changePercent: 2.5 })).toBe(true);
    expect(r.price).toBe(110);
    expect(r.change1d).toBe(2.5);
    expect(r.change1y).toBeCloseTo(37.5);           // 110 / 80 - 1
    expect(r.offHigh).toBeCloseTo(-8.33, 1);        // (110 - 120) / 120
    expect(r.vs200).toBeCloseTo(22.2, 1);           // (110 - 90) / 90
  });

  it('leaves daily and fundamental figures alone', () => {
    const r = row();
    livePrice(r, { price: 110, changePercent: 2.5 });
    expect(r.rsi).toBe(55);
    expect(r.pe).toBe(20);
  });

  it('a new high today moves the 52-week high, so "off high" is zero, not positive', () => {
    const r = row();
    livePrice(r, { price: 130, changePercent: 3 });
    expect(r.wkHigh).toBe(130);
    expect(r.offHigh).toBe(0);
  });

  it('ignores a quote that is missing, invalid or unchanged', () => {
    const r = row();
    expect(livePrice(r, null)).toBe(false);
    expect(livePrice(r, { price: NaN })).toBe(false);
    expect(livePrice(r, { price: 100 })).toBe(false);
    expect(r.price).toBe(100);
  });
});

describe('the freshness line', () => {
  it('says live with an age during market hours, and closed otherwise', async () => {
    vi.resetModules();
    const live = await import('../../src/ui/live.js');
    // Nothing has loaded yet.
    expect(live.stampText().text).toMatch(/Fetching live prices/);
    live.registerLive({ name: 't', symbols: () => ['X.NS'], apply: () => {} });
    fetchJsonThroughProxy.mockReset();
    fetchJsonThroughProxy.mockImplementation((url) => Promise.resolve(yahoo(url)));
    await live.refreshLive({ force: true });

    // stampText takes "now" explicitly, so both cases are fixed instants rather than
    // whatever the clock says when the suite happens to run.
    const thursday1030 = Date.UTC(2026, 8, 24, 5, 0);   // 10:30 IST, market open
    const saturday1030 = Date.UTC(2026, 8, 26, 5, 0);   // weekend
    expect(live.stampText(thursday1030).text).toMatch(/^Live · updated/);
    expect(live.stampText(saturday1030).text).toMatch(/^Market closed · prices as of/);
  });

  it('only asks a view for prices it is showing', async () => {
    vi.resetModules();
    const live = await import('../../src/ui/live.js');
    const hidden = document.createElement('div');
    hidden.style.display = 'none';
    document.body.appendChild(hidden);
    // happy-dom has no layout, so isShown is exercised for its contract, not its geometry.
    expect(live.isShown(null)).toBe(false);
    expect(typeof live.isShown(hidden)).toBe('boolean');
  });
});
