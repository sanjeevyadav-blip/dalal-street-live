// Dalal Street Live — CORS proxy (Cloudflare Worker)
// Deployed as: https://dalal-proxy.sanjeev-yadav.workers.dev
//
// Two authentication handshakes are load-bearing:
//   1. Yahoo crumb  — quoteSummary returns 401 "Invalid Cookie" without it
//   2. NSE session  — option chain returns {} without it
// Do not remove either.

const ALLOWED_HOSTS = new Set(['query1.finance.yahoo.com','query2.finance.yahoo.com','news.google.com','feeds.finance.yahoo.com','www.bing.com','www.nseindia.com']);
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type' };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
let ySess=null, yAt=0, nseCookie=null, nseAt=0;

async function getYahoo(){
  if (ySess && Date.now()-yAt < 1800000) return ySess;
  const c = await fetch('https://fc.yahoo.com/', { headers:{ 'User-Agent':UA } });
  const raw = c.headers.get('set-cookie')||'';
  const cookie = raw.split(',').map(s=>s.split(';')[0].trim()).filter(Boolean).join('; ');
  const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers:{ 'User-Agent':UA,'Cookie':cookie,'Accept':'*/*' } });
  ySess = { cookie, crumb:(await cr.text()).trim() }; yAt = Date.now();
  return ySess;
}
function mergeCookies(raws){
  const seen = {}; const parts = [];
  raws.forEach(function(raw){
    (raw||'').split(',').forEach(function(s){
      const kv = s.split(';')[0].trim();
      const k = kv.split('=')[0];
      if (k && kv.indexOf('=')>0 && !seen[k]){ seen[k]=1; parts.push(kv); }
    });
  });
  return parts.join('; ');
}
async function getNse(){
  if (nseCookie && Date.now()-nseAt < 600000) return nseCookie;
  const base = { 'User-Agent':UA, 'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language':'en-US,en;q=0.9', 'Sec-Fetch-Mode':'navigate', 'Sec-Fetch-Site':'none' };
  const a = await fetch('https://www.nseindia.com/', { headers: base, redirect:'follow' });
  const c1 = a.headers.get('set-cookie')||'';
  const b = await fetch('https://www.nseindia.com/option-chain', { headers: Object.assign({}, base, { 'Cookie': mergeCookies([c1]), 'Referer':'https://www.nseindia.com/' }), redirect:'follow' });
  const c2 = b.headers.get('set-cookie')||'';
  nseCookie = mergeCookies([c1,c2]); nseAt = Date.now();
  return nseCookie;
}
// ---------------------------------------------------------------------------
// Rate limiting — EPIC-4 story E4-5
//
// This Worker is an open relay to anyone who finds the URL. The allowlist stops it being
// pointed at arbitrary hosts, but nothing stopped one client hammering Yahoo and NSE through
// it until they rate-limited the Worker's IP — which takes the dashboard down for everyone,
// including the owner.
//
// HONEST LIMITATION, STATED UP FRONT: this counter lives in the isolate's memory. Cloudflare
// runs many isolates across many colos and recycles them freely, so the true ceiling is some
// multiple of the number below, and it resets unpredictably. A real global limit needs
// Durable Objects or KV, which is a cost and a deploy this project has not taken on. What
// this does buy is containment of the realistic case — one runaway tab or script looping on
// one connection — which is the case that has any chance of occurring here.
//
// The budget is deliberately generous, because the app itself is bursty: a full ranking run
// is 56 requests, a 50-row screener is about 100, and opening a stock is another 8. A reader
// doing all three inside a minute is normal use, not abuse.
const RATE = { windowMs: 60000, maxRequests: 300 };
const buckets = new Map();

function rateLimit(ip, now){
  const cutoff = now - RATE.windowMs;
  let hits = buckets.get(ip);
  if (!hits) { hits = []; buckets.set(ip, hits); }
  // Drop timestamps that have aged out of the window.
  while (hits.length && hits[0] <= cutoff) hits.shift();
  // Opportunistic sweep so an isolate that lives a long time does not accumulate every IP
  // that ever touched it.
  if (buckets.size > 5000){
    for (const [k, v] of buckets){ if (!v.length || v[v.length-1] <= cutoff) buckets.delete(k); }
  }
  if (hits.length >= RATE.maxRequests){
    return { allowed: false, retryAfter: Math.ceil((hits[0] + RATE.windowMs - now) / 1000) };
  }
  hits.push(now);
  return { allowed: true, remaining: RATE.maxRequests - hits.length };
}

