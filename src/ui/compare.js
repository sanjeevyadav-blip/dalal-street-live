// Compare: the open stock and any other, side by side.
//
// The peer table answers "how does this sit among its neighbours". This answers the other
// question people bring to Screener: "I am choosing between these two." Any stock on the NSE
// list can be the second one — it uses the same search index as the main search box.
//
// DELIBERATELY NEUTRAL. The table shows both values and says nothing about which is better.
// A lower P/E is not better if the business is shrinking, and a higher ROE is not better if
// it is bought with leverage; colouring one column as the winner would be a verdict, and
// this app does not issue verdicts (hard rule 1). Returns are coloured up/down because that
// is a fact about direction, not a judgement.

import { fetchHistory, fetchFundamentals, val, resolvePrevClose } from '../data/yahoo.js';
import { localMatches } from '../data/search.js';
import { fmtNum, fmtCr } from './format.js';
import { rsiLast } from '../indicators/momentum.js';
import { suppressed } from '../suppressed.js';

// label, how to read it off a snapshot, how to format it, and whether the sign carries
// direction (and so earns up/down colouring).
const METRICS = [
  ['Price',              s => s.price,     v => '₹' + fmtNum(v, 2)],
  ['1-day change',       s => s.chg1d,     v => fmtNum(v, 2) + '%', true],
  ['1-year change',      s => s.chg1y,     v => fmtNum(v, 1) + '%', true],
  ['Market cap',         s => s.mcap,      v => fmtCr(v)],
  ['P/E (trailing)',     s => s.pe,        v => fmtNum(v, 1)],
  ['P/B',                s => s.pb,        v => fmtNum(v, 1)],
  ['ROE',                s => s.roe,       v => fmtNum(v * 100, 1) + '%'],
  ['Profit margin',      s => s.margin,    v => fmtNum(v * 100, 1) + '%'],
  ['Revenue growth YoY', s => s.revGrowth, v => fmtNum(v * 100, 1) + '%', true],
  ['Earnings growth YoY',s => s.epsGrowth, v => fmtNum(v * 100, 1) + '%', true],
  ['Debt / equity',      s => s.de,        v => fmtNum(v, 0)],
  ['Dividend yield',     s => s.divY,      v => fmtNum(v * 100, 2) + '%'],
  ['Beta',               s => s.beta,      v => fmtNum(v, 2)],
  ['RSI (14)',           s => s.rsi,       v => fmtNum(v, 0)]
];

export const COMPARE_METRIC_LABELS = METRICS.map(m => m[0]);

/** Everything the table needs for one stock. Missing pieces stay null, never zero. */
export async function snapshot(symbol){
  const h = await fetchHistory(symbol, '1y', '1d');
  const c = h.closes, meta = h.meta;
  const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : c[c.length - 1];
  const prev = resolvePrevClose(meta, c, price);
  let f = null;
  try { f = await fetchFundamentals(symbol); } catch (err) { suppressed('compare: fundamentals', err); }
  const sd = (f && f.summaryDetail) || {}, ks = (f && f.defaultKeyStatistics) || {};
  const fd = (f && f.financialData) || {}, pr = (f && f.price) || {};
  return {
    symbol,
    name: pr.shortName || pr.longName || symbol.replace(/\.(NS|BO)$/, ''),
    price,
    chg1d: prev ? ((price - prev) / prev) * 100 : null,
    chg1y: c.length > 1 ? ((price / c[0]) - 1) * 100 : null,
    mcap: val(sd.marketCap),
    pe: val(sd.trailingPE),
    pb: val(ks.priceToBook),
    roe: val(fd.returnOnEquity),
    margin: val(fd.profitMargins),
    revGrowth: val(fd.revenueGrowth),
    epsGrowth: val(fd.earningsGrowth),
    de: val(fd.debtToEquity),
    divY: val(sd.dividendYield),
    beta: val(sd.beta) != null ? val(sd.beta) : val(ks.beta),
    rsi: rsiLast(c, 14)
  };
}

