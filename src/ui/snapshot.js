// The snapshot table — the first thing shown for a stock, and the densest statement of
// this app's stance.
//
// Every row carries a Source column and a staleness flag. Sources are one of 'Computed
// here', 'Yahoo Finance', 'NSE option chain - live' or 'Not sourced - fixed input'. That
// last one is used for the 7% risk-free rate, which is an assumption rather than data, and
// labelling it as such is the point (CLAUDE.md invariant 4).
//
// A row whose value cannot be computed is omitted or renders an em dash. It never renders
// zero.

import { fetchOptionChain } from '../data/nse.js';
import { fetchAnnuals, fetchCatalysts, fetchFundamentals, val } from '../data/yahoo.js';
import { smaSeries } from '../indicators/trend.js';
import { annualizedVolPct, betaAndCorrelation, dailyReturnsByDate } from '../indicators/volatility.js';
import { analyseOptions } from '../options/chain.js';
import { suppressed } from '../suppressed.js';
import { ageLabel, fmtNum } from './format.js';
import { computeDcf } from '../valuation/dcf.js';

export async function renderSnapshot(symbol, hist, niftyHist, price){
  const host = document.getElementById('detailCard');
  if (!host) return;
  const old = document.getElementById('snapBlock');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'snapBlock';
  wrap.innerHTML =
    '<div class="section-label"><span>Snapshot</span><span class="rule-line"></span></div>' +
    '<div id="snapBody"><div class="note-inline">Assembling the summary\u2026</div></div>';
  const anchor = host.querySelector('.chart-block') || host.querySelector('.stat-row');
  if (anchor && anchor.parentNode === host) host.insertBefore(wrap, anchor);
  else host.appendChild(wrap);
  const meta = hist.meta;
  const c = hist.closes, h = hist.highs, l = hist.lows;
  const rows = [];
  function row(metric, value, source, flag){
    rows.push({ metric: metric, value: value, source: source, flag: flag || null });
  }
  const quoteAge = meta.regularMarketTime ? ageLabel(meta.regularMarketTime) : null;
  const quoteTs = meta.regularMarketTime
    ? new Date(meta.regularMarketTime*1000).toLocaleString('en-IN',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false })
    : null;
  row('Current price', '\u20b9' + fmtNum(price,2) + (quoteTs ? ' <span style="opacity:.6">(' + quoteTs + ')</span>' : ''),
    'Yahoo Finance \u00b7 NSE feed', quoteAge && quoteAge !== 'today' ? 'Market closed \u2014 last traded price' : null);
  const wkHigh = meta.fiftyTwoWeekHigh != null ? meta.fiftyTwoWeekHigh : Math.max.apply(null, h.slice(-252));
  const wkLow = meta.fiftyTwoWeekLow != null ? meta.fiftyTwoWeekLow : Math.min.apply(null, l.slice(-252));
  const posInRange = ((price - wkLow)/((wkHigh-wkLow)||1))*100;
  row('52-week range', '\u20b9' + fmtNum(wkLow,2) + ' \u2013 \u20b9' + fmtNum(wkHigh,2) +
    ' <span style="opacity:.6">(' + fmtNum(posInRange,0) + '% up the range)</span>', 'Yahoo Finance');
  const sMap = dailyReturnsByDate(hist.dates, c);
  const nMap = dailyReturnsByDate(niftyHist.dates, niftyHist.closes);
  const bc = betaAndCorrelation(sMap, nMap);
  row('Beta vs Nifty 50 (1yr)', bc.beta == null ? '\u2014' : fmtNum(bc.beta,2) +
    (bc.corr != null ? ' <span style="opacity:.6">(corr ' + fmtNum(bc.corr,2) + ')</span>' : ''),
    'Computed here \u00b7 daily returns');
  const vol = annualizedVolPct(c);
  row('Annualised volatility', fmtNum(vol,2) + '%', 'Computed here \u00b7 252d window', 'Recomputed live \u2014 not a cached vendor figure');
  const s50 = smaSeries(c,50), s200 = smaSeries(c,200);
  const a50 = s50[s50.length-1], a200 = s200[s200.length-1];
  row('50-DMA / 200-DMA',
    (a50==null?'\u2014':'\u20b9'+fmtNum(a50,2)) + ' / ' + (a200==null?'\u2014':'\u20b9'+fmtNum(a200,2)) +
    ' <span style="opacity:.6">(' + (a50!=null?fmtNum(((price-a50)/a50)*100,1)+'%':'\u2014') + ' / ' +
    (a200!=null?fmtNum(((price-a200)/a200)*100,1)+'%':'\u2014') + ' vs price)</span>',
    'Computed here');
  row('Risk-free rate (10Y G-Sec)', '7.00% <span style="opacity:.6">(assumption)</span>',
    'Not sourced \u2014 fixed input', 'No free API for the India 10Y here; used in CAPM and DCF, so treat as a parameter you can argue with');
  const yStart = new Date(new Date().getFullYear(),0,1).getTime();
  function ytd(dates, closes){
    let i = 0;
    while (i < dates.length && dates[i].getTime() < yStart) i++;
    if (i >= closes.length) return null;
    return ((closes[closes.length-1]/closes[i]) - 1)*100;
  }
  const sY = ytd(hist.dates, c), nY = ytd(niftyHist.dates, niftyHist.closes);
  if (sY != null) row('YTD performance',
    fmtNum(sY,1) + '%' + (nY!=null ? ' <span style="opacity:.6">vs Nifty ' + fmtNum(nY,1) + '% \u00b7 ' +
      (sY-nY>=0?'+':'') + fmtNum(sY-nY,1) + ' pts relative</span>' : ''), 'Computed here');
  document.getElementById('snapBody').innerHTML = buildSnapTable(rows) +
    '<div class="note-inline" style="margin-top:10px" id="snapPending">Loading fundamentals, consensus and options rows\u2026</div>';
  try {
    const f = await fetchFundamentals(symbol);
    const sd = f.summaryDetail||{}, ks = f.defaultKeyStatistics||{}, fd = f.financialData||{};
    const eps = val(ks.trailingEps), pe = val(sd.trailingPE);
    if (eps != null) row('EPS (TTM) \u2192 trailing P/E',
      '\u20b9' + fmtNum(eps,2) + (pe!=null ? ' \u2192 ' + fmtNum(pe,1) + 'x' : ''), 'Yahoo Finance \u00b7 quoteSummary');
    const tgt = val(fd.targetMeanPrice), nAn = val(fd.numberOfAnalystOpinions);
    if (tgt != null) row('Analyst consensus',
      (fd.recommendationKey ? '\u201c' + fd.recommendationKey.replace(/_/g,' ') + '\u201d \u00b7 ' : '') +
      'target \u20b9' + fmtNum(tgt,0) + ' <span style="opacity:.6">(' + fmtNum(((tgt-price)/price)*100,1) + '% vs price' +
      (nAn?', ' + nAn + ' analysts':'') + ')</span>', 'Yahoo Finance \u00b7 sell-side aggregate',
      'Sell-side targets skew optimistic as a class \u2014 compare against the DCF and the options-implied odds below');
    const cat = await fetchCatalysts(symbol);
    if (cat && cat.surprises && cat.surprises.length){
      const last = cat.surprises[cat.surprises.length-1];
      if (last && last.actual != null) row('Last quarter EPS: actual vs est.',
        '\u20b9' + fmtNum(last.actual,2) + ' vs \u20b9' + fmtNum(last.est,2) +
        (last.surprise!=null ? ' <span class="' + (last.surprise>0?'up':'down') + '">(' + (last.surprise>0?'+':'') + fmtNum(last.surprise*100,2) + '%)</span>' : ''),
        'Yahoo Finance \u00b7 earnings history');
    }
    if (cat && cat.nextEarnings){
      const d = new Date(cat.nextEarnings*1000);
      const days = Math.round((cat.nextEarnings*1000 - Date.now())/86400000);
      row('Next earnings', d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) +
        ' <span style="opacity:.6">(' + (days>=0 ? days + ' days out' : 'just reported') + ')</span>',
        'Yahoo Finance \u00b7 calendar');
    }
  } catch {
    row('Fundamentals', 'Unavailable right now', 'Yahoo quoteSummary failed', 'Endpoint intermittently blocks unauthenticated calls');
  }
  try {
    const ann = await fetchAnnuals(symbol);
    const f2 = await fetchFundamentals(symbol);
    const ks2 = f2.defaultKeyStatistics||{}, fd2 = f2.financialData||{};
    const d = computeDcf(ann, price, val(ks2.sharesOutstanding), val(ks2.beta),
      (val(fd2.totalDebt)||0) - (val(fd2.totalCash)||0));
    if (d && d.intrinsic) row('Our DCF fair value',
      '\u20b9' + fmtNum(d.intrinsic,2) + ' <span class="' + (d.upside>=0?'up':'down') + '">(' +
      (d.upside>=0?'+':'') + fmtNum(d.upside,1) + '% gap)</span>',
      'Computed here \u00b7 ' + ann.ocf.length + 'yr cash flows',
      'Swings 40%+ across defensible assumptions \u2014 read the sensitivity grid, not this single figure');
  } catch (err) { suppressed('snapshot: dcf row', err); }
  try {
    const ticker = symbol.replace(/\.(NS|BO)$/,'');
    const ch = await fetchOptionChain(ticker);
    if (ch){
      const o = analyseOptions(ch, price);
      if (o && o.pAbove != null){
        row('Options-implied P(up) by expiry',
          fmtNum(o.pAbove,1) + '% <span style="opacity:.6">(' + o.expiry + ', ' + o.dte + 'd \u00b7 ATM IV ' + fmtNum(o.atmIV,1) + '%)</span>',
          'NSE option chain \u00b7 live',
          'Risk-neutral, not real-world \u2014 embeds a risk premium');
        if (o.pcrOI != null) row('Put-call ratio (OI)', fmtNum(o.pcrOI,2) +
          ' <span style="opacity:.6">\u00b7 max pain \u20b9' + fmtNum(o.maxPain,0) + '</span>', 'NSE option chain \u00b7 live');
      }
    } else {
      row('Options-implied probability', 'No F&O contracts listed', 'NSE \u00b7 checked live',
        'Only ~180 NSE names have options');
    }
  } catch (err) { suppressed('snapshot: options row', err); }
  const pend = document.getElementById('snapPending');
  if (pend) pend.remove();
  document.getElementById('snapBody').innerHTML = buildSnapTable(rows) +
    '<div class="note-inline" style="margin-top:10px">Every row names where it came from. <b>Computed here</b> means it was calculated from the price series in your browser this second, so it cannot be stale. ' +
    '<b>Yahoo Finance</b> rows are vendor data that can lag by a quarter on fundamentals. The risk-free rate is a fixed assumption, not a sourced figure \u2014 it feeds CAPM and the DCF, so it is a parameter worth disagreeing with.</div>';
}

function buildSnapTable(rows){
  return '<table class="book"><thead><tr><th style="width:26%">Metric</th><th style="width:42%">Value</th><th style="width:32%">Source</th></tr></thead><tbody>' +
    rows.map(function(r){
      return '<tr><td class="sym" style="font-family:var(--sans);font-weight:600">' + r.metric + '</td>' +
        '<td style="font-family:var(--mono);font-size:13.5px">' + r.value +
          (r.flag ? '<div style="font-family:var(--sans);font-size:11px;color:var(--cream-dim);margin-top:3px">\u26a0 ' + r.flag + '</div>' : '') + '</td>' +
        '<td style="font-size:12px;color:var(--cream-dim)">' + r.source + '</td></tr>';
    }).join('') + '</tbody></table>';
}