// A stable, non-reversible short label for an IP, so the logs can show "one client is
// responsible for all of this" without recording who that client is.
function clientLabel(ip){
  let hash = 2166136261;
  for (let i = 0; i < ip.length; i++){
    hash ^= ip.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(-7);
}

// Structured log line — EPIC-4 story E4-5. Visible with `wrangler tail`.
//
// What is logged is chosen so the output can be shared: the upstream HOSTNAME and the last
// path segment, never the query string. The query is where the symbols live, and a log of
// which stocks someone looked up is exactly the record this project should not be keeping.
function logLine(fields){
  try { console.log(JSON.stringify({ t: new Date().toISOString(), ...fields })); }
  catch { /* logging must never fail a request */ }
}

// A fixed label per endpoint family, never a slice of the URL.
//
// The obvious implementation — take the last path segment — leaks the very thing this is
// trying not to log: Yahoo puts the symbol IN THE PATH, so /v8/finance/chart/RELIANCE.NS
// would log "RELIANCE.NS". A closed set of labels cannot leak, and "which kind of request
// was this" is the only part that is operationally useful anyway.
const ENDPOINTS = [
  [/\/v8\/finance\/chart\//, 'chart'],
  [/\/v10\/finance\/quoteSummary\//, 'quoteSummary'],
  [/\/finance\/timeseries\//, 'timeseries'],
  [/\/v1\/test\/getcrumb/, 'crumb'],
  [/\/api\/option-chain-contract-info/, 'option-contract-info'],
  [/\/api\/option-chain-v3/, 'option-chain'],
  [/\/api\/all-upcoming-issues/, 'ipos'],
  [/\/news\/search/, 'news']
];

function endpointOf(p){
  if (!p) return null;
  for (const [pattern, label] of ENDPOINTS){ if (pattern.test(p.pathname)) return label; }
  return 'other';
}

export default {
  async fetch(request){
    const started = Date.now();
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const client = clientLabel(ip);

    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
    if (request.method!=='GET'){
      logLine({ client, status:405, reason:'method' });
      return new Response('Only GET',{status:405,headers:CORS});
    }

    const limit = rateLimit(ip, started);
    if (!limit.allowed){
      logLine({ client, status:429, reason:'rate-limit', retryAfter: limit.retryAfter });
      return new Response('Rate limit exceeded', { status:429, headers: Object.assign({}, CORS, {
        'Retry-After': String(limit.retryAfter),
        'Cache-Control': 'no-store'
      })});
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target){
      logLine({ client, status:400, reason:'missing-url' });
      return new Response('Missing url',{status:400,headers:CORS});
    }
    let p; try { p = new URL(target); } catch(e){
      logLine({ client, status:400, reason:'bad-url' });
      return new Response('Bad URL',{status:400,headers:CORS});
    }
    if (p.protocol!=='https:' || !ALLOWED_HOSTS.has(p.hostname)){
      logLine({ client, status:403, reason:'host-not-allowed', host:p.hostname });
      return new Response('Host not allowed',{status:403,headers:CORS});
    }
    const h = { 'User-Agent':UA, 'Accept':'*/*' };
    let noCache = false;
    try {
      if (p.hostname==='query1.finance.yahoo.com'||p.hostname==='query2.finance.yahoo.com'){
        const s = await getYahoo();
        if (s.cookie) h['Cookie']=s.cookie;
        if (s.crumb && !p.searchParams.has('crumb')) p.searchParams.set('crumb', s.crumb);
      }
      if (p.hostname==='www.nseindia.com' && p.pathname.indexOf('/api/')===0){
        h['Cookie'] = await getNse();
        h['Referer'] = 'https://www.nseindia.com/option-chain';
        h['Accept'] = 'application/json, text/plain, */*';
        h['Accept-Language'] = 'en-US,en;q=0.9';
        h['X-Requested-With'] = 'XMLHttpRequest';
        h['Sec-Fetch-Mode'] = 'cors';
        h['Sec-Fetch-Site'] = 'same-origin';
        noCache = true;
      }
      const opts = noCache ? { headers:h } : { headers:h, cf:{ cacheTtl:30, cacheEverything:true } };
      let up = await fetch(p.toString(), opts);
      if (up.status===401||up.status===403){
        if (p.hostname==='www.nseindia.com'){ nseCookie=null; h['Cookie']= await getNse(); }
        else { ySess=null; const s2=await getYahoo(); h['Cookie']=s2.cookie; p.searchParams.set('crumb', s2.crumb); }
        up = await fetch(p.toString(), { headers:h });
      }
      const body = await up.arrayBuffer();
      const o = Object.assign({}, CORS);
      o['Content-Type'] = up.headers.get('Content-Type')||'application/json';
      o['Cache-Control'] = noCache ? 'no-store' : 'public, max-age=30';
      o['X-RateLimit-Remaining'] = String(limit.remaining);
      logLine({ client, status:up.status, host:p.hostname, endpoint:endpointOf(p),
        ms: Date.now()-started, bytes: body.byteLength, remaining: limit.remaining });
      return new Response(body,{ status:up.status, headers:o });
    } catch(err){
      logLine({ client, status:502, host:p.hostname, endpoint:endpointOf(p),
        ms: Date.now()-started, error: err.message });
      return new Response('Upstream failed: '+err.message,{status:502,headers:CORS});
    }
  }
};
