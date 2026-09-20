// IPO watch: the NSE upcoming-issues feed, plus the filing links and news that surround
// an issue.
//
// ipoSearchLinks deliberately points at NSE, BSE and SEBI's own filing pages rather than
// summarising a prospectus here. A DRHP is the primary source; a paraphrase of one is not.
//
// parseIpoDate exists because NSE returns dates as "28-Aug-2026", which Date cannot parse
// directly on every engine — replacing the hyphens with spaces is what makes it portable.

import { fetchIpos } from '../data/nse.js';
import { fetchNews } from '../data/news.js';
import { fmtNum, fmtCr, fmtPct } from './format.js';
import { fetchHistory } from '../data/yahoo.js';
import { openStock } from './navigate.js';
import { suppressed } from '../suppressed.js';

export function parseIpoDate(s){
  // NSE returns e.g. "28-Aug-2026"
  if (!s) return null;
  const d = new Date(s.replace(/-/g, ' '));
  return isNaN(d.getTime()) ? null : d;
}

let ipoCache = [];

export function ipoStatus(ipo){
  const now = new Date();
  const s = parseIpoDate(ipo.issueStartDate);
  const e = parseIpoDate(ipo.issueEndDate);
  if (s && now < s) return { key:'upcoming', label:'Upcoming' };
  if (e && now > new Date(e.getTime() + 86400000)) return { key:'closed', label:'Closed' };
  return { key:'open', label:'Open now' };
}

export function parseBand(priceStr){
  // "Rs.408 to Rs.429" -> {lo:408, hi:429}
  if (!priceStr) return null;
  const nums = (priceStr.match(/[\d,]+(?:\.\d+)?/g) || []).map(x => parseFloat(x.replace(/,/g,'')));
  if (!nums.length) return null;
  return { lo: nums[0], hi: nums.length > 1 ? nums[nums.length-1] : nums[0] };
}

export async function loadIpos(){
  const btn = document.getElementById('loadIpos');
  const block = document.getElementById('ipoBlock');
  const meta = document.getElementById('ipoMeta');
  btn.disabled = true; btn.textContent = 'Loading…';
  block.innerHTML = `<div class="note-inline">Fetching the current issue list from NSE…</div>`;
  document.getElementById('ipoDetail').innerHTML = '';
  try {
    const list = await fetchIpos();
    ipoCache = list;
    if (!list.length){
      block.innerHTML = `<div class="note-inline">NSE is reporting no open or upcoming IPOs right now. This list is genuinely empty between issues — it isn't an error.</div>`;
      meta.textContent = '';
    } else {
      const order = { open:0, upcoming:1, closed:2 };
      const sorted = list.slice().sort((a,b) => order[ipoStatus(a).key] - order[ipoStatus(b).key]);
      block.innerHTML = `<div class="ipo-grid">` + sorted.map(ip => {
        const st = ipoStatus(ip);
        const band = parseBand(ip.issuePrice);
        const size = parseFloat(ip.issueSize);
        return `<div class="ipo-card" data-sym="${ip.symbol}">
          <div class="name">${ip.companyName}</div>
          <div class="sym">${ip.symbol} · ${ip.series || 'EQ'}</div>
          <div class="band">${band ? (band.lo === band.hi ? '₹'+fmtNum(band.lo,0) : '₹'+fmtNum(band.lo,0)+' – ₹'+fmtNum(band.hi,0)) : (ip.issuePrice || '—')}</div>
          <div class="rowline"><span>Opens</span><span>${ip.issueStartDate || '—'}</span></div>
          <div class="rowline"><span>Closes</span><span>${ip.issueEndDate || '—'}</span></div>
          <div class="rowline"><span>Issue size</span><span>${isNaN(size) ? (ip.issueSize||'—') : fmtNum(size,0)+' shares'}</span></div>
          <span class="pill ${st.key}">${st.label}</span>
        </div>`;
      }).join('') + `</div>
      <div class="note-inline" style="margin-top:14px;">Straight from NSE's public issue feed. An IPO appearing here is not a suggestion to apply — a price band tells you the cost, not the value. Read the company's Red Herring Prospectus (filed with SEBI) before deciding anything.</div>`;
      meta.textContent = list.length + ' issue' + (list.length===1?'':'s') + ' listed';
      block.querySelectorAll('.ipo-card').forEach(card => {
        card.addEventListener('click', () => showIpoDetail(card.getAttribute('data-sym')));
      });
    }
  } catch {
    block.innerHTML = `<div class="note-inline">Couldn't reach NSE's IPO feed. NSE aggressively blocks automated access, so this endpoint is less reliable than the price feeds — try again in a moment.</div>`;
    meta.textContent = '';
  }
  btn.disabled = false; btn.textContent = 'Refresh IPOs';
}

