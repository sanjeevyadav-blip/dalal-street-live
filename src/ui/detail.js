// The stock detail panel: the core render, and the declared list of blocks that follow it.
//
// WHAT THIS REPLACED
//
// Until PR-8 the panel was assembled by reassigning renderDetailCore three times:
//
//   const __orig = renderDetailCore;
//   renderDetailCore = function(s, h, n){ __orig(s, h, n); renderDeepAnalysis(...); };
//   const __prev = renderDetailCore;
//   renderDetailCore = function(s, h, n){ __prev(s, h, n); setTimeout(..., 400); };
//   const __before = renderDetailCore;
//   renderDetailCore = function(s, h, n){ __before(s, h, n); setTimeout(..., 200); };
//
// Recovering the render order meant reading three wraps in reverse and comparing two timer
// values. DETAIL_BLOCKS below states it once.
//
// TIMING IS PRESERVED EXACTLY, and deliberately so. The delays are not decoration:
//
//   - Nothing is awaited. Each block starts and its promise is dropped, so the four async
//     blocks fetch CONCURRENTLY. Awaiting them in a loop would serialise four independent
//     network round trips and make the panel materially slower.
//   - The 0/200/400ms stagger lets the synchronous core render paint before the blocks
//     that fetch begin competing for the connection pool.
//
// DOM ORDER DOES NOT DEPEND ON THE DELAYS, which is worth knowing before anyone tunes them.
// Every block appends its placeholder synchronously, before its first await, so position is
// fixed by the order blocks are entered — not by how long their fetches take. And the
// snapshot does not append at all: it inserts itself before .chart-block, so it sits above
// the chart whatever its delay. Final order is: core header, snapshot, chart, deep
// analysis, options, factors.
//
// Per-block error boundaries (EPIC-4 story E4-2) live in runBlock below: each block is
// wrapped so one dead feed renders its own failure state instead of taking the panel with
// it. The promise is caught, never awaited — see runBlock.

import { NIFTY_SYMBOL } from '../data/universes.js';
import { cagrPct, rsiLast, rsiSeriesFull, stochasticLast } from '../indicators/momentum.js';
import { pivotPoints } from '../indicators/patterns.js';
import { macdLast, macdSeriesFull, obvTrend, smaSeries } from '../indicators/trend.js';
import { average } from '../indicators/util.js';
import { annualizedVolPct, atrLast, betaAndCorrelation, bollingerLast, bollingerSeriesFull, dailyReturnsByDate, maxDrawdownPct, sharpeStyleApprox } from '../indicators/volatility.js';
import { drawChart } from './charts.js';
import { renderDeepAnalysis } from './deep-analysis.js';
import { detailState } from './detail-state.js';
import { renderFactors } from './factors-block.js';
import { fmtNum, fmtPct } from './format.js';
import { renderOptions } from './options-block.js';
import { renderSnapshot } from './snapshot.js';
import { addSymbolToWatchlist } from './watchlist.js';
import { showError } from './errors.js';
import { suppressed } from '../suppressed.js';
import { renderProbabilityLab } from './probability-lab.js';

