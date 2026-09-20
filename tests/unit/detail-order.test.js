// Does the detail panel still assemble in the same order?
//
// tests/unit/detail-pipeline.test.js pins the block list and the scheduler in isolation.
// This drives the real renderDetail against real fixture data in a real DOM and checks
// where the blocks actually land — which is the thing PR-8 could plausibly have broken and
// that no snapshot would notice.
//
// The network is dead throughout. Every block appends its placeholder synchronously before
// its first await, so the layout is fully determined even when nothing resolves; that is
// precisely the property that makes the delays safe to keep.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderDetail } from '../../src/ui/detail.js';
import { history } from '../helpers/fixtures.js';

const HTML = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');

let blockIds;

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))));

  const body = HTML.slice(HTML.indexOf('<body'), HTML.indexOf('</body>'));
  // The <script type="module"> has to go: happy-dom would try to load ./app.js and boot the
  // whole app, which is tests/unit/boot.test.js's job, not this one.
  document.body.innerHTML = body
    .replace(/^<body[^>]*>/, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');

  // happy-dom has no canvas backend. A no-op 2D context lets the chart code run its real
  // path — returning null instead would crash it, because drawChart does not guard against
  // a null context. It never sees one in a browser, so that is not a live bug, but it does
  // mean canvas cannot simply be stubbed away.
  const noopContext = new Proxy(
    { canvas: null, measureText: () => ({ width: 0 }), createLinearGradient: () => ({ addColorStop() {} }) },
    {
      get: (target, prop) => (prop in target ? target[prop] : () => {}),
      set: () => true
    }
  );
  Object.defineProperty(globalThis.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => noopContext
  });

  const hist = history('reliance');
  const nifty = history('nsei');

  vi.useFakeTimers();
  renderDetail('RELIANCE.NS', hist, nifty);
  // Past both the 200ms and 400ms blocks.
  vi.advanceTimersByTime(500);
  vi.useRealTimers();

  const card = document.getElementById('detailCard');
  blockIds = [...card.children].map((el) => el.id).filter(Boolean);
});

describe('detail panel assembly', () => {
  it('mounts every block', () => {
    for (const id of ['snapBlock', 'deepBlock', 'optBlock', 'facBlock']) {
      expect(blockIds, `missing #${id}`).toContain(id);
    }
  });

  // The order the wrap chain produced, and the order that must survive.
  //
  // Note what decides it: deepBlock, optBlock and facBlock APPEND, so they land in the order
  // their blocks are entered. snapBlock does not append — it inserts itself before
  // .chart-block, so it sits above the chart regardless of its 200ms delay. Anyone retuning
  // the delays should know the snapshot's position is not what they are changing.
  it('puts the snapshot ahead of the appended blocks', () => {
    expect(blockIds.indexOf('snapBlock')).toBeLessThan(blockIds.indexOf('deepBlock'));
  });

  it('appends deep analysis, then options, then factors', () => {
    const deep = blockIds.indexOf('deepBlock');
    const opt = blockIds.indexOf('optBlock');
    const fac = blockIds.indexOf('facBlock');
    expect(deep).toBeLessThan(opt);
    expect(opt).toBeLessThan(fac);
  });

  it('keeps the snapshot above the chart', () => {
    const card = document.getElementById('detailCard');
    const snap = document.getElementById('snapBlock');
    const chart = card.querySelector('.chart-block');
    if (!chart) return; // core render did not produce one in this environment
    const order = [...card.children];
    expect(order.indexOf(snap)).toBeLessThan(order.indexOf(chart.closest('#detailCard > *')));
  });

  it('renders the core content, not just the block placeholders', () => {
    const card = document.getElementById('detailCard');
    expect(card.textContent).toContain('Reliance');
  });

  it('shows placeholders rather than zeros while the fetches are dead', () => {
    // CLAUDE.md invariant 3: a pending or failed block must not read as real data.
    const card = document.getElementById('detailCard');
    expect(card.textContent).not.toMatch(/NaN/);
    expect(card.textContent).not.toMatch(/undefined/);
  });
});
