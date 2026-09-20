// EPIC-4 reliability hardening — stories E4-2, E4-3 and E4-4.
//
// These three are tested together because they are one path: a feed fails, the proxy decides
// whether it is worth asking again (E4-3), the failure is recorded in a form someone can read
// later (E4-4), and the block that wanted the data renders its own failure instead of taking
// the page with it (E4-2).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { fetchJsonThroughProxy, isTransient } from '../../src/data/proxy.js';
import {
  recordFailure, getFailures, clearFailures, failureCount,
  formatFailures, isEnabled, setEnabled, onFailure
} from '../../src/diagnostics.js';
import { renderBlockError, runBlocks } from '../../src/ui/detail.js';

beforeEach(() => {
  clearFailures();
  onFailure(null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Responses shaped enough for fetchThroughProxy: ok, status, and a json() reader.
const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => String(body) });
const bad = (status) => ({ ok: false, status, json: async () => ({}), text: async () => '' });

const noSleep = () => Promise.resolve();

describe('E4-3 — retry with backoff in the proxy layer', () => {
  it('classifies only ask-again statuses as transient', () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isTransient(s), s + ' should be transient').toBe(true);
    }
    for (const s of [400, 401, 403, 404, 410, 422]) {
      expect(isTransient(s), s + ' should not be transient').toBe(false);
    }
  });

  it('recovers from a transient 5xx on the retry', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return calls === 1 ? bad(503) : ok({ recovered: true });
    });

    const out = await fetchJsonThroughProxy('https://query1.finance.yahoo.com/x', {
      fetchImpl, sleepImpl: noSleep
    });

    expect(out).toEqual({ recovered: true });
    expect(calls).toBe(2);
  });

  it("retries the Worker's own 502, which is what a failed upstream fetch looks like", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => (++calls === 1 ? bad(502) : ok({ ok: 1 })));
    await expect(fetchJsonThroughProxy('https://www.nseindia.com/api/x', {
      fetchImpl, sleepImpl: noSleep
    })).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(2);
  });

  it('does not retry a permanent status — it moves to the next proxy instead', async () => {
    // 403 is the Worker refusing a non-allowlisted host. Asking again wastes the budget.
    const seen = [];
    const fetchImpl = vi.fn(async (url) => { seen.push(url); return bad(403); });

    await expect(fetchJsonThroughProxy('https://example.com/', {
      fetchImpl, sleepImpl: noSleep
    })).rejects.toThrow('HTTP 403');

    // Three proxies, one attempt each — not two attempts each.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(new Set(seen).size).toBe(3);
  });

  it('gives up once the wall-clock budget is gone rather than hanging', async () => {
    const fetchImpl = vi.fn(async () => bad(503));
    await expect(fetchJsonThroughProxy('https://query1.finance.yahoo.com/x', {
      fetchImpl, sleepImpl: noSleep, budgetMs: 0
    })).rejects.toBeTruthy();
    // Budget already spent on entry: nothing should have been attempted.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries a thrown network error, not just an HTTP status', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      if (++calls === 1) throw new Error('Failed to fetch');
      return ok({ second: true });
    });
    await expect(fetchJsonThroughProxy('https://query1.finance.yahoo.com/x', {
      fetchImpl, sleepImpl: noSleep
    })).resolves.toEqual({ second: true });
    expect(calls).toBe(2);
  });

  it('backs off between attempts, and the delay grows', async () => {
    const delays = [];
    const fetchImpl = vi.fn(async () => bad(503));
    await expect(fetchJsonThroughProxy('https://query1.finance.yahoo.com/x', {
      fetchImpl,
      sleepImpl: async (ms) => { delays.push(ms); },
      attemptsPerProxy: 3,
      baseDelayMs: 100
    })).rejects.toBeTruthy();

    // Two retries per proxy, three proxies.
    expect(delays.length).toBe(6);
    expect(delays.slice(0, 2)).toEqual([100, 200]);
  });

  it('records the failure with the host only — never the full URL', async () => {
    const fetchImpl = vi.fn(async () => bad(500));
    await expect(fetchJsonThroughProxy(
      'https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1y',
      { fetchImpl, sleepImpl: noSleep }
    )).rejects.toBeTruthy();

    const logged = getFailures().filter((f) => f.context === 'proxy');
    expect(logged.length).toBe(1);
    expect(logged[0].meta.host).toBe('query1.finance.yahoo.com');
    // The query string carries the symbol someone looked up. It must not be in the log.
    expect(JSON.stringify(logged[0])).not.toContain('RELIANCE');
    expect(JSON.stringify(logged[0])).not.toContain('interval');
  });
});