function renderDetailCore(symbol, hist, niftyHist){
  const meta = hist.meta;
  const closes = hist.closes, highs = hist.highs, lows = hist.lows, dates = hist.dates;
  const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : closes[closes.length-1];
  const prevClose = meta.previousClose != null ? meta.previousClose : (meta.chartPreviousClose != null ? meta.chartPreviousClose : closes[closes.length-2]);
  const change = price - prevClose, changePct = (change/prevClose)*100;
  const up = change >= 0;
  const dayHigh = meta.regularMarketDayHigh != null ? meta.regularMarketDayHigh : highs[highs.length-1];
  const dayLow = meta.regularMarketDayLow != null ? meta.regularMarketDayLow : lows[lows.length-1];
  const wkHigh = meta.fiftyTwoWeekHigh != null ? meta.fiftyTwoWeekHigh : Math.max(...highs.slice(-252));
  const wkLow = meta.fiftyTwoWeekLow != null ? meta.fiftyTwoWeekLow : Math.min(...lows.slice(-252));
  const volume = meta.regularMarketVolume != null ? meta.regularMarketVolume : hist.volumes[hist.volumes.length-1];
  const avgVol20 = average(hist.volumes.slice(-20));

  const sma20 = smaSeries(closes,20), sma50 = smaSeries(closes,50), sma100 = smaSeries(closes,100), sma200 = smaSeries(closes,200);
  const rsi14 = rsiLast(closes,14);
  const macd = macdLast(closes);
  const boll = bollingerLast(closes,20,2);
  const atr14 = atrLast(highs, lows, closes, 14);
  const vol = annualizedVolPct(closes);

  const rsiFull = rsiSeriesFull(closes,14);
  const macdFull = macdSeriesFull(closes);
  const bollFull = bollingerSeriesFull(closes,20,2);
  const oneYClose = closes.slice(-252), oneYDates = dates.slice(-252);
  const cagr1y = cagrPct(oneYDates, oneYClose);
  const maxDD = maxDrawdownPct(oneYClose);
  const sharpeApprox = sharpeStyleApprox(cagr1y, vol, 7);
  const stoch = stochasticLast(highs, lows, closes, 14, 3);
  const obv = obvTrend(closes, hist.volumes);
  const pivots = pivotPoints(highs, lows, closes);

  let beta=null, corr=null;
  if (symbol !== NIFTY_SYMBOL){
    const sMap = dailyReturnsByDate(dates, closes);
    const nMap = dailyReturnsByDate(niftyHist.dates, niftyHist.closes);
    const bc = betaAndCorrelation(sMap, nMap); beta = bc.beta; corr = bc.corr;
  }

  detailState.chartData = { dates, closes, sma50, sma200, volumes: hist.volumes, bollUpper: bollFull.upper, bollLower: bollFull.lower, rsiFull, macdFull };

  const dayPct = ((price - dayLow) / ((dayHigh-dayLow)||1)) * 100;
  const wkPct = ((price - wkLow) / ((wkHigh-wkLow)||1)) * 100;

  const lastSma = v => v==null ? '—' : fmtNum(v,2);
  const priceVsMa = (ma) => ma==null ? '' : (price>=ma ? '<span class="up">above</span>' : '<span class="down">below</span>');
  const rsiLabel = rsi14==null ? '—' : (rsi14>70 ? 'Overbought' : rsi14<30 ? 'Oversold' : 'Neutral');
  const macdLabel = macd.hist>=0 ? 'Bullish crossover' : 'Bearish crossover';

  document.getElementById('detailCard').innerHTML = `
    <div class="detail-head">
      <div>
        <h3>${meta.longName || meta.shortName || symbol}</h3>
        <div class="meta-line">
          <span class="badge">${symbol}</span>
          <span class="badge">${meta.fullExchangeName || meta.exchangeName || (symbol.endsWith('.BO')?'BSE':'NSE')}</span>
          <span id="profileBadges"></span>
        </div>
      </div>
      <div class="detail-actions">
        <button id="addFromDetail">+ Watchlist</button>
        <button class="close-btn" id="closeDetail">Close ×</button>
      </div>
    </div>

    <div class="price-hero">
      <span class="big">₹${fmtNum(price,2)}</span>
      <span class="chg ${up?'up':'down'}">${up?'▲':'▼'} ${fmtNum(Math.abs(change),2)} (${fmtNum(Math.abs(changePct),2)}%)</span>
      <span class="asof">as of ${meta.regularMarketTime ? new Date(meta.regularMarketTime*1000).toLocaleString('en-IN',{hour12:false}) : '—'}</span>
    </div>

    <div class="range-bars">
      <div class="range-bar-block">
        <div class="lbl"><span>Day low ₹${fmtNum(dayLow,2)}</span><span>Day high ₹${fmtNum(dayHigh,2)}</span></div>
        <div class="range-track"><div class="range-fill-dot" style="left:${Math.max(0,Math.min(100,dayPct))}%"></div></div>
      </div>
      <div class="range-bar-block">
        <div class="lbl"><span>52w low ₹${fmtNum(wkLow,2)}</span><span>52w high ₹${fmtNum(wkHigh,2)}</span></div>
        <div class="range-track"><div class="range-fill-dot" style="left:${Math.max(0,Math.min(100,wkPct))}%"></div></div>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat"><div class="k">Prev close</div><div class="v">₹${fmtNum(prevClose,2)}</div></div>
      <div class="stat"><div class="k">Volume</div><div class="v">${fmtNum(volume,0)}</div></div>
      <div class="stat"><div class="k">Avg vol (20d)</div><div class="v">${fmtNum(avgVol20,0)}</div></div>
      <div class="stat" id="vwapStat"><div class="k">Intraday VWAP</div><div class="v loading-dots">fetching…</div></div>
      <div class="stat"><div class="k">Market cap</div><div class="v" id="mcapStat">—</div></div>
    </div>

    <div class="chart-block">
      <div class="chart-head">
        <div class="range-btns" id="rangeBtns">
          <button data-range="1m">1M</button><button data-range="3m">3M</button>
          <button data-range="6m">6M</button><button data-range="1y" class="active">1Y</button>
          <button data-range="2y">2Y</button>
        </div>
        <div class="legend"><span class="l-price">Close</span><span class="l-sma50">50 DMA</span><span class="l-sma200">200 DMA</span></div>
      </div>
      <div class="chart-wrap">
        <canvas id="priceChart"></canvas>
        <div class="chart-tooltip" id="chartTooltip"></div>
      </div>
      <div class="subplot-label">Volume</div>
      <div class="subplot-wrap"><canvas id="volumeChart"></canvas></div>
      <div class="subplot-label">RSI (14) — dashed lines at 30 / 70</div>
      <div class="subplot-wrap"><canvas id="rsiChart"></canvas></div>
      <div class="subplot-label">MACD (12, 26, 9)</div>
      <div class="subplot-wrap"><canvas id="macdChart"></canvas></div>
    </div>

    <div class="section-label"><span>Technicals</span><span class="rule-line"></span></div>
    <div class="metric-grid">
      <div class="metric"><div class="k">RSI (14)</div><div class="v">${rsi14==null?'—':fmtNum(rsi14,1)}</div>
        <div class="gauge-track">${rsi14!=null?`<div class="gauge-dot" style="left:${rsi14}%"></div>`:''}</div>
        <div class="sub">${rsiLabel}</div></div>
      <div class="metric"><div class="k">MACD (12,26,9)</div><div class="v ${macd.hist>=0?'up':'down'}">${fmtNum(macd.macd,2)} / ${fmtNum(macd.signal,2)}</div><div class="sub">Hist ${fmtNum(macd.hist,2)} — ${macdLabel}</div></div>
      <div class="metric"><div class="k">Bollinger %B (20,2)</div><div class="v">${fmtNum(boll.percentB*100,1)}%</div><div class="sub">Band ₹${fmtNum(boll.lower,0)} – ₹${fmtNum(boll.upper,0)}</div></div>
      <div class="metric"><div class="k">ATR (14)</div><div class="v">₹${atr14==null?'—':fmtNum(atr14,2)}</div><div class="sub">${atr14==null?'':fmtPct(atr14/price*100,2)+' of price'}</div></div>
      <div class="metric"><div class="k">Historical volatility</div><div class="v">${fmtPct(vol,1)}</div><div class="sub">Annualised, 1y daily returns</div></div>
      <div class="metric"><div class="k">Beta vs Nifty 50</div><div class="v">${beta==null?'—':fmtNum(beta,2)}</div><div class="sub">${corr==null?'':'Correlation '+fmtNum(corr,2)}</div></div>
      <div class="metric"><div class="k">20 / 50 DMA</div><div class="v">₹${lastSma(sma20[sma20.length-1])} / ₹${lastSma(sma50[sma50.length-1])}</div><div class="sub">Price ${priceVsMa(sma20[sma20.length-1])} 20D, ${priceVsMa(sma50[sma50.length-1])} 50D</div></div>
      <div class="metric"><div class="k">100 / 200 DMA</div><div class="v">₹${lastSma(sma100[sma100.length-1])} / ₹${lastSma(sma200[sma200.length-1])}</div><div class="sub">Price ${priceVsMa(sma100[sma100.length-1])} 100D, ${priceVsMa(sma200[sma200.length-1])} 200D</div></div>
    </div>

    <div class="section-label"><span>Risk &amp; momentum</span><span class="rule-line"></span></div>
    <div class="metric-grid">
      <div class="metric"><div class="k">CAGR (1Y)</div><div class="v ${cagr1y>=0?'up':'down'}">${fmtPct(cagr1y,1)}</div></div>
      <div class="metric"><div class="k">Max drawdown (1Y)</div><div class="v down">${fmtPct(maxDD,1)}</div><div class="sub">Peak-to-trough over the year</div></div>
      <div class="metric"><div class="k">Sharpe-style ratio</div><div class="v">${sharpeApprox==null?'—':fmtNum(sharpeApprox,2)}</div><div class="sub">Approx. — assumes 7% risk-free rate</div></div>
      <div class="metric"><div class="k">Stochastic %K / %D</div><div class="v">${stoch.k==null?'—':fmtNum(stoch.k,1)} / ${stoch.d==null?'—':fmtNum(stoch.d,1)}</div><div class="sub">(14,3)</div></div>
      <div class="metric"><div class="k">On-balance volume</div><div class="v info">${obv}</div><div class="sub">Vs its 20-day average</div></div>
      <div class="metric" style="grid-column:span 2;"><div class="k">Pivot levels (classic, prev. session)</div>
        <div class="v" style="font-size:13px;">S2 ${fmtNum(pivots.s2,0)} · S1 ${fmtNum(pivots.s1,0)} · <b>P ${fmtNum(pivots.p,0)}</b> · R1 ${fmtNum(pivots.r1,0)} · R2 ${fmtNum(pivots.r2,0)}</div>
        <div class="sub">Reference levels only — not a forecast of where price will go</div></div>
    </div>

    <div class="section-label"><span>Day-trading desk</span><span class="rule-line"></span></div>
    <div id="intradayBlock"><div class="note-inline">Loading intraday session data…</div></div>

    <div class="section-label"><span>Peer comparison</span><span class="rule-line"></span></div>
    <div id="peerBlock"><div class="note-inline">Loading industry peers…</div></div>

    <div class="section-label"><span>Shareholding</span><span class="rule-line"></span></div>
    <div id="shareBlock"><div class="note-inline">Fetching NSE shareholding filings…</div></div>

    <div class="section-label"><span>Compare</span><span class="rule-line"></span></div>
    <div id="compareBlock"></div>

    <div class="section-label"><span>Recent news</span><span class="rule-line"></span></div>
    <div id="newsBlock" class="news-list"><div class="note-inline">Fetching recent headlines…</div></div>

    <div class="section-label"><span>Fundamentals</span><span class="rule-line"></span></div>
    <div class="metric-grid" id="fundamentalsGrid">
      <div class="note-inline">Fetching fundamentals…</div>
    </div>

    <div class="section-label"><span>Company profile</span><span class="rule-line"></span></div>
    <div class="profile-block" id="profileBlock">Fetching profile…</div>
  `;

  document.getElementById('closeDetail').addEventListener('click', () => {
    document.getElementById('detailSection').classList.remove('show');
    detailState.symbol = null;
  });
  document.getElementById('addFromDetail').addEventListener('click', () => addSymbolToWatchlist(symbol));
  document.getElementById('rangeBtns').addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    document.querySelectorAll('#rangeBtns button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    detailState.range = e.target.getAttribute('data-range');
    drawChart();
  });

  drawChart();
}

