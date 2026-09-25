// The phone app shell: five tabs, a summary that never leaves the screen, and content
// that loads when you open a tab rather than when you press a button.
//
// WHAT THIS REPLACES
//
// The bottom nav used to be five anchors that scrolled a single very long page. Everything
// was in one fold: to reach the screener you scrolled past the watchlist, the IPO list and
// the ranking tables, and when you got there it said "Not loaded yet — pick a count and
// click Load." On a desktop, where the whole page is a legitimate document, that is fine.
// On a phone it is not an app.
//
// HOW IT WORKS, AND WHY THIS WAY
//
// The sections are moved into five panel wrappers once, and CSS decides whether panels are
// stacked (desktop, unchanged: every panel display:block, so the page reads exactly as it
// did) or switched (phone: only the active panel is shown). Nothing is conditional on the
// viewport in JavaScript, so rotating the phone or dragging a desktop window narrow does
// the right thing with no resize handling and no teardown path to get wrong.
//
// Moving a node with appendChild keeps its listeners, its id and its state, so every
// mount* function that already ran is undisturbed. That is why this runs at the very end
// of bootstrap: by then every section exists, including the ones built by JavaScript.
//
// AUTO-LOAD
//
// Each tab declares how to fill itself, and that runs once, the first time the tab is
// shown. Not at boot: the ranking alone scores a 55-stock universe, and doing that for
// four tabs the user has not opened would spend the whole connection budget before the
// first screen is usable. The Load buttons are left in place — they still mean "fetch
// again with fresh prices", which is a real thing to want, and the ranking's Re-run button
// is the only way to get it.

import { loadTop20 } from './top20.js';
import { loadMarketNews } from './market-news.js';

const TABS = [
  { id:'top20', label:'Top 20',   icon:'◉',
    sel:['section.search-panel','section.watchlist','#alertsSection','#top20Section'],
    load: loadTop20 },
  { id:'ipo',   label:'IPO',      icon:'▤',
    sel:['section.ipo'],
    load: () => clickOnce('loadIpos') },
  { id:'rank',  label:'Top perf', icon:'↑',
    sel:['#rankSection'],
    load: () => selectThenClick('rankLargeCount', '20', 'rankLargeBtn') },
  { id:'scr',   label:'Screener', icon:'☷',
    sel:['section.screener'],
    load: () => selectThenClick('scrLargeCount', '10', 'loadLargeCap') },
  { id:'more',  label:'News',     icon:'☰',
    sel:['#marketNewsSection','#glossarySection','#manualSection','#diagnosticsSection','.controls','.disclaimer'],
    load: loadMarketNews }
];

function clickOnce(id){
  const el = document.getElementById(id);
  if (el) el.click();
}

// The count selectors default to 10 and the ranking to 20. Setting the value before the
// click matters: the loaders read the select at click time, so setting it afterwards would
// show ten rows and then need a second press.
function selectThenClick(selectId, value, buttonId){
  const sel = document.getElementById(selectId);
  if (sel && [...sel.options].some(o => o.value === value)) sel.value = value;
  clickOnce(buttonId);
}

function injectShellStyles(){
  if (document.getElementById('mobileShellStyle')) return;
  const st = document.createElement('style');
  st.id = 'mobileShellStyle';
  st.textContent = [
    // Desktop and tablet: the page is exactly what it was. Panels are transparent
    // wrappers, the summary is the index card grid, and #mnav stays hidden.
    '.tabpanel{display:block}',
    // Default hidden, and turned on inside the phone query below. Without this the
    // button is a plain <button> on desktop — display:inline-block, so a "← Back"
    // control appears above every detail panel on a page that has nothing to go back to.
    '.detail-back{display:none}',

    '@media (max-width:760px){',
    '.tabpanel{display:none}',
    '.tabpanel.active{display:block}',

    // The summary: three indices and the market status, on screen on every tab. Sticky
    // rather than fixed so it participates in the flow and the panels below need no
    // magic top offset.
    'section.indices.summary{display:block;position:sticky;z-index:35;',
    'top:calc(var(--safe-t) + 52px);',
    'background:var(--ink);padding:8px 0 10px;margin:0 0 6px;',
    'border-bottom:1px solid var(--hair);overflow:visible}',
    'section.indices.summary .index-card{display:grid;grid-template-columns:1fr auto auto;',
    'align-items:baseline;gap:4px 10px;background:none;border:none;border-radius:0;',
    'padding:3px 0;flex:none}',
    'section.indices.summary .index-card .name{font-size:11.5px;letter-spacing:.06em}',
    // The long-form index description is the first thing to go: "NSE — 50 large-cap
    // benchmark" is useful on a desktop and is noise in a 20% strip.
    'section.indices.summary .index-card .full-name{display:none}',
    'section.indices.summary .index-card .price{font-size:15px;text-align:right;',
    'font-variant-numeric:tabular-nums}',
    'section.indices.summary .index-card .delta{font-size:11.5px;text-align:right;',
    'min-width:84px;font-variant-numeric:tabular-nums}',
    'section.indices.summary .index-card .stale{grid-column:1/-1;font-size:10px}',

    // The tab bar gets real labels and a selected state; before, nothing on screen said
    // which of the five you were looking at.
    '#mnav a.on{color:var(--gold)}',
    '#mnav a.on span.ic{transform:translateY(-1px)}',

    // The detail panel becomes a view of its own rather than something appended below the
    // list you tapped, which on a phone left you scrolled to the wrong place with no way
    // back but the browser button.
    'section.detail.as-view{display:block;position:relative;z-index:30}',
    '.detail-back{display:flex;align-items:center;gap:7px;background:none;border:none;',
    'color:var(--gold);font-family:var(--sans);font-size:13.5px;font-weight:600;',
    'padding:10px 2px;cursor:pointer;min-height:44px}',
    '.detail-back:active{opacity:.6}',
    'body.detail-open .tabpanel.active{display:none}',
    'body:not(.detail-open) .detail-back{display:none}',
    'body:not(.detail-open) section.detail{display:none}',

    // Market news.
    '.news-list{display:flex;flex-direction:column}',
    '.news-item{display:flex;flex-direction:column;gap:3px;padding:12px 2px;',
    'border-bottom:1px solid var(--hair);text-decoration:none}',
    '.news-item .t{color:var(--cream);font-size:14px;line-height:1.45}',
    '.news-item .m{color:var(--cream-dim);font-size:11px}',
    '.news-item:active{background:rgba(255,255,255,.05)}',
    '}',

    // Desktop keeps the news list too — it is a section like any other.
    '@media (min-width:761px){',
    '.news-list{display:flex;flex-direction:column}',
    '.news-item{display:flex;flex-direction:column;gap:3px;padding:11px 0;',
    'border-bottom:1px solid var(--hair);text-decoration:none}',
    '.news-item .t{color:var(--cream);font-size:14px}',
    '.news-item .m{color:var(--cream-dim);font-size:11.5px}',
    '.news-item:hover .t{color:var(--gold)}',
    '}'
  ].join('');
  document.head.appendChild(st);
}

