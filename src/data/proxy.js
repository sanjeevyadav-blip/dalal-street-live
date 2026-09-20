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

export const WORKER_URL = 'https://dalal-proxy.sanjeev-yadav.workers.dev';

const PROXIES = [
  ...(WORKER_URL ? [(u) => WORKER_URL + '/?url=' + encodeURIComponent(u)] : []),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
];

let goodProxy = 0;

function withTimeout(promise, ms){
  return Promise.race([ promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)) ]);
}

export async function fetchJsonThroughProxy(targetUrl){
  let lastErr = null;
  for (let i = 0; i < PROXIES.length; i++){
    const idx = (goodProxy + i) % PROXIES.length;
    try {
      const res = await withTimeout(fetch(PROXIES[idx](targetUrl), { cache:'no-store' }), 5000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      goodProxy = idx;
      return data;
    } catch (err){ lastErr = err; }
  }
  throw lastErr || new Error('All proxies failed');
}

export async function fetchTextThroughProxy(targetUrl){
  let lastErr = null;
  for (let i = 0; i < PROXIES.length; i++){
    const idx = (goodProxy + i) % PROXIES.length;
    try {
      const res = await withTimeout(fetch(PROXIES[idx](targetUrl), { cache:'no-store' }), 5000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      goodProxy = idx;
      return text;
    } catch (err){ lastErr = err; }
  }
  throw lastErr || new Error('All proxies failed');
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
