// Stock page sub-tabs: which block lands on which tab.

import { describe, it, expect, beforeEach } from 'vitest';
import { classifyChildren, DETAIL_TABS } from '../../src/ui/detail-tabs.js';

// A cut-down card in the real order detail.js and app.js produce.
function card(){
  const el = document.createElement('div');
  el.id = 'detailCard';
  el.innerHTML = `
    <div class="detail-head"></div>
    <div class="price-hero"></div>
    <div class="range-bars"></div>
    <div class="stat-row"></div>
    <div id="snapBlock"></div>
    <div class="chart-block"></div>
    <div class="section-label"><span>Technicals</span></div>
    <div class="metric-grid" id="techGrid"></div>
    <div class="section-label"><span>Risk &amp; momentum</span></div>
    <div class="metric-grid" id="riskGrid"></div>
    <div class="section-label"><span>Peer comparison</span></div>
    <div id="peerBlock"></div>
    <div class="section-label"><span>Recent news</span></div>
    <div id="newsBlock"></div>
    <div class="section-label"><span>Fundamentals</span></div>
    <div id="fundamentalsGrid"></div>
    <div class="section-label"><span>Company profile</span></div>
    <div id="profileBlock"></div>
    <div id="deepBlock">
      <div class="section-label"><span>Price action</span></div><div id="paGrid"></div>
      <div class="section-label"><span>Intrinsic value (DCF)</span></div><div id="dcfBlock"></div>
      <div class="section-label"><span>Earnings quality</span></div><div id="eqBlock"></div>
    </div>
    <div id="optBlock"></div>
    <div id="thesisBlock"></div>
    <div id="labBlock"></div>`;
  document.body.appendChild(el);
  return el;
}
const tabOf = (id) => document.getElementById(id).getAttribute('data-dtab');

describe('classifying the detail card', () => {
  let c;
  beforeEach(() => { document.body.innerHTML = ''; c = card(); classifyChildren(c); });

  it('keeps the name and price on every tab', () => {
    expect(c.querySelector('.detail-head').hasAttribute('data-dtab')).toBe(false);
    expect(c.querySelector('.price-hero').hasAttribute('data-dtab')).toBe(false);
  });

  it('puts the chart on Overview, where a hidden tab cannot leave it zero-width', () => {
    expect(c.querySelector('.chart-block').getAttribute('data-dtab')).toBe('overview');
    expect(tabOf('snapBlock')).toBe('overview');
    expect(tabOf('profileBlock')).toBe('overview');
  });

  it('a block with no id inherits the label above it', () => {
    expect(tabOf('techGrid')).toBe('technicals');
    expect(tabOf('riskGrid')).toBe('technicals');
  });

  it('routes each named block to its tab', () => {
    expect(tabOf('peerBlock')).toBe('financials');
    expect(tabOf('fundamentalsGrid')).toBe('financials');
    expect(tabOf('newsBlock')).toBe('news');
    expect(tabOf('optBlock')).toBe('options');
    expect(tabOf('thesisBlock')).toBe('valuation');
    expect(tabOf('labBlock')).toBe('valuation');
  });

  it('splits #deepBlock by section, since it mixes three tabs', () => {
    expect(document.getElementById('deepBlock').hasAttribute('data-dtab')).toBe(false);
    expect(tabOf('paGrid')).toBe('technicals');
    expect(tabOf('dcfBlock')).toBe('valuation');
    expect(tabOf('eqBlock')).toBe('financials');
  });

  it('every tab it assigns is a real tab', () => {
    const used = new Set([...c.querySelectorAll('[data-dtab]')].map(e => e.getAttribute('data-dtab')));
    for (const t of used) expect(DETAIL_TABS).toContain(t);
  });

  it('an unknown block is never hidden from every tab', () => {
    // A block added to the card later, that this file has never heard of, must still be
    // reachable. It inherits the tab above it rather than getting no tab or an invalid one.
    const mystery = document.createElement('div');
    mystery.id = 'someFutureBlock';
    c.appendChild(mystery);
    classifyChildren(c);
    expect(DETAIL_TABS).toContain(tabOf('someFutureBlock'));
  });

  it('labels match by prefix, so a glossary marker does not break the mapping', () => {
    c.querySelector('.section-label').innerHTML = '<span>Technicals</span><span class="gloss">i</span>';
    classifyChildren(c);
    expect(tabOf('techGrid')).toBe('technicals');
  });
});
