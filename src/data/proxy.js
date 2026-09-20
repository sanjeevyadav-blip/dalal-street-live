// The CORS proxy layer.
//
// Yahoo and NSE send no Access-Control-Allow-Origin header, so a browser on another origin
// cannot read their responses at all. The Cloudflare Worker fetches server-side, where CORS
// does not apply, and re-serves with permissive headers. It also holds the two auth
// handshakes (Yahoo crumb, NSE session cookies), which cannot be done from the browser
// because they need cross-origin cookies. Both are load-bearing: without them fundamentals
// and the option chain go dark. See docs/06-API-SPEC.md.
//
// The fallback proxies are kept only as a last resort and are known to be unreliable.
// corsproxy.io was dropped entirely — it now returns 401 without a paid key.
//
// RETRIES (EPIC-4 story E4-3)
//
// Until now a single failure moved straight to the next proxy, and three failures threw.
// That threw away the most common case by far: a transient upstream blip. NSE in particular
// returns 5xx under load and succeeds on the next request a quarter of a second later, and
// the Worker answers 502 "Upstream failed" whenever its own fetch to Yahoo or NSE trips.
// Both are worth one more try; neither was getting one.
//
// What is retried, and what is not, is the whole design:
//
//   RETRIED   network error, timeout, 408, 425, 429, and any 5xx — conditions that say
//             "ask again", including the Worker's own 502.
//   NOT       every other 4xx. A 403 from the Worker means the host is not on the
//             allowlist and a 404 means the symbol does not exist; asking again just
//             burns the time budget before the next proxy gets a turn.
//
// Retries are bounded by a wall-clock budget, not just an attempt count, because the
// failure that matters to a reader is a page that hangs. Once the budget is gone the error
// propagates and the block renders its own failure state (story E4-2).

import { recordFailure } from '../diagnostics.js';

export const WORKER_URL = 'https://dalal-proxy.sanjeev-yadav.workers.dev';

const PROXIES = [
  ...(WORKER_URL ? [(u) => WORKER_URL + '/?url=' + encodeURIComponent(u)] : []),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
];

let goodProxy = 0;

/** Tunable, and overridable per call so tests do not have to wait out real backoff. */
export const RETRY = {
  timeoutMs: 5000,
  attemptsPerProxy: 2,   // one try, then one retry — only for transient failures
  baseDelayMs: 250,      // doubled per retry
  maxDelayMs: 2000,
  budgetMs: 12000        // total wall clock across every proxy and retry
};

export function isTransient(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function withTimeout(promise, ms){
  return Promise.race([ promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)) ]);
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Fetch a URL through the proxy rotation, retrying transient failures.
 *
 * @param {string} targetUrl  the upstream URL to proxy to
 * @param {(res: Response) => Promise<any>} read  res.json() or res.text()
 * @param {object} [opts]  overrides for RETRY, plus injectable `fetchImpl` and `sleepImpl`
 */
export async function fetchThroughProxy(targetUrl, read, opts = {}){
  const cfg = { ...RETRY, ...opts };
  const doFetch = opts.fetchImpl || ((u) => fetch(u, { cache:'no-store' }));
  const doSleep = opts.sleepImpl || sleep;
  const deadline = Date.now() + cfg.budgetMs;

  let lastErr = null;
  let retries = 0;

  for (let i = 0; i < PROXIES.length; i++){
    const idx = (goodProxy + i) % PROXIES.length;

    for (let attempt = 0; attempt < cfg.attemptsPerProxy; attempt++){
      if (Date.now() >= deadline){
        lastErr = lastErr || new Error('proxy budget exhausted');
        return failed(targetUrl, lastErr, retries);
      }
      try {
        const res = await withTimeout(doFetch(PROXIES[idx](targetUrl)), cfg.timeoutMs);
        if (!res.ok){
          const err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        const data = await read(res);
        goodProxy = idx;      // remember what worked, so the next call starts there
        return data;
      } catch (err){
        lastErr = err;
        // A status we know is permanent: this proxy will keep saying it. Next proxy.
        if (err.status != null && !isTransient(err.status)) break;
        // Transient, and there is another attempt left on this proxy: back off and retry.
        const last = attempt === cfg.attemptsPerProxy - 1;
        if (last) break;
        const delay = Math.min(cfg.baseDelayMs * Math.pow(2, attempt), cfg.maxDelayMs);
        if (Date.now() + delay >= deadline) break;
        retries++;
        await doSleep(delay);
      }
    }
  }

  return failed(targetUrl, lastErr || new Error('All proxies failed'), retries);
}

function failed(targetUrl, err, retries){
  // Host only, never the full URL: query strings carry the symbols a reader looked up, and
  // the diagnostics log is meant to be shareable. See src/diagnostics.js.
  let host = 'unknown';
  try { host = new URL(targetUrl).hostname; } catch { /* malformed target; host stays unknown */ }
  recordFailure('proxy', err, { host, retries });
  throw err;
}

export async function fetchJsonThroughProxy(targetUrl, opts){
  return fetchThroughProxy(targetUrl, (res) => res.json(), opts);
}

export async function fetchTextThroughProxy(targetUrl, opts){
  return fetchThroughProxy(targetUrl, (res) => res.text(), opts);
}

export async function runPool(items, worker, concurrency){
  let i = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (i < items.length){
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}