describe('E4-4 — structured failure log', () => {
  it('records context, message and timestamp', () => {
    const r = recordFailure('factors: history fetch', new Error('timeout'));
    expect(r.context).toBe('factors: history fetch');
    expect(r.message).toBe('timeout');
    expect(Date.parse(r.at)).not.toBeNaN();
    expect(failureCount()).toBe(1);
  });

  it('accepts a thrown non-Error without losing the record', () => {
    expect(recordFailure('x', 'a bare string').message).toBe('a bare string');
    expect(recordFailure('y', null).message).toBe('unknown error');
    expect(recordFailure('z', { message: 'objecty' }).message).toBe('objecty');
  });

  it('keeps scalar metadata and drops everything else', () => {
    const r = recordFailure('proxy', new Error('boom'), {
      host: 'query1.finance.yahoo.com',
      status: 503,
      retried: true,
      // None of these may survive: a response body or a fixture could ride in on them.
      response: { chart: { result: [{ meta: { symbol: 'RELIANCE.NS' } }] } },
      watchlist: ['RELIANCE.NS', 'TCS.NS'],
      cb: () => {}
    });
    expect(r.meta).toEqual({ host: 'query1.finance.yahoo.com', status: 503, retried: true });
    expect(JSON.stringify(r)).not.toContain('RELIANCE');
  });

  it('truncates a long string rather than storing it whole', () => {
    const r = recordFailure('x', new Error('e'), { blob: 'z'.repeat(500) });
    expect(r.meta.blob.length).toBeLessThan(130);
    expect(r.meta.blob.endsWith('…')).toBe(true);
  });

  it('is a bounded ring buffer, so a failing feed cannot exhaust memory', () => {
    for (let i = 0; i < 250; i++) recordFailure('spam', new Error('e' + i));
    expect(failureCount()).toBe(100);
    // The newest are what survive: the oldest 150 are gone.
    expect(getFailures().at(-1).message).toBe('e249');
    expect(getFailures()[0].message).toBe('e150');
  });

  it('records regardless of whether the panel is switched on', () => {
    // Opt-in governs what is DISPLAYED. A log you must enable before the bug happens is a
    // log you never have when it matters.
    setEnabled(false);
    expect(isEnabled()).toBe(false);
    recordFailure('while off', new Error('still recorded'));
    expect(failureCount()).toBe(1);
    setEnabled(true);
    expect(isEnabled()).toBe(true);
  });

  it('notifies a listener, and a broken listener does not break recording', () => {
    const seen = [];
    onFailure((r) => { seen.push(r); throw new Error('listener exploded'); });
    expect(() => recordFailure('x', new Error('e'))).not.toThrow();
    expect(seen.length).toBe(1);
    expect(failureCount()).toBe(1);
  });

  it('formats a dump that carries no URLs or holdings', () => {
    recordFailure('options: chain fetch', new Error('HTTP 502'), { host: 'www.nseindia.com', retries: 1 });
    const text = formatFailures();
    expect(text).toContain('options: chain fetch');
    expect(text).toContain('HTTP 502');
    expect(text).toContain('host=www.nseindia.com');
    expect(text).not.toContain('?url=');
  });

  it('says so plainly when nothing has failed', () => {
    expect(formatFailures()).toBe('No failures recorded this session.');
  });
});