async function showIpoDetailCore(symbol){
  const ip = ipoCache.find(x => x.symbol === symbol);
  const wrap = document.getElementById('ipoDetail');
  if (!ip || !wrap) return;
  const st = ipoStatus(ip);
  const band = parseBand(ip.issuePrice);
  const size = parseFloat(ip.issueSize);
  const raise = (band && !isNaN(size)) ? band.hi * size : null;

  wrap.innerHTML = `<div class="ipo-detail-card">
    <div class="detail-head">
      <div>
        <h3>${ip.companyName}</h3>
        <div class="meta-line"><span class="badge">${ip.symbol}</span><span class="badge">${ip.series||'EQ'}</span><span class="badge">${st.label}</span></div>
      </div>
      <div class="detail-actions"><button class="close-btn" id="closeIpo">Close ×</button></div>
    </div>
    <div class="metric-grid" style="margin-top:16px;">
      <div class="metric"><div class="k">Price band</div><div class="v">${band ? (band.lo===band.hi ? '₹'+fmtNum(band.lo,0) : '₹'+fmtNum(band.lo,0)+' – ₹'+fmtNum(band.hi,0)) : '—'}</div><div class="sub">Per share</div></div>
      <div class="metric"><div class="k">Issue size</div><div class="v">${isNaN(size)?'—':fmtNum(size,0)}</div><div class="sub">Shares offered</div></div>
      <div class="metric"><div class="k">Approx. raise at top</div><div class="v">${raise==null?'—':fmtCr(raise)}</div><div class="sub">Issue size × upper band</div></div>
      <div class="metric"><div class="k">Subscription window</div><div class="v" style="font-size:13px;">${ip.issueStartDate||'—'} → ${ip.issueEndDate||'—'}</div></div>
    </div>
    <div id="ipoLive"><div class="note-inline" style="margin-top:14px;">Checking whether this company is already trading…</div></div>
  </div>`;

  document.getElementById('closeIpo').addEventListener('click', () => { wrap.innerHTML = ''; });
  wrap.scrollIntoView({ behavior:'smooth', block:'start' });

  // If it has already listed, pull live post-listing performance vs the issue price.
  const live = document.getElementById('ipoLive');
  try {
    const h = await fetchHistory(ip.symbol + '.NS', '1mo', '1d');
    const closes = h.closes;
    const price = h.meta.regularMarketPrice != null ? h.meta.regularMarketPrice : closes[closes.length-1];
    const listPrice = closes[0];
    const vsIssue = band ? ((price - band.hi) / band.hi) * 100 : null;
    const vsList = listPrice ? ((price - listPrice) / listPrice) * 100 : null;
    live.innerHTML = `
      <div class="section-label" style="margin-top:20px;"><span>Since listing</span><span class="rule-line"></span></div>
      <div class="metric-grid">
        <div class="metric"><div class="k">Current price</div><div class="v">₹${fmtNum(price,2)}</div></div>
        <div class="metric"><div class="k">First close on record</div><div class="v">₹${fmtNum(listPrice,2)}</div></div>
        <div class="metric"><div class="k">Vs issue price (top band)</div><div class="v ${vsIssue>=0?'up':'down'}">${vsIssue==null?'—':fmtPct(vsIssue,1)}</div><div class="sub">Listing gain or loss for an allottee</div></div>
        <div class="metric"><div class="k">Vs first close</div><div class="v ${vsList>=0?'up':'down'}">${vsList==null?'—':fmtPct(vsList,1)}</div></div>
      </div>
      <div style="margin-top:12px;"><button class="ipo-open-full" data-sym="${ip.symbol}.NS" style="background:transparent;border:1px solid var(--hair);color:var(--cream-dim);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12.5px;">Open full analysis for ${ip.symbol} →</button></div>`;
    const b = live.querySelector('.ipo-open-full');
    if (b) b.addEventListener('click', () => openStock(ip.symbol + '.NS'));
  } catch {
    live.innerHTML = `<div class="note-inline" style="margin-top:14px;">Not trading yet — there's no market data until the shares list. Once listed, this panel will show price versus the issue band automatically.</div>`;
  }
}

