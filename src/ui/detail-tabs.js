// Sub-tabs on the stock detail page, on a phone.
//
// The detail card is twenty-five blocks in one scroll — snapshot, chart, technicals, risk,
// day-trading, peers, news, fundamentals, profile, price action, patterns, DCF, earnings
// quality, options, factors, thesis, probability lab. On a desktop that is a long document
// and reads fine. On a phone the option chain is a dozen thumb-flicks below the price, and
// nothing on screen says it exists. Groww and Tickertape both split this page into tabs.
//
//   Overview    key stats, the price chart, the snapshot table, the company profile
//   Technicals  indicators, risk and momentum, the day-trading desk, price action, patterns
//   Financials  fundamentals, earnings quality, peers, shareholding
//   Valuation   the DCF, factor decomposition, the thesis walkthrough, the probability lab
//   Options     the option chain and the probabilities it implies
//   News        headlines for this company
//
// The price chart is on Overview, not a tab of its own. That is where Groww puts it, and it
// also sidesteps a real failure: charts size their canvas from clientWidth, which is zero
// inside a hidden tab, so a chart drawn while its tab was hidden would render blank.
//
// HOW, AND WHY THIS WAY
//
// The card is not built in one go. detail.js writes the template, then app.js inserts the
// deep-analysis, options, factor, thesis and lab blocks as their data arrives, seconds
// apart. So classification cannot happen once: a MutationObserver re-runs it whenever the
// card's children change. Each block gets a data-dtab attribute and CSS hides the ones that
// do not match the active tab — the same CSS-not-JavaScript approach as the app shell, so
// on a desktop nothing is hidden and the page is exactly what it was.
//
// A block this file has never heard of inherits the tab of the section label above it, and
// falls back to Overview. It is never hidden from every tab; a new block added to the card
// later is visible somewhere by construction.

const TABS = [
  { id:'overview',   label:'Overview' },
  { id:'technicals', label:'Technicals' },
  { id:'financials', label:'Financials' },
  { id:'valuation',  label:'Valuation' },
  { id:'options',    label:'Options' },
  { id:'news',       label:'News' }
];

const BY_ID = {
  snapBlock:'overview', profileBlock:'overview',
  intradayBlock:'technicals',
  fundamentalsGrid:'financials', peerBlock:'financials', shareBlock:'financials', compareBlock:'financials',
  facBlock:'valuation', thesisBlock:'valuation', labBlock:'valuation',
  optBlock:'options',
  newsBlock:'news'
};

const BY_CLASS = [
  ['range-bars', 'overview'], ['stat-row', 'overview'], ['chart-block', 'overview']
];

// Matched by prefix: the glossary annotator appends a marker to some labels.
const BY_LABEL = [
  ['Technicals', 'technicals'], ['Risk & momentum', 'technicals'], ['Day-trading desk', 'technicals'],
  ['Price action', 'technicals'], ['Candlestick patterns', 'technicals'],
  ['Fundamentals', 'financials'], ['Earnings quality', 'financials'],
  ['Peer comparison', 'financials'], ['Compare', 'financials'], ['Shareholding', 'financials'],
  ['Intrinsic value', 'valuation'],
  ['Recent news', 'news'],
  ['Company profile', 'overview']
];

// Always on screen, whichever tab is active: who this is and what it costs.
const HEADER_CLASSES = ['detail-head', 'price-hero', 'dtabs'];

// Blocks whose CHILDREN are classified individually, because one block holds sections that
// belong on different tabs. #deepBlock carries price action and candlestick patterns
// (technical) alongside the DCF (valuation) and earnings quality (financial).
const SPLIT = new Set(['deepBlock']);

function tabForLabel(text){
  const t = text.trim();
  const hit = BY_LABEL.find(([prefix]) => t.startsWith(prefix));
  return hit ? hit[1] : null;
}

export function classifyChildren(container, inherited = 'overview'){
  let current = inherited;
  for (const el of container.children){
    if (HEADER_CLASSES.some(c => el.classList.contains(c))) continue;
    if (SPLIT.has(el.id)){
      el.removeAttribute('data-dtab');
      classifyChildren(el, current);
      continue;
    }
    let tab = null;
    if (el.classList.contains('section-label')){
      tab = tabForLabel(el.textContent) || current;
      current = tab;
    } else {
      tab = BY_ID[el.id] || (BY_CLASS.find(([c]) => el.classList.contains(c)) || [])[1] || current;
    }
    if (el.getAttribute('data-dtab') !== tab) el.setAttribute('data-dtab', tab);
  }
}