/**
 * The blocks that make up the detail panel, in the order they are entered.
 *
 * `delayMs` reproduces the setTimeout values the wrap chain used. Nothing here is awaited —
 * see the note at the top of this file before changing that.
 */
export const DETAIL_BLOCKS = [
  { id: 'core', delayMs: 0, render: (ctx) => renderDetailCore(ctx.symbol, ctx.hist, ctx.niftyHist) },
  { id: 'deep-analysis', delayMs: 0, render: (ctx) => renderDeepAnalysis(ctx.symbol, ctx.hist, ctx.price) },
  { id: 'snapshot', delayMs: 200, render: (ctx) => renderSnapshot(ctx.symbol, ctx.hist, ctx.niftyHist, ctx.price) },
  { id: 'options', delayMs: 400, render: (ctx) => renderOptions(ctx.ticker, ctx.price) },
  { id: 'factors', delayMs: 400, render: (ctx) => renderFactors(ctx.symbol, ctx.hist) },
  // EPIC-5 E5-4. Last, and at 700ms rather than 400, for two reasons: it reads
  // detailState.dcfInputs, which deep-analysis only fills once its fetches land, and its
  // models run for roughly 100ms on the main thread. Putting it behind the blocks that
  // paint keeps that cost off the first render rather than in front of it.
  { id: 'probability-lab', delayMs: 700, render: (ctx) => renderProbabilityLab(ctx.hist, detailState.dcfInputs) }
];