let activeTab = null;
const loaded = Object.create(null);

export function showTab(id){
  const tab = TABS.find(t => t.id === id);
  if (!tab) return;
  activeTab = id;
  closeDetail();

  document.querySelectorAll('.tabpanel').forEach(p => {
    p.classList.toggle('active', p.getAttribute('data-tab') === id);
  });
  document.querySelectorAll('#mnav a').forEach(a => {
    const on = a.getAttribute('data-tab') === id;
    a.classList.toggle('on', on);
    // aria-current, not aria-selected: these are links to views, not ARIA tabs, and
    // claiming the tab role without managing focus and arrow keys is worse than not.
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  // Back to the top of the new view. Without this, switching from a long tab lands you
  // scrolled into the middle of a short one.
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (!loaded[id] && typeof tab.load === 'function'){
    loaded[id] = true;
    try { tab.load(); } catch (err) { loaded[id] = false; throw err; }
  }
}

export function openDetailView(){
  if (!document.getElementById('mobileShellStyle')) return;
  document.body.classList.add('detail-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function closeDetail(){
  document.body.classList.remove('detail-open');
}

export function mountMobileShell(){
  const wrap = document.querySelector('.wrap');
  const nav = document.getElementById('mnav');
  if (!wrap) return;
  if (document.querySelector('.tabpanel')) return;

  injectShellStyles();

  const indices = document.getElementById('indicesGrid');
  if (indices) indices.classList.add('summary');

  const detail = document.querySelector('section.detail');
  if (detail){
    detail.classList.add('as-view');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'detail-back';
    back.innerHTML = '<span aria-hidden="true">←</span> Back';
    back.addEventListener('click', () => { closeDetail(); window.scrollTo({ top: 0 }); });
    detail.insertBefore(back, detail.firstChild);
  }

  // Build the panels in tab order and fill them by moving the existing sections in. A
  // selector that matches nothing is skipped rather than throwing: #diagnosticsSection
  // only exists once mountDiagnostics has run, and a future section may be removed
  // without this list being the thing that breaks.
  TABS.forEach(tab => {
    const panel = document.createElement('div');
    panel.className = 'tabpanel';
    panel.setAttribute('data-tab', tab.id);
    wrap.appendChild(panel);
    // Collect first, then move in DOCUMENT order rather than in the order this list
    // happens to be written. The list is grouped by meaning, and appending in that order
    // silently reordered the page: mountManual deliberately places the user manual above
    // the glossary with insertBefore, and listing glossary first moved the manual below
    // it. On a phone nobody would notice; on a desktop the whole page is one document and
    // a spec caught it. Sorting here means the grouping can be written for readability
    // and can never rewrite the reading order.
    const found = tab.sel
      .map(sel => wrap.querySelector(sel) || document.querySelector(sel))
      .filter(el => el && el !== panel && !panel.contains(el));
    const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING
    found.sort((a, b) => (a.compareDocumentPosition(b) & FOLLOWING) ? -1 : 1);
    found.forEach(el => panel.appendChild(el));
  });

  // The detail view sits after the panels, outside all of them, because it is reachable
  // from a row in several of them.
  if (detail) wrap.appendChild(detail);

  if (nav){
    nav.innerHTML = TABS.map(t =>
      '<a href="#" data-tab="' + t.id + '"><span class="ic" aria-hidden="true">' +
      t.icon + '</span>' + t.label + '</a>').join('');
    nav.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-tab]');
      if (!a) return;
      e.preventDefault();
      showTab(a.getAttribute('data-tab'));
    });
  }

  showTab(TABS[0].id);
}

export function activeTabId(){ return activeTab; }