export async function showIpoDetail(symbol){
  await showIpoDetailCore(symbol);
  const host = document.getElementById('ipoDetail');
  const h = host ? host.querySelector('h3') : null;
  await renderIpoExtras(h ? h.textContent.trim() : '');
}

export function ipoSearchLinks(name){
  const q = encodeURIComponent(name);
  return [
    ['NSE \u2014 upcoming issues', 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'],
    ['BSE \u2014 public issues', 'https://www.bseindia.com/publicissue.html'],
    ['SEBI \u2014 DRHP / RHP filings', 'https://www.sebi.gov.in/filings/public-issues'],
    ['Find the DRHP (prospectus)', 'https://www.google.com/search?q=' + q + '+DRHP+RHP+prospectus'],
    ['Financials & audited accounts', 'https://www.google.com/search?q=' + q + '+audited+financial+statements']
  ];
}

export async function renderIpoExtras(name){
  const host = document.getElementById('ipoDetail');
  if (!host || !name) return;
  const old = host.querySelector('#ipoExtras');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'ipoExtras';
  const links = ipoSearchLinks(name).map(function(p){
    return '<a class="news-item" href="' + p[1] + '" target="_blank" rel="noopener"><div class="news-title">' + p[0] + '</div></a>';
  }).join('');
  wrap.innerHTML =
    '<div class="section-label"><span>Filings &amp; documents</span><span class="rule-line"></span></div>' +
    '<div class="note-inline">Pre-listing financials and audit reports live in the DRHP/RHP, which are PDFs on SEBI and the exchanges. No free API returns them as structured data, so these link straight to the official sources.</div>' +
    '<div class="news-list" style="margin-top:10px">' + links + '</div>' +
    '<div class="section-label"><span>Recent news</span><span class="rule-line"></span></div>' +
    '<div id="ipoNews" class="news-list"><div class="note-inline">Fetching recent headlines\u2026</div></div>';
  host.appendChild(wrap);
  try {
    const items = await fetchNews(name + ' IPO');
    const box = document.getElementById('ipoNews');
    if (!box) return;
    box.innerHTML = items.map(function(it){
      var when = '';
      try { when = new Date(it.pubDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); } catch (err) { suppressed('ipo news: date parse', err); }
      return '<a class="news-item" href="' + it.link + '" target="_blank" rel="noopener"><div class="news-title">' + it.title + '</div><div class="news-meta">' + [it.source, when].filter(Boolean).join(' \u00b7 ') + '</div></a>';
    }).join('');
  } catch {
    const box = document.getElementById('ipoNews');
    if (box) box.innerHTML = '<div class="note-inline">Couldn\u2019t reach the news feed right now \u2014 try reopening this issue in a moment.</div>';
  }
}
