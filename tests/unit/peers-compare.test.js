// Peers from Yahoo's "viewed alongside" list, and the two-stock compare table.

import { describe, it, expect } from 'vitest';
import { comparableRows, median, peersFor } from '../../src/ui/peers.js';
import { compareTableHtml, COMPARE_METRIC_LABELS } from '../../src/ui/compare.js';

describe('which peers count for the median', () => {
  const rows = [
    { t:'ZYDUSLIFE', isSelf:true,  industry:'Drug Manufacturers', pe:27 },
    { t:'TORNTPHARM', isSelf:false, industry:'Drug Manufacturers', pe:60 },
    { t:'ALKEM',     isSelf:false, industry:'Drug Manufacturers', pe:30 },
    { t:'MOTHERSON', isSelf:false, industry:'Auto Parts',         pe:25 },
    { t:'UNKNOWNCO', isSelf:false, industry:null,                 pe:10 }
  ];

  it('for a Yahoo list, only same-industry rows count', () => {
    // Setting a pharma company's P/E against an auto-parts median would be a comparison
    // that means nothing. The "viewed alongside" list mixes both.
    const peers = comparableRows(rows, 'yahoo').map(r => r.t);
    expect(peers).toEqual(['TORNTPHARM', 'ALKEM']);
  });

  it('a row with no industry is not assumed to match', () => {
    expect(comparableRows(rows, 'yahoo').map(r => r.t)).not.toContain('UNKNOWNCO');
  });

  it('if the selected stock’s own industry is unknown, nothing counts', () => {
    const blind = rows.map(r => r.isSelf ? { ...r, industry:null } : r);
    expect(comparableRows(blind, 'yahoo')).toEqual([]);
  });

  it('a curated group counts every member, since they are peers by construction', () => {
    expect(comparableRows(rows, 'curated').length).toBe(4);
  });

  it('never includes the selected stock in its own peer set', () => {
    for (const src of ['yahoo', 'curated']){
      expect(comparableRows(rows, src).some(r => r.isSelf)).toBe(false);
    }
  });

  it('median ignores missing values', () => {
    expect(median([{ pe:10 }, { pe:null }, { pe:30 }], 'pe')).toBe(20);
    expect(median([{ pe:null }], 'pe')).toBeNull();
    expect(median([{ pe:5 }, { pe:7 }, { pe:9 }], 'pe')).toBe(7);
  });

  it('curated groups still resolve for the stocks they cover', () => {
    const g = peersFor('TCS.NS');
    expect(g.source).toBe('curated');
    expect(g.peers).not.toContain('TCS');
  });

  it('an unmapped stock has no curated group, so the Yahoo fallback runs', () => {
    expect(peersFor('ZYDUSLIFE.NS')).toBeNull();
  });
});

describe('the compare table', () => {
  const a = { symbol:'ZYDUSLIFE.NS', name:'Zydus Lifesciences', price:1198.4, chg1d:1.5, chg1y:17.6,
    mcap:1.2e12, pe:26.7, pb:4.4, roe:0.18, margin:0.2, revGrowth:0.12, epsGrowth:null, de:5, divY:0.003, beta:0.6, rsi:55 };
  const b = { symbol:'POLYCAB.NS', name:'Polycab <India>', price:8394, chg1d:-0.3, chg1y:13.3,
    mcap:1.26e12, pe:44.6, pb:10.4, roe:0.22, margin:0.1, revGrowth:0.3, epsGrowth:0.25, de:null, divY:0.004, beta:1.1, rsi:62 };
  const html = compareTableHtml(a, b);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  it('has one row per metric and both companies as columns', () => {
    expect(doc.querySelectorAll('tbody tr').length).toBe(COMPARE_METRIC_LABELS.length);
    const heads = [...doc.querySelectorAll('thead th')].map(th => th.childNodes[0].textContent);
    expect(heads).toEqual(['Metric', 'ZYDUSLIFE', 'POLYCAB']);
  });

  it('shows a dash for a missing value, never a zero', () => {
    const row = [...doc.querySelectorAll('tbody tr')].find(tr => tr.querySelector('.k').textContent === 'Earnings growth YoY');
    expect(row.children[1].textContent).toBe('—');
    const de = [...doc.querySelectorAll('tbody tr')].find(tr => tr.querySelector('.k').textContent === 'Debt / equity');
    expect(de.children[2].textContent).toBe('—');
  });

  it('marks no column as better (hard rule 1)', () => {
    // Direction colouring on returns is a fact about sign. Anything beyond that — a winner
    // column, a tick, a "better" class — would be a verdict.
    expect(html).not.toMatch(/better|winner|✓|recommend/i);
    const pe = [...doc.querySelectorAll('tbody tr')].find(tr => tr.querySelector('.k').textContent === 'P/E (trailing)');
    for (const td of [...pe.children].slice(1)) expect(td.className).not.toMatch(/up|down/);
  });

  it('colours only directional metrics, by sign', () => {
    const d1 = [...doc.querySelectorAll('tbody tr')].find(tr => tr.querySelector('.k').textContent === '1-day change');
    expect(d1.children[1].className).toContain('up');
    expect(d1.children[2].className).toContain('down');
  });

  it('escapes company names', () => {
    expect(html).not.toContain('<India>');
    expect(html).toContain('&lt;India&gt;');
  });
});
