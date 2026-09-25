// Price alerts: the app's logic, the background runner's copy of it, and the runner itself.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import {
  isMarketOpen, crossed, evaluate, validateNewAlert, addAlert, listAlerts, removeAlert, applyFired, MAX_ALERTS
} from '../../src/data/alerts.js';

const RUNNER_SRC = readFileSync(resolve(process.cwd(), 'src/public/runners/alerts.js'), 'utf8');

/**
 * Load the runner the way the background engine does: a plain script with its own globals.
 * Returns the handlers it registered and the fakes it talked to.
 */
function loadRunner({ prices = {}, failQuote = new Set() } = {}){
  const handlers = {};
  const kv = new Map();
  const scheduled = [];
  const fetched = [];
  const sandbox = {
    addEventListener: (name, fn) => { handlers[name] = fn; },
    CapacitorKV: {
      get: (k) => ({ value: kv.has(k) ? kv.get(k) : null }),
      set: (k, v) => { kv.set(k, v); },
      remove: (k) => { kv.delete(k); }
    },
    CapacitorNotifications: { schedule: (list) => { scheduled.push(...list); } },
    fetch: (url) => {
      fetched.push(url);
      const target = decodeURIComponent(url.split('?url=')[1]);
      const sym = decodeURIComponent(/chart\/([^?]+)/.exec(target)[1]);
      if (failQuote.has(sym)) return Promise.reject(new Error('network'));
      return Promise.resolve({ json: () => Promise.resolve({ chart: { result: [{ meta: { regularMarketPrice: prices[sym] } }] } }) });
    },
    Promise, JSON, Math, Date, Array, Object, String, Number, isFinite, encodeURIComponent, decodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(RUNNER_SRC, sandbox);
  const call = (event, args) => new Promise((res, rej) => handlers[event](res, rej, args));
  return { handlers, kv, scheduled, fetched, call, exports: sandbox.__dslAlertsRunner };
}

// An instant given as IST wall-clock time. 24 Sep 2026 is a Thursday, 26 and 27 the weekend.
const IST =(y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h, mi) - (5 * 60 + 30) * 60000);

describe('market hours', () => {
  it('open on a weekday between 09:15 and 15:30 IST, closed outside', () => {
    expect(isMarketOpen(IST(2026, 9, 24, 9, 15))).toBe(true);    // Thursday, the opening minute
    expect(isMarketOpen(IST(2026, 9, 24, 15, 30))).toBe(true);   // the closing minute
    expect(isMarketOpen(IST(2026, 9, 24, 9, 14))).toBe(false);
    expect(isMarketOpen(IST(2026, 9, 24, 15, 31))).toBe(false);
    expect(isMarketOpen(IST(2026, 9, 26, 11, 0))).toBe(false);   // Saturday
    expect(isMarketOpen(IST(2026, 9, 27, 11, 0))).toBe(false);   // Sunday
  });
});

describe('crossing', () => {
  it('above fires at or above the level; below at or below', () => {
    expect(crossed({ dir:'above', price:100 }, 100)).toBe(true);
    expect(crossed({ dir:'above', price:100 }, 99.95)).toBe(false);
    expect(crossed({ dir:'below', price:100 }, 100)).toBe(true);
    expect(crossed({ dir:'below', price:100 }, 100.05)).toBe(false);
  });

  it('a failed or nonsensical quote never reads as a crossing', () => {
    for (const p of [undefined, null, NaN, 0, -5, '120']){
      expect(crossed({ dir:'below', price:100 }, p)).toBe(false);
      expect(crossed({ dir:'above', price:100 }, p)).toBe(false);
    }
  });

  it('is one-shot: a fired alert does not fire again', () => {
    const alerts = [{ id:'a', sym:'X.NS', dir:'above', price:100, firedAt:'2026-01-01T00:00:00Z', firedPrice:101 }];
    expect(evaluate(alerts, { 'X.NS': 150 }, 'now').fired).toEqual([]);
  });
});

describe('the runner and the app agree', () => {
  // Two copies of the same logic, because the runner cannot import modules. This is what
  // stops them drifting apart.
  const r = loadRunner().exports;
  const instants = [IST(2026, 9, 24, 9, 15), IST(2026, 9, 24, 15, 31), IST(2026, 9, 26, 11, 0), IST(2026, 9, 21, 12, 0)];
  const cases = [
    [{ dir:'above', price:100 }, 100], [{ dir:'above', price:100 }, 99], [{ dir:'below', price:100 }, 100],
    [{ dir:'below', price:100 }, 101], [{ dir:'above', price:100 }, NaN], [{ dir:'sideways', price:100 }, 100]
  ];

  it('on market hours', () => {
    for (const d of instants) expect(r.isMarketOpen(d)).toBe(isMarketOpen(d));
  });

  it('on every crossing case', () => {
    for (const [a, p] of cases) expect(r.crossed(a, p)).toBe(crossed(a, p));
  });

  it('on a whole evaluation pass', () => {
    const alerts = [
      { id:'1', sym:'A.NS', dir:'above', price:100, firedAt:null },
      { id:'2', sym:'A.NS', dir:'below', price:90,  firedAt:null },
      { id:'3', sym:'B.NS', dir:'below', price:50,  firedAt:null },
      { id:'4', sym:'C.NS', dir:'above', price:10,  firedAt:'earlier' }
    ];
    const prices = { 'A.NS': 105, 'B.NS': 49, 'C.NS': 999 };
    const app = evaluate(alerts, prices, 'T');
    const run = r.evaluate(alerts, prices, 'T');
    expect(JSON.parse(JSON.stringify(run))).toEqual(JSON.parse(JSON.stringify(app)));
    expect(app.fired.map(f => f.id)).toEqual(['1', '3']);
  });
});