/**
 * Build the context every block reads from.
 *
 * Each of the three wraps used to recompute `price` with the same five-line fallback. It is
 * computed once here instead — the same expression, just not three times.
 */
export function detailContext(symbol, hist, niftyHist) {
  const closes = hist.closes;
  const meta = hist.meta;
  return {
    symbol,
    ticker: symbol.replace(/\.(NS|BO)$/, ''),
    hist,
    niftyHist,
    price: meta.regularMarketPrice != null ? meta.regularMarketPrice : closes[closes.length - 1]
  };
}

/**
 * The single point every block passes through — and, since EPIC-4 story E4-2, the error
 * boundary around each one.
 *
 * Before this, a block that threw took the rest of the panel with it or surfaced as an
 * uncaught error in a timer, depending on which block it was. `deep-analysis` was the worst
 * case: it runs synchronously, so its exception propagated all the way out of renderDetail
 * into loadStockDetail, and the reader got a blank panel because the OPTIONS feed was down.
 *
 * TWO FAILURE MODES, BOTH CAUGHT
 *
 *   sync   `core` and `deep-analysis` throw directly — the try/catch handles those.
 *   async  the other three are async functions; they return a promise that rejects long
 *          after runBlock has returned, so the catch alone would never see them.
 *
 * Hence the `.catch()` on the returned promise. Note what is NOT done: the promise is not
 * awaited. Awaiting here would serialise four independent network round trips that today run
 * concurrently — the exact regression tests/unit/detail-pipeline.test.js exists to prevent.
 * Attaching a catch handler does not change when anything runs.
 */
