// Headlines for the open stock.
//
// Unfiltered search results, not vetted analysis — the UI says so, and it must keep saying
// so. These are pulled live at the moment a stock is opened, so they are never stale, but
// never curated either.

export function renderNews(items){
  const block = document.getElementById('newsBlock');
  if (!block) return;
  block.innerHTML = items.map(it => {
    let when = '';
    try { when = new Date(it.pubDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); } catch { when = ''; }
    return `<a class="news-item" href="${it.link}" target="_blank" rel="noopener">
      <div class="news-title">${it.title}</div>
      <div class="news-meta">${[it.source, when].filter(Boolean).join(' · ')}</div>
    </a>`;
  }).join('');
}

export function renderNewsUnavailable(){
  const block = document.getElementById('newsBlock');
  if (block) block.innerHTML = `<div class="note-inline">Couldn't reach the news feed right now (the relay may be rate-limited) — try reopening this stock in a moment.</div>`;
}
