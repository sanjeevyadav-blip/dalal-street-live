// Market-wide headlines.
//
// Until now news existed only inside a stock's detail panel, so there was no way to ask
// "what happened today" without first picking a company. This is the same Bing RSS feed
// (Google returns 503 to Cloudflare IPs — docs/06) pointed at the market rather than at
// one name.
//
// These are unfiltered search results. The section says so, because a headline list next
// to a valuation model reads as though someone vetted it, and nobody has.

import { fetchNews } from '../data/news.js';
import { suppressed } from '../suppressed.js';

const QUERY = 'NSE BSE Sensex Nifty Indian';

let started = false;

export function mountMarketNews(){
  if (document.getElementById('marketNewsSection')) return;
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  // Above the manual, not just above the glossary. The phone shell keeps sections in
  // document order inside a tab, and the News tab should open on the news rather than on
  // the user manual with the headlines somewhere below it.
  const anchor = document.getElementById('manualSection')
    || document.getElementById('glossarySection');

  const sec = document.createElement('section');
  sec.className = 'screener';
  sec.id = 'marketNewsSection';
  sec.innerHTML =
    '<div class="section-head"><h2>Market news</h2>' +
    '<span class="hint">Headlines matching the Indian market, newest first — search results, not vetted analysis</span></div>' +
    '<div id="marketNewsBody"><p class="screener-note">Loading headlines…</p></div>';

  if (anchor) wrap.insertBefore(sec, anchor); else wrap.appendChild(sec);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function when(pubDate){
  const t = Date.parse(pubDate);
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

export function loadMarketNews(){
  if (started) return Promise.resolve();
  started = true;
  const body = document.getElementById('marketNewsBody');
  if (!body) return Promise.resolve();

  return fetchNews(QUERY).then(items => {
    body.innerHTML = '<div class="news-list">' + items.map(n => {
      const age = when(n.pubDate);
      // The whole item is the link, so the tap target is the row rather than the text.
      // target=_blank with rel=noopener: inside the Capacitor shell ui/native.js turns
      // these into a Chrome Custom Tab instead of navigating the WebView away from the app.
      return '<a class="news-item" href="' + escapeHtml(n.link) + '" target="_blank" rel="noopener">' +
        '<span class="t">' + escapeHtml(n.title) + '</span>' +
        '<span class="m">' + escapeHtml(n.source || 'Bing News') +
        (age ? ' · ' + age : '') + '</span></a>';
    }).join('') + '</div>';
  }).catch(err => {
    // Consistent with every other block: say the feed failed, do not invent headlines and
    // do not leave "Loading…" on screen forever.
    suppressed('market news', err);
    started = false;
    body.innerHTML = '<p class="screener-note">Headlines are unavailable right now — ' +
      'the news feed did not respond. Everything else on this page is unaffected.</p>';
  });
}
