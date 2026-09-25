// Stock search — the full NSE list locally, Yahoo live as a fallback.
//
// Suggestions used to know 109 companies. These pin the cases that motivated the change and
// the ranking rules that stop 2,600 names from burying the right answer.

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../src/data/proxy.js', () => ({ fetchJsonThroughProxy: vi.fn() }));

import { fetchJsonThroughProxy } from '../../src/data/proxy.js';
import { searchIndex, localMatches, remoteMatches, mergeRemote } from '../../src/data/search.js';
import { nseEquities, nseEquitiesAsOf, setNseEquities, loadNseEquities } from '../../src/data/nse-equities.js';

const LIST = JSON.parse(readFileSync(resolve(process.cwd(), 'src/public/nse-equities.json'), 'utf8'));
const syms = (rows) => rows.map(r => r.sym);

describe('before the full list has loaded', () => {
  it('search still works from the curated directory', () => {
    // The list is fetched on first focus. Until then — and if it never arrives — the
    // well-known names must still be findable.
    expect(nseEquities()).toEqual([]);
    expect(syms(localMatches('reli'))[0]).toBe('RELIANCE');
    expect(searchIndex().length).toBeLessThan(200);
  });
});

describe('the local index', () => {
  beforeAll(() => { setNseEquities(LIST); });

  it('covers every NSE mainboard company, not a curated hundred', () => {
    expect(nseEquities().length).toBeGreaterThan(2000);
    // Rebuilt once the list arrives, not stuck on the curated-only index built above.
    expect(searchIndex().length).toBeGreaterThan(2000);
  });

  it('records when the list was generated, so staleness is visible', () => {
    expect(nseEquitiesAsOf()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LIST.count).toBe(nseEquities().length);
  });

  it('has no duplicate symbols after merging the curated directory in', () => {
    const all = syms(searchIndex());
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps the curated name over NSE’s official one', () => {
    // "Tata Consultancy Services" is what people type; the curated directory exists to say so.
    const tcs = searchIndex().find(r => r.sym === 'TCS');
    expect(tcs.name).toBe('Tata Consultancy Services');
  });
});

describe('the two examples from the analysis', () => {
  it('"zyd" finds the Zydus companies', () => {
    expect(syms(localMatches('zyd'))).toEqual(expect.arrayContaining(['ZYDUSLIFE', 'ZYDUSWELL']));
  });

  it('"polyc" finds Polycab', () => {
    expect(syms(localMatches('polyc'))[0]).toBe('POLYCAB');
  });
});

describe('ranking', () => {
  it('an exact ticker beats a longer one that starts with it', () => {
    // Two-letter tickers are real — L&T is LT — and must not drown under every "LT..." name.
    expect(syms(localMatches('lt'))[0]).toBe('LT');
  });

  it('a later word of the name outranks a name that merely contains the letters', () => {
    const top = localMatches('motors', 10);
    const firstWordHit = top.findIndex(r => / motors/i.test(r.name));
    const firstInnerHit = top.findIndex(r => !/(^| )motors/i.test(r.name) && /motors/i.test(r.name));
    expect(firstWordHit).toBeGreaterThanOrEqual(0);
    if (firstInnerHit >= 0) expect(firstWordHit).toBeLessThan(firstInnerHit);
  });

  it('a well-known name beats an obscure one that sorts earlier', () => {
    // The regression the E2E suite caught: with 2,600 names and an alphabetical
    // tie-break, "reli" suggested RELIABLE, a microcap, above RELIANCE.
    expect(syms(localMatches('reli'))[0]).toBe('RELIANCE');
  });

  it('returns nothing for one character, and respects the limit', () => {
    expect(localMatches('a')).toEqual([]);
    expect(localMatches('in', 5).length).toBe(5);
  });

  it('local results are NSE listings', () => {
    expect(localMatches('reli').every(r => r.exch === 'NS')).toBe(true);
  });
});

describe('loading the list', () => {
  it('shares one request between concurrent callers, and retries after a failure', async () => {
    // A fresh module instance, so the already-installed list above does not short-circuit.
    vi.resetModules();
    const mod = await import('../../src/data/nse-equities.js');
    let calls = 0;
    const failing = () => { calls++; return Promise.resolve({ ok:false, status:503 }); };
    await expect(Promise.all([mod.loadNseEquities(failing), mod.loadNseEquities(failing)])).rejects.toThrow('503');
    expect(calls).toBe(1);
    const ok = () => { calls++; return Promise.resolve({ ok:true, json: () => Promise.resolve(LIST) }); };
    const list = await mod.loadNseEquities(ok);
    expect(list.length).toBeGreaterThan(2000);
    expect(calls).toBe(2);
  });

  it('is unaffected in this module instance', () => {
    expect(typeof loadNseEquities).toBe('function');
  });
});

describe('live fallback', () => {
  // Braces, not an expression body: mockReset() returns the mock, which is a function, and
  // Vitest runs a function returned from beforeEach as a teardown — it would CALL the
  // rejecting mock after each test and report its rejection as that test's failure.
  beforeEach(() => { fetchJsonThroughProxy.mockReset(); });

  it('keeps only Indian equity listings from Yahoo’s global results', async () => {
    fetchJsonThroughProxy.mockResolvedValue({ quotes: [
      { symbol: 'ZYDUSLIFE.NS', longname: 'Zydus Lifesciences', quoteType: 'EQUITY' },
      { symbol: 'ZYDUSLIFE.BO', longname: 'Zydus Lifesciences', quoteType: 'EQUITY' },
      { symbol: 'ZYD.SG', shortname: 'Aspo Oyj', quoteType: 'EQUITY' },
      { symbol: 'NIFTYBEES.NS', shortname: 'Nippon ETF', quoteType: 'ETF' }
    ]});
    const out = await remoteMatches('zyd');
    expect(out.map(r => r.sym + '.' + r.exch)).toEqual(['ZYDUSLIFE.NS', 'ZYDUSLIFE.BO']);
    expect(out.every(r => r.remote)).toBe(true);
  });

  it('resolves to an empty list on failure rather than rejecting', async () => {
    // A dead fallback must leave the local suggestions on screen, not replace them.
    fetchJsonThroughProxy.mockRejectedValue(new Error('proxy down'));
    await expect(remoteMatches('zyd')).resolves.toEqual([]);
  });

  it('does not query for under three characters', async () => {
    await remoteMatches('zy');
    expect(fetchJsonThroughProxy).not.toHaveBeenCalled();
  });

  it('merging drops listings already shown, and BSE twins of an NSE result', () => {
    const local = [{ sym: 'ZYDUSLIFE', exch: 'NS' }];
    const remote = [
      { sym: 'ZYDUSLIFE', exch: 'NS' },    // already shown
      { sym: 'ZYDUSLIFE', exch: 'BO' },    // same company, other exchange — noise
      { sym: 'BSEONLYCO', exch: 'BO' }     // BSE-only: the reason the fallback exists
    ];
    expect(mergeRemote(local, remote).map(r => r.sym + '.' + r.exch)).toEqual(['BSEONLYCO.BO']);
  });
});
