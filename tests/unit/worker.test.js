// The Cloudflare Worker — EPIC-4 story E4-5, plus the allowlist it already had.
//
// NOT DEPLOYED. These test worker/worker.js as source. The live Worker is unchanged and
// deploying it is a separate, deliberate act (`npm run worker:deploy`), which CLAUDE.md
// puts behind explicit approval.
//
// Only the paths that return before any upstream fetch are exercised here: the method guard,
// the rate limiter, the allowlist and the URL validation. That is not a gap — it is where
// every security-relevant decision is made, and testing the proxy path would mean either
// hitting Yahoo for real or mocking it so heavily the test proves nothing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../worker/worker.js';

const get = (url, ip = '203.0.113.7') =>
  worker.fetch(new Request(url, { headers: { 'CF-Connecting-IP': ip } }));

const proxied = (target, ip) =>
  get('https://dalal-proxy.example.workers.dev/?url=' + encodeURIComponent(target), ip);

let logs;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((line) => logs.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Each test uses its own IP so the module-level rate-limit buckets do not leak between them.
let ipCounter = 0;
const freshIp = () => '198.51.100.' + (++ipCounter % 250);

describe('request guards', () => {
  it('answers a CORS preflight', async () => {
    const res = await worker.fetch(new Request('https://w.example/', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('refuses any method other than GET', async () => {
    const res = await worker.fetch(new Request('https://w.example/', { method: 'POST' }));
    expect(res.status).toBe(405);
  });

  it('refuses a missing url parameter', async () => {
    expect((await get('https://w.example/', freshIp())).status).toBe(400);
  });

  it('refuses a malformed url parameter', async () => {
    expect((await proxied('not a url', freshIp())).status).toBe(400);
  });

  it('refuses a host that is not on the allowlist', async () => {
    expect((await proxied('https://example.com/', freshIp())).status).toBe(403);
  });

  it('refuses plain http even to an allowlisted host', async () => {
    // Downgrading to http would put the crumb and session cookies on the wire in clear.
    expect((await proxied('http://query1.finance.yahoo.com/', freshIp())).status).toBe(403);
  });
});

describe('E4-5 — rate limiting', () => {
  it('allows a burst the app itself produces', async () => {
    // A full ranking run is 56 requests and a 50-row screener about 100. Normal use must
    // not trip the limiter, or the limiter is the outage.
    const ip = freshIp();
    for (let i = 0; i < 160; i++){
      const res = await proxied('https://example.com/', ip);   // 403, but it counts
      expect(res.status).toBe(403);
    }
  });

  it('returns 429 with Retry-After once the budget is gone', async () => {
    const ip = freshIp();
    let limited = null;
    for (let i = 0; i < 320; i++){
      const res = await proxied('https://example.com/', ip);
      if (res.status === 429){ limited = res; break; }
    }
    expect(limited, 'never rate limited after 320 requests').not.toBeNull();
    const retryAfter = Number(limited.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(limited.headers.get('Cache-Control')).toBe('no-store');
    // A 429 must still be readable by the browser that caused it.
    expect(limited.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('limits per client, so one runaway tab does not lock everyone out', async () => {
    const noisy = freshIp();
    for (let i = 0; i < 320; i++) await proxied('https://example.com/', noisy);
    expect((await proxied('https://example.com/', noisy)).status).toBe(429);

    // A different client is unaffected.
    expect((await proxied('https://example.com/', freshIp())).status).toBe(403);
  });
});

describe('E4-5 — structured logs', () => {
  it('emits one JSON line per request', async () => {
    await proxied('https://example.com/', freshIp());
    expect(logs.length).toBe(1);
    const entry = JSON.parse(logs[0]);
    expect(entry.status).toBe(403);
    expect(entry.reason).toBe('host-not-allowed');
    expect(Date.parse(entry.t)).not.toBeNaN();
  });

  it('never logs the client IP, only a stable opaque label', async () => {
    const ip = '203.0.113.99';
    await proxied('https://example.com/', ip);
    const entry = JSON.parse(logs[0]);
    expect(logs[0]).not.toContain(ip);
    expect(entry.client).toMatch(/^[a-z0-9]{7}$/);

    // Stable, so "one client is doing all of this" is still readable from the logs.
    logs.length = 0;
    await proxied('https://example.com/', ip);
    expect(JSON.parse(logs[0]).client).toBe(entry.client);
  });

  it('never logs the query string, where the looked-up symbols live', async () => {
    await proxied(
      'https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1y',
      freshIp()
    );
    // That host IS allowlisted, so this attempts an upstream fetch and logs either the
    // response or the 502. Either way the symbol must not appear.
    const joined = logs.join('\n');
    expect(joined).not.toContain('RELIANCE');
    expect(joined).not.toContain('interval=');
    expect(joined).not.toContain('range=');
  });

  it('logs the rate-limit refusal too, so abuse is visible', async () => {
    const ip = freshIp();
    for (let i = 0; i < 320; i++) await proxied('https://example.com/', ip);
    const limited = logs.map((l) => JSON.parse(l)).filter((e) => e.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0].reason).toBe('rate-limit');
    expect(limited[0].retryAfter).toBeGreaterThan(0);
  });
});
