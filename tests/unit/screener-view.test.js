// Screener sort and filter.
//
// The rule these exist to hold: a missing value is never read as a number. A loss-making
// company has no P/E, and it must neither sort as the cheapest stock nor pass "P/E under 15".

import { describe, it, expect, beforeEach } from 'vitest';
import { sortRows, filterRows, loadView, SCREENER_COLUMNS, SCREENER_FILTERS } from '../../src/ui/tables/screener.js';

const rows = [
  { ticker:'AAA', pe:30,   roe:12, de:20  },
  { ticker:'BBB', pe:null, roe:null, de:null },  // loss-maker: no P/E, no ROE
  { ticker:'CCC', pe:12,   roe:22, de:80  },
  { ticker:'DDD', pe:18,   roe:9,  de:null },    // a bank: no debt/equity
  { ticker:'EEE', pe:12,   roe:15, de:10  }
];
const t = (rs) => rs.map(r => r.ticker);

describe('sorting', () => {
  it('sorts ascending and descending', () => {
    expect(t(sortRows(rows, { field:'pe', dir:1 }))).toEqual(['CCC', 'EEE', 'DDD', 'AAA', 'BBB']);
    expect(t(sortRows(rows, { field:'pe', dir:-1 })).slice(0, 4)).toEqual(['AAA', 'DDD', 'CCC', 'EEE']);
  });

  it('puts a missing value LAST in both directions', () => {
    // Ascending P/E is "cheapest first". A blank must not be the cheapest.
    expect(t(sortRows(rows, { field:'pe', dir:1 })).at(-1)).toBe('BBB');
    expect(t(sortRows(rows, { field:'pe', dir:-1 })).at(-1)).toBe('BBB');
  });

  it('is stable: equal values keep their original order', () => {
    // CCC and EEE both have P/E 12; CCC came first in the input.
    const asc = t(sortRows(rows, { field:'pe', dir:1 }));
    expect(asc.indexOf('CCC')).toBeLessThan(asc.indexOf('EEE'));
  });

  it('sorts the symbol column as text', () => {
    expect(t(sortRows(rows, { field:'ticker', dir:-1 }))).toEqual(['EEE', 'DDD', 'CCC', 'BBB', 'AAA']);
  });

  it('with no sort, returns the load order unchanged and does not mutate the input', () => {
    const before = t(rows);
    expect(t(sortRows(rows, null))).toEqual(before);
    sortRows(rows, { field:'pe', dir:1 });
    expect(t(rows)).toEqual(before);
  });
});

describe('filtering', () => {
  it('applies max and min limits', () => {
    const { kept } = filterRows(rows, { pe:15, roe:null, de:null });
    expect(t(kept)).toEqual(['CCC', 'EEE']);
    const { kept: roe } = filterRows(rows, { pe:null, roe:15, de:null });
    expect(t(roe)).toEqual(['CCC', 'EEE']);
  });

  it('a missing value FAILS the filter, and is counted', () => {
    const { kept, missing } = filterRows(rows, { pe:40, roe:null, de:null });
    expect(t(kept)).not.toContain('BBB');
    expect(missing.pe).toBe(1);
  });

  it('counts missing data per filter, so the summary can say why rows vanished', () => {
    const { missing } = filterRows(rows, { pe:null, roe:null, de:100 });
    expect(missing.de).toBe(2);   // BBB and the bank DDD
  });

  it('combines filters with AND', () => {
    const { kept } = filterRows(rows, { pe:25, roe:15, de:50 });
    expect(t(kept)).toEqual(['EEE']);
  });

  it('no active filter keeps everything', () => {
    expect(filterRows(rows, { pe:null, roe:null, de:null }).kept.length).toBe(rows.length);
  });
});

describe('the saved view', () => {
  beforeEach(() => { localStorage.clear(); });

  it('defaults to no sort and no filters', () => {
    expect(loadView()).toEqual({ sort:null, filters:{ pe:null, roe:null, de:null } });
  });

  it('restores a saved sort and filters', () => {
    localStorage.setItem('dsl.screener.view.v1', JSON.stringify({ sort:{ field:'roe', dir:-1 }, filters:{ pe:25, roe:null, de:50 } }));
    expect(loadView()).toEqual({ sort:{ field:'roe', dir:-1 }, filters:{ pe:25, roe:null, de:50 } });
  });

  it('discards anything it does not recognise rather than trusting storage', () => {
    // Storage outlives code: a column renamed next year must not become a sort on a field
    // that no longer exists, and a hand-edited limit must not become a filter nobody offered.
    localStorage.setItem('dsl.screener.view.v1', JSON.stringify({ sort:{ field:'gone', dir:5 }, filters:{ pe:999, roe:'x' } }));
    expect(loadView()).toEqual({ sort:null, filters:{ pe:null, roe:null, de:null } });
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('dsl.screener.view.v1', '{not json');
    expect(loadView().sort).toBeNull();
  });
});

describe('column map', () => {
  it('has thirteen columns, one per screener heading', () => {
    expect(SCREENER_COLUMNS.length).toBe(13);
    expect(SCREENER_FILTERS.map(f => f.id)).toEqual(['pe', 'roe', 'de']);
  });
});