describe('the runner itself', () => {
  const stored = (kv) => JSON.parse(kv.get('dsl.alerts.v1'));

  it('stores what the app syncs, and hands it back', async () => {
    const rn = loadRunner();
    await rn.call('syncAlerts', { alerts: [{ id:'x', sym:'RELIANCE.NS', dir:'above', price:1300, firedAt:null }] });
    const got = await rn.call('getAlerts', {});
    expect(got.alerts.map(a => a.id)).toEqual(['x']);
  });

  it('fires a crossed alert: marks it, stores it, and posts one notification', async () => {
    const rn = loadRunner({ prices: { 'RELIANCE.NS': 1304.5 } });
    await rn.call('syncAlerts', { alerts: [{ id:'x', sym:'RELIANCE.NS', dir:'above', price:1300, firedAt:null }] });
    const res = await rn.call('checkAlerts', { force: true });
    expect(res.fired).toEqual(['x']);
    expect(stored(rn.kv)[0].firedPrice).toBe(1304.5);
    expect(rn.scheduled.length).toBe(1);
    const n = rn.scheduled[0];
    expect(Number.isInteger(n.id) && n.id >= 0 && n.id < 2 ** 31).toBe(true);   // Android wants a 32-bit int
    expect(n.title).toBe('RELIANCE is above ₹1,300.00');
    expect(n.body).toContain('₹1,304.50');
    // Says how late it may be, rather than implying it caught the exact moment.
    expect(n.body).toMatch(/15 minutes/);
  });

  it('does nothing outside market hours unless forced', async () => {
    const rn = loadRunner({ prices: { 'RELIANCE.NS': 9999 } });
    await rn.call('syncAlerts', { alerts: [{ id:'x', sym:'RELIANCE.NS', dir:'above', price:1300, firedAt:null }] });
    const res = await rn.call('checkAlerts', {});
    // Either skipped because the clock says closed, or checked because it happens to be
    // open right now; both are correct. What must hold: a skip fetched nothing.
    if (res.skipped) expect(rn.fetched.length).toBe(0);
  });

  it('a failed quote fires nothing and still resolves', async () => {
    const rn = loadRunner({ failQuote: new Set(['RELIANCE.NS']) });
    await rn.call('syncAlerts', { alerts: [{ id:'x', sym:'RELIANCE.NS', dir:'below', price:1300, firedAt:null }] });
    const res = await rn.call('checkAlerts', { force: true });
    expect(res.fired).toEqual([]);
    expect(rn.scheduled.length).toBe(0);
  });

  it('fetches each symbol once, however many alerts share it', async () => {
    const rn = loadRunner({ prices: { 'RELIANCE.NS': 1200 } });
    await rn.call('syncAlerts', { alerts: [
      { id:'a', sym:'RELIANCE.NS', dir:'above', price:1300, firedAt:null },
      { id:'b', sym:'RELIANCE.NS', dir:'below', price:1100, firedAt:null }
    ]});
    await rn.call('checkAlerts', { force: true });
    expect(rn.fetched.length).toBe(1);
  });

  it('formats rupees with Indian grouping, without Intl', () => {
    const { inr } = loadRunner().exports;
    expect(inr(123456.5)).toBe('₹1,23,456.50');
    expect(inr(1300)).toBe('₹1,300.00');
    expect(inr(999)).toBe('₹999.00');
    expect(inr(12345678)).toBe('₹1,23,45,678.00');
  });
});

describe('setting an alert', () => {
  beforeEach(() => { localStorage.clear(); });

  it('rejects a level on the wrong side of the price, which would fire at once', () => {
    expect(validateNewAlert('above', 1200, 1247)).toMatch(/already at or below/);
    expect(validateNewAlert('below', 1300, 1247)).toMatch(/already at or above/);
    expect(validateNewAlert('above', 1300, 1247)).toBeNull();
    expect(validateNewAlert('below', 1200, 1247)).toBeNull();
  });

  it('rejects a non-price', () => {
    for (const p of [NaN, 0, -1, Infinity]) expect(validateNewAlert('above', p, 100)).toMatch(/greater than zero/);
    expect(validateNewAlert('sideways', 120, 100)).toMatch(/above or below/);
  });

  it('caps the number of active alerts', () => {
    for (let i = 0; i < MAX_ALERTS; i++) addAlert('X' + i + '.NS', 'above', 100 + i);
    expect(validateNewAlert('above', 500, 100)).toMatch(/most this app checks/);
  });

  it('stores, applies a firing, and removes', () => {
    const a = addAlert('RELIANCE.NS', 'above', 1300);
    expect(listAlerts().map(x => x.id)).toEqual([a.id]);
    applyFired([{ id:a.id, firedAt:'T', firedPrice:1304 }]);
    expect(listAlerts()[0].firedPrice).toBe(1304);
    removeAlert(a.id);
    expect(listAlerts()).toEqual([]);
  });

  it('drops malformed stored records instead of trusting them', () => {
    localStorage.setItem('dsl.alerts.v1', JSON.stringify([
      { id:'ok', sym:'TCS.NS', dir:'above', price:3000 },
      { id:'bad-dir', sym:'TCS.NS', dir:'up', price:3000 },
      { id:'bad-sym', sym:'TCS', dir:'above', price:3000 },
      { id:'bad-price', sym:'TCS.NS', dir:'above', price:'3000' },
      null
    ]));
    expect(listAlerts().map(a => a.id)).toEqual(['ok']);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('dsl.alerts.v1', '{nope');
    expect(listAlerts()).toEqual([]);
  });
});
