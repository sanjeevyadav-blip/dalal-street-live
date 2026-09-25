// Shareholding pattern and promoter pledge, from NSE.

import { describe, it, expect } from 'vitest';
import { parseNseDate, shareholdingQuarters, pledgeSummary } from '../../src/data/nse.js';
import { shareholdingHtml } from '../../src/ui/shareholding.js';

const filing = (date, promoter, pub) => ({ date, pr_and_prgrp: String(promoter), public_val: String(pub) });

describe('parseNseDate', () => {
  it('reads both of NSE’s month casings', () => {
    expect(parseNseDate('30-JUN-2026').toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(parseNseDate('30-Jun-2026').toISOString().slice(0, 10)).toBe('2026-06-30');
  });
  it('returns null for anything else', () => {
    expect(parseNseDate('')).toBeNull();
    expect(parseNseDate('2026-06-30')).toBeNull();
    expect(parseNseDate('30-XYZ-2026')).toBeNull();
  });
});

describe('shareholdingQuarters', () => {
  const rows = [
    filing('30-JUN-2026', 50.48, 49.52),
    filing('31-MAR-2026', 50, 50),
    filing('31-DEC-2024', 50.13, 49.87),
    filing('29-OCT-2024', 50.24, 49.76),   // off-cycle, same quarter as Dec 2024
    filing('30-SEP-2024', 50.24, 49.76)
  ];

  it('keeps one filing per calendar quarter, the latest in it', () => {
    // An off-cycle filing next to the quarter-end one would read as a quarter-on-quarter
    // move that was really one event.
    const q = shareholdingQuarters(rows);
    expect(q.map(r => r.date.toISOString().slice(0, 7))).toEqual(['2026-06', '2026-03', '2024-12', '2024-09']);
  });

  it('is newest first, with the change against the quarter before it', () => {
    const q = shareholdingQuarters(rows);
    expect(q[0].promoter).toBe(50.48);
    expect(q[0].change).toBe(0.48);
    expect(q.at(-1).change).toBeNull();   // nothing older to compare with
  });

  it('drops a filing with no promoter figure rather than showing 0%', () => {
    const q = shareholdingQuarters([filing('30-JUN-2026', '', 49), filing('31-MAR-2026', 50, 50)]);
    expect(q.length).toBe(1);
    expect(q[0].promoter).toBe(50);
  });

  it('respects the limit', () => {
    expect(shareholdingQuarters(rows, 2).length).toBe(2);
  });
});

describe('pledgeSummary', () => {
  // RELIANCE's real disclosure, June 2026.
  const reliance = { shp:'30-Jun-2026', numSharesPledged:'182078802', totPromoterHolding:'6944962964',
    totIssuedShares:'13532538722', percSharesPledged:'1.35' };

  it('computes the share of the PROMOTER’s stake from raw counts', () => {
    // NSE’s percSharesPledged (1.35) is over total shares, not the promoter’s stake.
    // Over the promoter holding it is 2.6%, which is the figure investors mean.
    const p = pledgeSummary(reliance);
    expect(p.ofPromoter).toBeCloseTo(2.62, 1);
    expect(p.ofCompany).toBeCloseTo(1.35, 1);
    expect(p.sharesPledged).toBe(182078802);
  });

  it('returns null when there is nothing to summarise', () => {
    expect(pledgeSummary(null)).toBeNull();
    expect(pledgeSummary({ shp:'30-Jun-2026' })).toBeNull();
  });
});

describe('shareholdingHtml', () => {
  const q = shareholdingQuarters([filing('30-JUN-2026', 50.48, 49.52), filing('31-MAR-2026', 50, 50)]);

  it('says "None" for a zero pledge rather than 0%', () => {
    const html = shareholdingHtml(q, { sharesPledged:0, ofPromoter:0, ofCompany:0, asOf:parseNseDate('30-Jun-2026') });
    expect(html).toContain('None');
  });

  it('shows a dash, not a number, when the pledge disclosure is missing', () => {
    const doc = new DOMParser().parseFromString(shareholdingHtml(q, null), 'text/html');
    const card = [...doc.querySelectorAll('.metric')].find(m => /pledged/i.test(m.textContent));
    expect(card.querySelector('.v').textContent).toBe('—');
  });

  it('says plainly that the FII / DII split is not shown', () => {
    expect(shareholdingHtml(q, null)).toMatch(/foreign and domestic institutions/);
  });

  it('warns about the misreadings, not just the numbers (hard rule 5)', () => {
    const html = shareholdingHtml(q, null);
    expect(html).toMatch(/buyback/);
    expect(html).toMatch(/lenders can sell/);
  });

  it('handles a company with no filings', () => {
    expect(shareholdingHtml([], null)).toMatch(/no shareholding filings/);
  });
});