describe('E4-2 — per-block error boundaries', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="banner" id="errorBanner"></div>' +
      '<div class="detail-card" id="detailCard"></div>';
  });

  it('renders a failure state into the block that failed', () => {
    renderBlockError('options', new Error('HTTP 502'));
    const block = document.getElementById('optBlock');
    expect(block).not.toBeNull();
    expect(block.textContent).toContain('could not load');
    expect(block.textContent).toContain('HTTP 502');
  });

  it('says the feed failed, not that the figure is missing', () => {
    // CLAUDE.md invariant 3. "—" means the company does not report it; this must never be
    // mistaken for that.
    renderBlockError('factors', new Error('timeout'));
    const text = document.getElementById('facBlock').textContent;
    expect(text).toContain('fetch failure, not a missing figure');
    expect(text).toContain('Everything else on this page is unaffected');
  });

  it('reuses the block container when the block already made one', () => {
    const existing = document.createElement('div');
    existing.id = 'snapBlock';
    existing.textContent = 'half-rendered snapshot';
    document.getElementById('detailCard').appendChild(existing);

    renderBlockError('snapshot', new Error('nope'));
    expect(document.querySelectorAll('#snapBlock').length).toBe(1);
    expect(document.getElementById('snapBlock').textContent).not.toContain('half-rendered');
  });

  it('sends a core failure to the page banner, because there is no partial panel to show', () => {
    renderBlockError('core', new Error('no data for XYZ'));
    const banner = document.getElementById('errorBanner');
    expect(banner.textContent).toContain('Could not render the detail panel');
    expect(banner.classList.contains('show')).toBe(true);
  });

  it('escapes the error message rather than injecting it as markup', () => {
    renderBlockError('options', new Error('<img src=x onerror="alert(1)">'));
    const block = document.getElementById('optBlock');
    expect(block.querySelector('img')).toBeNull();
    expect(block.innerHTML).toContain('&lt;img');
  });

  it('logs every block failure to the diagnostics buffer', () => {
    renderBlockError('factors', new Error('history fetch failed'));
    const logged = getFailures();
    expect(logged.length).toBe(1);
    expect(logged[0].context).toBe('block:factors');
    expect(logged[0].message).toBe('history fetch failed');
  });
});

describe('E4-2 — one dead feed never blanks the page', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="banner" id="errorBanner"></div>' +
      '<div class="detail-card" id="detailCard"></div>';
  });

  it('a block that throws synchronously does not stop the blocks behind it', () => {
    const ran = [];
    const blocks = [
      { id: 'deep-analysis', delayMs: 0, render: () => { ran.push('deep'); throw new Error('deep died'); } },
      { id: 'snapshot', delayMs: 0, render: () => { ran.push('snap'); } }
    ];

    // Before E4-2 this threw out of runBlocks and the snapshot never ran: a dead options
    // feed could blank the panel.
    expect(() => runBlocks(blocks, {})).not.toThrow();
    expect(ran).toEqual(['deep', 'snap']);
    expect(document.getElementById('deepBlock').textContent).toContain('could not load');
  });

  it('an async block that rejects is caught, not left as an unhandled rejection', async () => {
    const unhandled = [];
    const onUnhandled = (e) => { unhandled.push(e); e.preventDefault?.(); };
    if (typeof process !== 'undefined') process.on('unhandledRejection', onUnhandled);

    runBlocks([{ id: 'options', delayMs: 0, render: async () => { throw new Error('chain 502'); } }], {});

    // Let the microtask queue drain so an uncaught rejection would surface.
    await new Promise((r) => setTimeout(r, 20));
    if (typeof process !== 'undefined') process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toEqual([]);
    expect(document.getElementById('optBlock').textContent).toContain('chain 502');
  });

  it('still does not await — a slow block must not hold up the ones behind it', async () => {
    const started = [];
    let release;
    const blocked = new Promise((r) => { release = r; });
    const blocks = [
      { id: 'options', delayMs: 0, render: async () => { started.push('options'); await blocked; } },
      { id: 'factors', delayMs: 0, render: async () => { started.push('factors'); } }
    ];

    runBlocks(blocks, {});
    // factors must have been entered even though options is still hanging. If anyone adds
    // an await to runBlock, this is the test that fails.
    expect(started).toEqual(['options', 'factors']);
    release();
  });

  it('a failing block still logs, so the reason survives the session', async () => {
    runBlocks([{ id: 'factors', delayMs: 0, render: async () => { throw new Error('nifty history failed'); } }], {});
    await new Promise((r) => setTimeout(r, 20));
    expect(getFailures().map((f) => f.context)).toContain('block:factors');
  });
});
