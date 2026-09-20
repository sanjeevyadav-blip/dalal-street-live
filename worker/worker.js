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
export default {
  async fetch(request){
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
    if (request.method!=='GET') return new Response('Only GET',{status:405,headers:CORS});
    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Missing url',{status:400,headers:CORS});
    let p; try { p = new URL(target); } catch(e){ return new Response('Bad URL',{status:400,headers:CORS}); }
    if (p.protocol!=='https:' || !ALLOWED_HOSTS.has(p.hostname)) return new Response('Host not allowed',{status:403,headers:CORS});
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
      return new Response(body,{ status:up.status, headers:o });
    } catch(err){ return new Response('Upstream failed: '+err.message,{status:502,headers:CORS}); }
  }
};