function cell(s, [, read, fmt, directional]){
  const v = s ? read(s) : null;
  if (v == null || !Number.isFinite(v)) return '<td class="num">—</td>';
  const cls = directional ? (v >= 0 ? ' up' : ' down') : '';
  return '<td class="num' + cls + '">' + fmt(v) + '</td>';
}

export function compareTableHtml(a, b){
  const head = (s) => '<th>' + escapeHtml(s.symbol.replace(/\.(NS|BO)$/, '')) +
    '<span class="cmp-name">' + escapeHtml(s.name) + '</span></th>';
  return '<div class="rank-scroll"><table class="book compare-table">' +
    '<thead><tr><th>Metric</th>' + head(a) + head(b) + '</tr></thead><tbody>' +
    METRICS.map(m => '<tr><td class="k">' + m[0] + '</td>' + cell(a, m) + cell(b, m) + '</tr>').join('') +
    '</tbody></table></div>';
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/** Render the compare control into #compareBlock for the stock that is open. */
export function mountCompare(symbol){
  const block = document.getElementById('compareBlock');
  if (!block) return;
  const self = symbol.replace(/\.(NS|BO)$/, '');
  block.innerHTML =
    '<div class="cmp-pick">' +
      '<label for="cmpInput">Compare ' + escapeHtml(self) + ' with</label>' +
      '<div class="cmp-search"><input type="text" id="cmpInput" autocomplete="off" placeholder="Type a company or ticker">' +
      '<div class="suggestions" id="cmpSuggest"></div></div>' +
    '</div>' +
    '<div id="cmpOut"></div>';

  const input = document.getElementById('cmpInput');
  const box = document.getElementById('cmpSuggest');
  const out = document.getElementById('cmpOut');
  let token = 0;

  input.addEventListener('input', () => {
    const matches = localMatches(input.value, 8).filter(m => m.sym !== self);
    if (!matches.length){ box.classList.remove('show'); box.innerHTML = ''; return; }
    box.innerHTML = matches.map(m =>
      '<div class="item" data-sym="' + escapeHtml(m.sym) + '"><span class="sy">' + escapeHtml(m.sym) +
      '</span><span class="nm">' + escapeHtml(m.name) + '</span></div>').join('');
    box.classList.add('show');
  });

  box.addEventListener('click', async (e) => {
    const item = e.target.closest('.item');
    if (!item) return;
    const other = item.getAttribute('data-sym') + '.NS';
    input.value = item.getAttribute('data-sym');
    box.classList.remove('show');
    const mine = ++token;
    out.innerHTML = '<div class="note-inline">Fetching both companies…</div>';
    try {
      const [a, b] = await Promise.all([snapshot(symbol), snapshot(other)]);
      if (mine !== token || !document.getElementById('cmpOut')) return;
      out.innerHTML = compareTableHtml(a, b) +
        '<div class="note-inline" style="margin-top:10px">Neither column is marked as better. ' +
        'A lower P/E is not better if the business is shrinking, and a higher ROE is not better if it is bought with debt.</div>';
    } catch (err) {
      suppressed('compare: history', err);
      if (mine !== token) return;
      out.innerHTML = '<div class="note-inline">Could not load ' + escapeHtml(input.value) +
        ' — the price feed did not respond for it. Try again, or pick another company.</div>';
    }
  });

  installOutsideClick();
}

// Once, not per stock: mountCompare runs every time a stock is opened, and a document
// listener added on each run would pile up — one per stock viewed this session. This one
// looks the elements up at click time, so it keeps working after the card is re-rendered.
let outsideClickInstalled = false;
function installOutsideClick(){
  if (outsideClickInstalled) return;
  outsideClickInstalled = true;
  document.addEventListener('click', (e) => {
    const box = document.getElementById('cmpSuggest');
    const input = document.getElementById('cmpInput');
    if (box && !box.contains(e.target) && e.target !== input) box.classList.remove('show');
  });
}