function injectStyles(){
  if (document.getElementById('detailTabsStyle')) return;
  const st = document.createElement('style');
  st.id = 'detailTabsStyle';
  const hide = TABS.map(t =>
    `#detailCard[data-active="${t.id}"] [data-dtab]:not([data-dtab="${t.id}"]){display:none!important}`
  ).join('');
  st.textContent =
    // Desktop: no tab bar, nothing hidden.
    '.dtabs{display:none}' +
    '@media (max-width:760px){' +
    '.dtabs{display:flex;gap:2px;overflow-x:auto;margin:14px -13px 4px;padding:0 13px;' +
    'border-bottom:1px solid var(--hair);-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '.dtabs::-webkit-scrollbar{display:none}' +
    '.dtabs button{flex:0 0 auto;background:none;border:none;border-bottom:2px solid transparent;' +
    'color:var(--cream-dim);font-family:var(--sans);font-size:13px;font-weight:600;' +
    'padding:11px 11px 10px;min-height:44px;cursor:pointer;white-space:nowrap}' +
    '.dtabs button[aria-selected="true"]{color:var(--gold);border-bottom-color:var(--gold)}' +
    '.dtabs button:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}' +
    hide +
    '}';
  document.head.appendChild(st);
}

function tabBarHtml(active){
  return TABS.map(t =>
    `<button type="button" role="tab" data-dtab-btn="${t.id}" aria-selected="${t.id === active}">${t.label}</button>`
  ).join('');
}

export function setDetailTab(id){
  const card = document.getElementById('detailCard');
  if (!card || !TABS.some(t => t.id === id)) return;
  card.setAttribute('data-active', id);
  card.querySelectorAll('.dtabs button').forEach(b =>
    b.setAttribute('aria-selected', String(b.getAttribute('data-dtab-btn') === id)));
  // Charts draw at the width of their canvas, which may have changed while this tab was
  // hidden (the phone rotated, the keyboard opened). drawChart is already bound to resize.
  if (id === 'overview') window.dispatchEvent(new window.Event('resize'));
  keepTabBarInView(card);
}

// A long tab scrolls the bar off the top. Switching from there should land on the start of
// the new tab, not somewhere in its middle — measured against the sticky header and summary
// strip, which would otherwise cover the bar.
function keepTabBarInView(card){
  const bar = card.querySelector('.dtabs');
  if (!bar) return;
  const covered = [document.querySelector('header.masthead'), document.getElementById('indicesGrid')]
    .filter(Boolean)
    .map(el => el.getBoundingClientRect())
    .filter(r => r.height > 0)
    .reduce((max, r) => Math.max(max, r.bottom), 0);
  const top = bar.getBoundingClientRect().top;
  if (top < covered) window.scrollBy({ top: top - covered - 4, behavior: 'auto' });
}

function ensureTabBar(card){
  if (card.querySelector(':scope > .dtabs')) return;
  const hero = card.querySelector(':scope > .price-hero');
  // Still showing "Loading RELIANCE…": nothing to put a tab bar above yet.
  if (!hero) return;
  const bar = document.createElement('div');
  bar.className = 'dtabs';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', 'Sections of this stock');
  bar.innerHTML = tabBarHtml('overview');
  hero.after(bar);
  // A freshly rendered card is a different stock. It opens on Overview, whatever tab the
  // previous one was left on.
  card.setAttribute('data-active', 'overview');
}

export function mountDetailTabs(){
  const card = document.getElementById('detailCard');
  if (!card || card.dataset.dtabsMounted) return;
  card.dataset.dtabsMounted = '1';
  injectStyles();

  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dtab-btn]');
    if (b && card.contains(b)) setDetailTab(b.getAttribute('data-dtab-btn'));
  });

  // Run straight from the observer. MutationObserver already delivers every change made in
  // one task as a single callback, so a block that inserts several nodes is one pass.
  //
  // This used to defer to requestAnimationFrame, and that was a real bug: rAF does not fire
  // while the page is hidden, so a card rendered while the app was in the background got no
  // tab bar and no classification until something else happened to repaint it.
  //
  // Not subtree-wide: the chart tooltip rewrites its innerHTML on every pointer move, and
  // re-classifying on that is waste.
  let watchedDeep = null;
  const schedule = () => run();
  // #deepBlock is split by its own children, which it fills after it is inserted, so it
  // needs its own watch — re-attached whenever a new stock recreates the element.
  const deepWatch = new MutationObserver(schedule);
  function run(){
    ensureTabBar(card);
    const deep = document.getElementById('deepBlock');
    if (deep && deep !== watchedDeep){
      deepWatch.disconnect();
      deepWatch.observe(deep, { childList: true });
      watchedDeep = deep;
    }
    classifyChildren(card);
  }
  new MutationObserver(schedule).observe(card, { childList: true });
  run();
}

export const DETAIL_TABS = TABS.map(t => t.id);
