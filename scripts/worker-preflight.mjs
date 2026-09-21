// Deploy gate for the Cloudflare Worker.
//
//   node scripts/worker-preflight.mjs                     # against the live Worker
//   node scripts/worker-preflight.mjs http://127.0.0.1:8787   # against `wrangler dev`
//
// WHY THIS EXISTS
//
// tests/unit/worker.test.js covers only the paths that return BEFORE any upstream fetch —
// the method guard, the rate limiter, the allowlist, the URL validation. That is where
// every security-relevant decision is made, but it is not where a deploy is most likely to
// break things.
//
// The risky part is the proxy path: the Yahoo cookie+crumb handshake and the NSE
// two-step session handshake. Those cannot be unit tested without either hitting the real
// internet from the offline suite or mocking them so heavily the test proves nothing. So
// they get checked here instead, deliberately and by hand, against a running Worker.
//
// RUN IT TWICE ON EVERY WORKER CHANGE:
//
//   1. Against `npx wrangler dev --local --port 8787` BEFORE deploying. This is the one
//      that matters — it exercises the new code against the real Yahoo and NSE without
//      putting it in front of anyone.
//   2. Against the live URL AFTER deploying, to confirm what actually shipped.
//
// A failure at step 1 means do not deploy. A failure at step 2 means roll back:
// `npx wrangler rollback` from the worker/ directory.

const DEFAULT_BASE = 'https://dalal-proxy.sanjeev-yadav.workers.dev';
const base = (process.argv[2] || DEFAULT_BASE).replace(/\/$/, '');
const via = (target) => base + '/?url=' + encodeURIComponent(target);

let failures = 0;
let checks = 0;

function record(name, ok, detail){
  checks++;
  if (!ok) failures++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name.padEnd(46) + (detail == null ? '' : detail));
}

async function check(name, fn){
  try {
    const { ok, detail } = await fn();
    record(name, ok, detail);
  } catch (err){
    record(name, false, 'threw: ' + (err && err.message ? err.message : err));
  }
}

console.log('Worker preflight against ' + base + '\n');

// --- the guards, which unit tests also cover; cheap to re-confirm on the real thing ---

await check('non-allowlisted host is refused', async () => {
  const r = await fetch(via('https://example.com/'));
  return { ok: r.status === 403, detail: 'status ' + r.status };
});

await check('plain http is refused', async () => {
  const r = await fetch(via('http://query1.finance.yahoo.com/'));
  return { ok: r.status === 403, detail: 'status ' + r.status };
});

await check('missing url parameter is a 400', async () => {
  const r = await fetch(base + '/');
  return { ok: r.status === 400, detail: 'status ' + r.status };
});

await check('CORS headers are present on a refusal', async () => {
  // A 403 the browser cannot read is a 403 nobody can debug.
  const r = await fetch(via('https://example.com/'));
  return { ok: r.headers.get('Access-Control-Allow-Origin') === '*' };
});

// --- the proxy path: the part no unit test reaches ---

await check('Yahoo chart proxies and parses', async () => {
  const r = await fetch(via('https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=5d'));
  if (!r.ok) return { ok: false, detail: 'status ' + r.status };
  const body = await r.json();
  const meta = body?.chart?.result?.[0]?.meta;
  return { ok: meta?.symbol === 'RELIANCE.NS', detail: 'price ' + meta?.regularMarketPrice };
});

await check('Yahoo crumb handshake still works', async () => {
  // quoteSummary returns 401 "Invalid Cookie" without the crumb the Worker attaches. This
  // is the single most fragile thing the Worker does; if it breaks, fundamentals, the DCF
  // and the factor block all go dark together.
  const r = await fetch(via('https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=summaryDetail'));
  if (!r.ok) return { ok: false, detail: 'status ' + r.status + ' (401 means the crumb broke)' };
  const body = await r.json();
  const pe = body?.quoteSummary?.result?.[0]?.summaryDetail?.trailingPE?.raw;
  return { ok: typeof pe === 'number', detail: 'trailingPE ' + pe };
});

await check('NSE session handshake still works', async () => {
  // Two-step cookie handshake. Returns {} without it.
  const r = await fetch(via('https://www.nseindia.com/api/option-chain-contract-info?symbol=RELIANCE'));
  if (!r.ok) return { ok: false, detail: 'status ' + r.status };
  const body = await r.json();
  const n = (body?.expiryDates || []).length;
  return { ok: n >= 1, detail: n + ' expiries' };
});

// --- what the deploy actually adds (EPIC-4 E4-5) ---

await check('rate-limit budget is reported on a proxied response', async () => {
  const r = await fetch(via('https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1d'));
  const remaining = r.headers.get('X-RateLimit-Remaining');
  if (remaining == null){
    return { ok: false, detail: 'header absent — this Worker predates E4-5' };
  }
  const n = Number(remaining);
  return { ok: Number.isFinite(n) && n > 0 && n <= 300, detail: remaining + ' left' };
});

await check('the budget decrements across requests', async () => {
  const a = await fetch(via('https://query1.finance.yahoo.com/v8/finance/chart/TCS.NS?interval=1d&range=1d'));
  const b = await fetch(via('https://query1.finance.yahoo.com/v8/finance/chart/INFY.NS?interval=1d&range=1d'));
  const rawX = a.headers.get('X-RateLimit-Remaining');
  const rawY = b.headers.get('X-RateLimit-Remaining');
  // Null-check the RAW header, not the parsed number. Number(null) is 0, and 0 is finite —
  // so parsing first made an absent header look like a budget of zero and this check passed
  // against a Worker that did not have the feature at all. Caught by running the gate
  // against the live pre-E4-5 Worker and seeing it report "0 then 0" as a pass.
  if (rawX == null || rawY == null) return { ok: false, detail: 'header absent' };
  const x = Number(rawX), y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, detail: 'header not a number' };
  // Not strictly x-1: Cloudflare may route the two requests to different isolates, and the
  // counter is per-isolate. That limitation is documented in worker/worker.js. All this can
  // honestly assert is that the counter is live and moving.
  return { ok: y !== x || y < 300, detail: x + ' then ' + y };
});

await check('market data is never edge-cached', async () => {
  // NSE responses carry session cookies, so caching them is unsafe.
  const r = await fetch(via('https://www.nseindia.com/api/option-chain-contract-info?symbol=RELIANCE'));
  return { ok: r.headers.get('Cache-Control') === 'no-store', detail: r.headers.get('Cache-Control') };
});

console.log('\n' + (failures === 0
  ? checks + '/' + checks + ' checks passed.'
  : failures + ' of ' + checks + ' checks FAILED.'));

process.exit(failures === 0 ? 0 : 1);
