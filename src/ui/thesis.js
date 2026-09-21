// The six-step thesis walkthrough: consensus vs our estimate, DCF and reverse DCF,
// catalysts, technical levels, a position-size calculator, and the verdict panel.
//
// The verdict panel is where this app's central product decision lives. It reports five
// pillars SEPARATELY — valuation, earnings quality, momentum, risk, street view — and
// explicitly explains why it stops short of a single BUY/HOLD/AVOID label. Three reasons,
// all recorded in docs/14 ADR-003: the DCF swings 40%+ across defensible assumptions; the
// synthesis depends on the reader's horizon, existing holdings and tax position; and in
// India publishing buy/sell calls is restricted to SEBI-registered Research Analysts.
//
// Do not collapse the pillars into a score. scripts/check-invariants.sh fails the build if
// a recommendation-shaped string appears here.

import { fetchCatalysts } from '../data/yahoo.js';
import { rsiLast } from '../indicators/momentum.js';
import { macdLast, smaSeries } from '../indicators/trend.js';
import { annualizedVolPct } from '../indicators/volatility.js';
import { suppressed } from '../suppressed.js';
import { fmtDate, fmtNum } from './format.js';
import { reverseDcf } from '../valuation/reverse-dcf.js';

export async function renderThesis(symbol, hist, price, dcf, quality, pa, atr){
  const host = document.getElementById('detailCard');
  if (!host) return;
  const old = document.getElementById('thesisBlock');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'thesisBlock';
  wrap.innerHTML =
    '<div class="section-label"><span>Thesis walkthrough</span><span class="rule-line"></span></div>' +
    '<div id="thesisBody"><div class="note-inline">Assembling the walkthrough\u2026</div></div>';
  host.appendChild(wrap);
  let cat = null;
  try { cat = await fetchCatalysts(symbol); } catch (err) { suppressed('thesis: catalysts', err); }
  const steps = [];
  let consensusHtml;
  if (cat && cat.targetMean) {
    const cGap = ((cat.targetMean - price)/price)*100;
    const ourGap = dcf && dcf.intrinsic ? ((dcf.intrinsic - price)/price)*100 : null;
    const disagree = (ourGap != null) ? (ourGap - cGap) : null;
    consensusHtml =
      '<div class="metric-grid">' +
        '<div class="metric"><div class="k">Market price</div><div class="v">\u20b9' + fmtNum(price,2) + '</div></div>' +
        '<div class="metric"><div class="k">Analyst consensus target</div><div class="v ' + (cGap>=0?'up':'down') + '">\u20b9' + fmtNum(cat.targetMean,2) + '</div><div class="sub">' + fmtNum(cGap,1) + '% vs price \u00b7 ' + (cat.analysts||'?') + ' analysts</div></div>' +
        '<div class="metric"><div class="k">Analyst range</div><div class="v" style="font-size:13px">\u20b9' + fmtNum(cat.targetLow,0) + ' \u2013 \u20b9' + fmtNum(cat.targetHigh,0) + '</div><div class="sub">Low to high target</div></div>' +
        '<div class="metric"><div class="k">Our DCF estimate</div><div class="v ' + (ourGap!=null && ourGap>=0?'up':'down') + '">' + (ourGap==null?'\u2014':'\u20b9' + fmtNum(dcf.intrinsic,2)) + '</div><div class="sub">' + (ourGap==null?'DCF unavailable':fmtNum(ourGap,1) + '% vs price') + '</div></div>' +
      '</div>' +
      (disagree != null
        ? '<div class="note-inline" style="margin-top:10px">Our model is <b>' + fmtNum(Math.abs(disagree),1) + ' points ' + (disagree>0?'more optimistic':'more conservative') + '</b> than the street. ' +
          (Math.abs(disagree) > 25 ? 'That is a wide gap \u2014 one side is making materially different assumptions about growth or margins, and it is worth understanding which before acting.' : 'That is a reasonably normal spread.') + '</div>'
        : '');
  } else {
    consensusHtml = '<div class="note-inline">No analyst coverage published for this symbol on Yahoo, so there is no consensus to compare against. Smaller and mid-cap Indian names are often uncovered.</div>';
  }
  steps.push(['1', 'Consensus vs our estimate', consensusHtml]);
  let dcfHtml;
  if (dcf && dcf.intrinsic) {
    const rev = reverseDcf(price, dcf.base, dcf.shares, dcf.disc, dcf.tg, dcf.netDebt);
    const histG = dcf.growth*100;
    const impG = (rev && rev.implied != null) ? rev.implied*100 : null;
    const floorPct = rev ? rev.floorGrowth*100 : 4;

    // Three outcomes, three different sentences. The middle one used to be rendered as
    // "-20%", which read as "the market expects a 20% annual decline" and meant nothing of
    // the kind \u2014 see the note at the top of valuation/reverse-dcf.js.
    let impCell, gapCell, verdictLine = '';
    if (rev && rev.belowFloor) {
      impCell = 'Below ' + fmtNum(floorPct,0) + '%';
      gapCell = '\u2014';
      verdictLine = 'The price implies growth <b>below ' + fmtNum(floorPct,0) + '%</b>, and this model ' +
        'cannot say how far below. It fades growth toward a ' + fmtNum(floorPct,0) + '% terminal rate ' +
        'and never goes under it, so every assumption beneath that floor produces the same value \u2014 ' +
        'the question stops having an answer rather than having a low one. What it does tell you is ' +
        'that the market is pricing this business below the slowest growth the model can represent.';
    } else if (impG != null) {
      const d = impG - histG;
      impCell = fmtNum(impG,1) + '%' + (rev && rev.capped ? '+' : '');
      gapCell = fmtNum(d,1) + ' pts';
      verdictLine = Math.abs(d) < 3
        ? 'The price is roughly consistent with what the business has actually been doing.'
        : d > 0
          ? 'The price requires <b>faster</b> growth than the company has delivered historically \u2014 the market is pricing in improvement.'
          : 'The price implies <b>slower</b> growth than history \u2014 the market is pricing in deterioration or sees risk the model does not.';
      if (rev && rev.capped) {
        verdictLine = 'The price implies growth <b>at or above ' + fmtNum(impG,0) + '%</b> \u2014 the top of ' +
          'what this model will search, so treat it as a floor on expectations rather than a solved ' +
          'figure. ' + verdictLine;
      }
    } else {
      impCell = '\u2014';
      gapCell = '\u2014';
    }
    dcfHtml =
      '<div class="metric-grid">' +
        '<div class="metric"><div class="k">Forward DCF value</div><div class="v ' + (dcf.upside>=0?'up':'down') + '">\u20b9' + fmtNum(dcf.intrinsic,2) + '</div><div class="sub">' + fmtNum(dcf.upside,1) + '% vs price</div></div>' +
        '<div class="metric"><div class="k">Growth we assumed</div><div class="v">' + fmtNum(histG,1) + '%</div><div class="sub">From ' + (dcf.rows?dcf.rows.length:5) + '-yr FCF history</div></div>' +
        '<div class="metric"><div class="k">Reverse DCF \u2014 implied growth</div><div class="v info">' + impCell + '</div><div class="sub">Growth the current price already assumes</div></div>' +
        '<div class="metric"><div class="k">Expectation gap</div><div class="v ' + (impG!=null && impG<=histG?'up':'down') + '">' + gapCell + '</div><div class="sub">Implied minus historical</div></div>' +
      '</div>' +
      (verdictLine ? '<div class="note-inline" style="margin-top:10px">' + verdictLine + ' Reverse DCF is often the more useful lens: instead of asking what the stock is worth, it asks what you would have to believe to pay today\u2019s price.</div>' : '');
  } else {
    dcfHtml = '<div class="note-inline">No usable DCF for this symbol \u2014 typically negative or unpublished free cash flow. Banks and financials in particular cannot be valued this way; a DCF on a lender is meaningless.</div>';
  }
  steps.push(['2', 'DCF and reverse DCF', dcfHtml]);
  let catHtml = '';
  const items = [];
  if (cat && cat.nextEarnings) {
    const d = fmtDate(cat.nextEarnings);
    const days = Math.round((cat.nextEarnings*1000 - Date.now())/86400000);
    if (d) items.push(['Next earnings', d + (days>=0 ? ' \u00b7 in ' + days + ' days' : ' \u00b7 just reported'), days>=0 && days<=30 ? 'info' : '']);
  }
  if (cat && cat.exDiv) { const d = fmtDate(cat.exDiv); if (d) items.push(['Ex-dividend date', d, '']); }
  if (cat && cat.surprises && cat.surprises.length) {
    const beats = cat.surprises.filter(s => s.surprise != null && s.surprise > 0).length;
    items.push(['Earnings surprise record', beats + ' beats in last ' + cat.surprises.length + ' quarters', beats >= cat.surprises.length-1 ? 'up' : beats === 0 ? 'down' : '']);
    const last = cat.surprises[cat.surprises.length-1];
    if (last && last.surprise != null) items.push(['Latest surprise', fmtNum(last.surprise*100,1) + '%', last.surprise>0?'up':'down']);
  }
  if (items.length) {
    catHtml = '<div class="metric-grid">' + items.map(it =>
      '<div class="metric"><div class="k">' + it[0] + '</div><div class="v ' + (it[2]||'') + '" style="font-size:14px">' + it[1] + '</div></div>').join('') + '</div>';
  }
  catHtml += '<div class="note-inline" style="margin-top:10px">Scheduled events are the only catalysts that can be pulled reliably. Genuine catalysts \u2014 order wins, regulatory decisions, capacity commissioning, management change \u2014 show up in the news section above, not in any API. Read those before forming a view.</div>';
  steps.push(['3', 'Catalysts and scheduled events', catHtml]);
  const sup = pa ? pa.support : null, res = pa ? pa.resistance : null;
  const stopSuggest = (sup != null && atr) ? Math.min(sup*0.99, price - 2*atr) : (atr ? price - 2*atr : null);
  const techHtml =
    '<div class="metric-grid">' +
      '<div class="metric"><div class="k">Structure</div><div class="v info" style="font-size:13px">' + (pa?pa.trend:'\u2014') + '</div></div>' +
      '<div class="metric"><div class="k">Support</div><div class="v">' + (sup==null?'\u2014':'\u20b9'+fmtNum(sup,2)) + '</div><div class="sub">' + (pa?fmtNum(pa.toSupport,1)+'% below':'') + '</div></div>' +
      '<div class="metric"><div class="k">Resistance</div><div class="v">' + (res==null?'\u2014':'\u20b9'+fmtNum(res,2)) + '</div><div class="sub">' + (pa?fmtNum(pa.toResistance,1)+'% above':'') + '</div></div>' +
      '<div class="metric"><div class="k">ATR (14)</div><div class="v">' + (atr?'\u20b9'+fmtNum(atr,2):'\u2014') + '</div><div class="sub">' + (atr?fmtNum(atr/price*100,2)+'% daily swing':'') + '</div></div>' +
      '<div class="metric"><div class="k">2\u00d7ATR risk level</div><div class="v down">' + (stopSuggest?'\u20b9'+fmtNum(stopSuggest,2):'\u2014') + '</div><div class="sub">Where the technical case would break</div></div>' +
      '<div class="metric"><div class="k">Risk per share</div><div class="v">' + (stopSuggest?'\u20b9'+fmtNum(price-stopSuggest,2):'\u2014') + '</div><div class="sub">' + (stopSuggest?fmtNum((price-stopSuggest)/price*100,1)+'% from price':'') + '</div></div>' +
    '</div>' +
    '<div class="note-inline" style="margin-top:10px">These are <b>reference levels computed from price history</b>, not entry instructions. Support and resistance mark where price has previously turned; they are descriptive, and they fail regularly.</div>';
  steps.push(['4', 'Technical levels', techHtml]);
  const sizeHtml =
    '<div class="note-inline">Position sizing is arithmetic on <b>your</b> inputs \u2014 capital and risk tolerance are yours to set, so nothing here is prefilled with a recommendation. The standard rule is to risk a fixed small percentage of capital per position and let the stop distance determine size.</div>' +
    '<div class="add-form" style="margin-top:12px">' +
      '<input type="text" id="psCapital" placeholder="Total capital, e.g. 500000" autocomplete="off">' +
      '<input type="text" id="psRisk" placeholder="Risk % per trade, e.g. 1" autocomplete="off">' +
      '<input type="text" id="psStop" placeholder="Stop price, e.g. ' + (stopSuggest?fmtNum(stopSuggest,0):'0') + '" autocomplete="off">' +
      '<button type="button" id="psCalc">Calculate</button>' +
    '</div>' +
    '<div id="psOut"></div>';
  steps.push(['5', 'Position sizing', sizeHtml]);
  const pillars = [];
  if (dcf && dcf.intrinsic) {
    const u = dcf.upside;
    pillars.push(['Valuation (DCF)', u > 20 ? 'Below model value' : u < -20 ? 'Above model value' : 'Near model value',
      u > 20 ? 'up' : u < -20 ? 'down' : 'info',
      'Model says \u20b9' + fmtNum(dcf.intrinsic,0) + ' vs \u20b9' + fmtNum(price,0) + '. Highly assumption-sensitive \u2014 see the grid above.']);
  } else pillars.push(['Valuation (DCF)', 'Not measurable', '', 'No usable free cash flow history.']);
  if (quality) pillars.push(['Earnings quality', quality.grade,
    quality.grade==='Strong'?'up':quality.grade==='Weak'?'down':'info',
    quality.score + ' of ' + quality.max + ' cash-backing checks passed.']);
  else pillars.push(['Earnings quality', 'Not measurable', '', 'Insufficient cash-flow history.']);
  const rsi = rsiLast(hist.closes,14), macd = macdLast(hist.closes);
  const s50 = smaSeries(hist.closes,50), s200 = smaSeries(hist.closes,200);
  const above50 = s50[s50.length-1]!=null && price>=s50[s50.length-1];
  const above200 = s200[s200.length-1]!=null && price>=s200[s200.length-1];
  const momOk = (macd.hist>=0?1:0) + (above50?1:0) + (above200?1:0);
  pillars.push(['Momentum', momOk>=2?'Constructive':momOk===1?'Mixed':'Weak', momOk>=2?'up':momOk===1?'info':'down',
    'RSI ' + (rsi==null?'\u2014':fmtNum(rsi,0)) + ' \u00b7 MACD ' + (macd.hist>=0?'positive':'negative') + ' \u00b7 ' + (above50?'above':'below') + ' 50DMA \u00b7 ' + (above200?'above':'below') + ' 200DMA']);
  const vol = annualizedVolPct(hist.closes);
  pillars.push(['Risk', vol>40?'High volatility':vol>25?'Moderate volatility':'Lower volatility', vol>40?'down':vol>25?'info':'up',
    fmtNum(vol,0) + '% annualised. Position size should fall as this rises.']);
  if (cat && cat.targetMean) {
    const g = ((cat.targetMean-price)/price)*100;
    pillars.push(['Street view', cat.recKey ? cat.recKey.replace(/_/g,' ') : (g>0?'Target above price':'Target below price'),
      g>10?'up':g<-10?'down':'info',
      'Consensus \u20b9' + fmtNum(cat.targetMean,0) + ' from ' + (cat.analysts||'?') + ' analysts.']);
  }
  const verdictHtml =
    '<div class="news-list">' + pillars.map(p =>
      '<div class="news-item" style="cursor:default"><div class="news-title"><b>' + p[0] + ':</b> <span class="' + (p[2]||'') + '">' + p[1] + '</span></div>' +
      '<div class="news-meta" style="text-transform:none;font-family:var(--sans)">' + p[3] + '</div></div>').join('') + '</div>' +
    '<div class="note-inline" style="margin-top:12px">' +
      '<b>Why there is no single BUY / HOLD / AVOID here.</b> Each pillar above is measurable; the synthesis into one word is not \u2014 it depends on your holding period, your existing exposure, your tax position and your conviction, none of which this page knows. ' +
      'The DCF alone shifts intrinsic value by 40% or more across a defensible range of assumptions, so a verdict derived from it would carry far more confidence than the inputs support. ' +
      'Publishing buy/sell calls in India is also restricted to SEBI-registered research analysts. ' +
      'Where the pillars <em>agree</em>, the picture is clear without a label. Where they conflict, that conflict is the actual finding \u2014 and collapsing it into one word would hide the most useful thing on this page.' +
    '</div>';
  steps.push(['6', 'Verdict panel', verdictHtml]);
  document.getElementById('thesisBody').innerHTML = steps.map(s =>
    '<div style="margin-bottom:22px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--gold);color:#1a1305;font-weight:700;font-size:13px;font-family:var(--mono)">' + s[0] + '</span>' +
        '<span style="font-family:var(--serif);font-weight:600;font-size:16px">' + s[1] + '</span>' +
      '</div>' + s[2] +
    '</div>').join('');
  const btn = document.getElementById('psCalc');
  if (btn) btn.addEventListener('click', function(){
    const capital = parseFloat((document.getElementById('psCapital').value||'').replace(/[^0-9.]/g,''));
    const riskPct = parseFloat((document.getElementById('psRisk').value||'').replace(/[^0-9.]/g,''));
    const stop = parseFloat((document.getElementById('psStop').value||'').replace(/[^0-9.]/g,''));
    const out = document.getElementById('psOut');
    if (!capital || !riskPct || !stop) { out.innerHTML = '<div class="note-inline" style="margin-top:10px">Enter capital, risk percentage and a stop price to calculate.</div>'; return; }
    if (stop >= price) { out.innerHTML = '<div class="note-inline" style="margin-top:10px">The stop needs to sit below the current price of \u20b9' + fmtNum(price,2) + ' for this arithmetic to mean anything.</div>'; return; }
    const riskAmt = capital * (riskPct/100);
    const perShare = price - stop;
    const shares = Math.floor(riskAmt / perShare);
    const value = shares * price;
    const pctCapital = (value/capital)*100;
    out.innerHTML =
      '<div class="metric-grid" style="margin-top:12px">' +
        '<div class="metric"><div class="k">Amount at risk</div><div class="v">\u20b9' + fmtNum(riskAmt,0) + '</div><div class="sub">' + fmtNum(riskPct,2) + '% of capital</div></div>' +
        '<div class="metric"><div class="k">Risk per share</div><div class="v">\u20b9' + fmtNum(perShare,2) + '</div><div class="sub">' + fmtNum(perShare/price*100,1) + '% below entry</div></div>' +
        '<div class="metric"><div class="k">Shares</div><div class="v up">' + fmtNum(shares,0) + '</div></div>' +
        '<div class="metric"><div class="k">Position value</div><div class="v">\u20b9' + fmtNum(value,0) + '</div><div class="sub">' + fmtNum(pctCapital,1) + '% of capital</div></div>' +
      '</div>' +
      (pctCapital > 25 ? '<div class="note-inline" style="margin-top:10px">That position would be ' + fmtNum(pctCapital,0) + '% of your capital. A tight stop produces a large position for the same rupee risk \u2014 the trade risk is controlled, but the concentration risk is not.</div>' : '');
  });
}