function runBlock(block, ctx) {
  try {
    const result = block.render(ctx);
    if (result && typeof result.then === 'function') {
      result.catch((err) => renderBlockError(block.id, err));
    }
  } catch (err) {
    renderBlockError(block.id, err);
  }
}

// Where each block's error state is painted. A block that has already rendered its own
// container gets the message inside it; one that failed before creating anything gets a
// container made for it, so the failure is visible rather than merely absent.
const BLOCK_HOSTS = {
  'core': null,                 // special-cased below: the panel itself failed
  'deep-analysis': 'deepBlock',
  'snapshot': 'snapBlock',
  'options': 'optBlock',
  'factors': 'facBlock',
  'probability-lab': 'labBlock'
};

const BLOCK_LABELS = {
  'deep-analysis': 'Deep analysis',
  'snapshot': 'Snapshot',
  'options': 'Options-implied probability',
  'factors': 'Factor decomposition',
  'probability-lab': 'Probability lab'
};

export function renderBlockError(blockId, err) {
  suppressed('block:' + blockId, err);

  // The core block IS the panel. There is no partial state worth showing, so this one goes
  // to the page-level banner — the coarse case src/ui/errors.js was written for.
  if (blockId === 'core') {
    try { showError('Could not render the detail panel: ' + (err && err.message ? err.message : err)); } catch { /* no banner in tests */ }
    return;
  }

  const card = document.getElementById('detailCard');
  if (!card) return;

  const hostId = BLOCK_HOSTS[blockId];
  let host = hostId ? document.getElementById(hostId) : null;
  if (!host) {
    host = document.createElement('div');
    if (hostId) host.id = hostId;
    card.appendChild(host);
  }

  const label = BLOCK_LABELS[blockId] || blockId;
  // Says which feed failed and that everything else is unaffected. CLAUDE.md invariant 3:
  // a failed block must read as failed, never as "this company has no such number".
  host.innerHTML =
    '<div class="section-label"><span>' + label + '</span><span class="rule-line"></span></div>' +
    '<div class="note-inline">This section could not load: ' +
    escapeHtml(err && err.message ? err.message : String(err)) +
    '. The feed behind it is unavailable — this is a fetch failure, not a missing figure. ' +
    'Everything else on this page is unaffected.</div>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Start every block.
 *
 * Blocks with no delay run synchronously, in list order, exactly as the old wrap chain did;
 * the rest are scheduled. Two blocks sharing a delay run in the same timer tick, in list
 * order — which is how `options` and `factors` behaved when they shared one setTimeout.
 *
 * Nothing is awaited, so a slow block never holds up the ones behind it. Exported separately
 * from renderDetail so the scheduling semantics can be tested without a DOM.
 */
export function runBlocks(blocks, ctx) {
  for (const block of blocks) {
    if (block.delayMs === 0) runBlock(block, ctx);
    else setTimeout(() => runBlock(block, ctx), block.delayMs);
  }
}

export function renderDetail(symbol, hist, niftyHist) {
  const ctx = detailContext(symbol, hist, niftyHist);
  runBlocks(DETAIL_BLOCKS, ctx);
  return ctx;
}
