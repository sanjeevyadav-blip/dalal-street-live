// Headline search.
//
// Bing RSS, not Google News: Google returns 503 "automated queries" to Cloudflare IPs, and
// Yahoo's v1/finance/search returns generic US headlines whatever you ask it for. Both were
// tested and are recorded as dead ends in docs/06.
//
// These are unfiltered search results, not vetted analysis.

import { fetchTextThroughProxy } from './proxy.js';

export async function fetchNews(companyName){
  const q = encodeURIComponent(companyName + ' stock');
  const url = 'https://www.bing.com/news/search?q=' + q + '&format=RSS';
  const xml = await fetchTextThroughProxy(url);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const items = Array.from(doc.querySelectorAll('item')).slice(0,10).map(item => {
    const get = tag => { const el = item.querySelector(tag); return el ? el.textContent : ''; };
    return { title: get('title'), link: get('link'), pubDate: get('pubDate'), source: get('source') };
  });
  if (!items.length) throw new Error('No news items parsed');
  return items;
}
