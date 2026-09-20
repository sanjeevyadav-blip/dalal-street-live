// The deep-analysis block: price action, candlestick patterns, DCF and earnings quality.
//
// Each sub-block renders its own 'not measurable' state rather than a zero when its inputs
// are missing — a bank has no meaningful OCF-minus-capex, and a stock with no multi-year
// filings has no earnings-quality grade. CLAUDE.md invariant 3.

import { fetchAnnuals, fetchFundamentals, val } from '../data/yahoo.js';
import { detectPatterns, priceAction } from '../indicators/patterns.js';
import { atrLast } from '../indicators/volatility.js';
import { suppressed } from '../suppressed.js';
import { fmtCr, fmtNum } from './format.js';
import { renderThesis } from './thesis.js';
import { detailState } from './detail-state.js';
import { computeDcf } from '../valuation/dcf.js';
import { earningsQuality } from '../valuation/earnings-quality.js';

export async function renderDeepAnalysis(symbol, hist, price){
  const host = document.getElementById('detailCard');
  if (!host) return;
  const old = document.getElementById('deepBlock');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'deepBlock';
  const pats = detectPatterns(hist.opens, hist.highs, hist.lows, hist.closes);
  const pa = priceAction(hist.highs, hist.lows, hist.closes);
  const patHtml = pats.length
    ? pats.map(p => '<div class="metric"><div class="k">' + p.name + ' <span style="opacity:.7">\u00b7 ' + p.age + '</span></div>' +
        '<div class="v ' + (p.bias==='bullish'?'up':p.bias==='bearish'?'down':'info') + '">' + p.bias + '</div>' +
        '<div class="sub">' + p.note + '</div></div>').join('')
    : '<div class="note-inline">No classic candlestick pattern in the last five sessions.</div>';
  wrap.innerHTML =
    '<div class="section-label"><span>Price action</span><span class="rule-line"></span></div>' +
    '<div class="metric-grid">' +
      '<div class="metric" style="grid-column:span 2"><div class="k">Structure</div><div class="v info" style="font-size:14px">' + pa.trend + '</div><div class="sub">From swing highs and lows over the last ~6 months</div></div>' +
      '<div class="metric"><div class="k">Nearest support</div><div class="v">\u20b9' + fmtNum(pa.support,2) + '</div><div class="sub">' + fmtNum(pa.toSupport,1) + '% below</div></div>' +
      '<div class="metric"><div class="k">Nearest resistance</div><div class="v">\u20b9' + fmtNum(pa.resistance,2) + '</div><div class="sub">' + fmtNum(pa.toResistance,1) + '% above</div></div>' +
    '</div>' +
    '<div class="section-label"><span>Candlestick patterns</span><span class="rule-line"></span></div>' +
    '<div class="metric-grid">' + patHtml + '</div>' +
    '<div class="section-label"><span>Intrinsic value (DCF)</span><span class="rule-line"></span></div>' +
    '<div id="dcfBlock"><div class="note-inline">Pulling multi-year cash flows\u2026</div></div>' +
    '<div class="section-label"><span>Earnings quality</span><span class="rule-line"></span></div>' +
    '<div id="eqBlock"><div class="note-inline">Pulling multi-year cash flows\u2026</div></div>';
  host.appendChild(wrap);
  try {
    const ann = await fetchAnnuals(symbol);
    let shares = null, beta = null, netDebt = 0;
    try {
      const f = await fetchFundamentals(symbol);
      const ks = f.defaultKeyStatistics || {}, fd = f.financialData || {};
      shares = val(ks.sharesOutstanding);
      beta = val(ks.beta);
      const td = val(fd.totalDebt) || 0, tc = val(fd.totalCash) || 0;
      netDebt = td - tc;
    } catch (err) { suppressed('dcf inputs: fundamentals', err); }
    const dcfEl = document.getElementById('dcfBlock');
    const d = computeDcf(ann, price, shares, beta, netDebt);
    // Hand the inputs to the probability lab (EPIC-5 E5-4) rather than making it fetch the
    // annuals and fundamentals a second time. Only set when the DCF actually computed: the
    // lab must not run on a company whose cash-flow history could not support one.
    detailState.dcfInputs = (d && !d.error && shares > 0)
      ? { base: d.base, shares, netDebt, price, growth: d.growth, disc: d.disc }
      : null;
    if (!d) {
      dcfEl.innerHTML = '<div class="note-inline">Not enough cash-flow history published for this symbol to build a DCF.</div>';
    } else if (d.error) {
      dcfEl.innerHTML = '<div class="note-inline">' + d.error + '</div>';
    } else {
      const up = d.upside >= 0;
      const sens = '<table class="book" style="margin-top:12px"><thead><tr><th>Discount rate</th><th>Low growth</th><th>Base</th><th>High growth</th></tr></thead><tbody>' +
        d.sens.map(s => '<tr><td class="sym">' + fmtNum(s.dr*100,0) + '%</td>' +
          s.vals.map(v => '<td class="num" style="font-family:var(--mono)">\u20b9' + fmtNum(v,0) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table>';
      dcfEl.innerHTML =
        '<div class="metric-grid">' +
          '<div class="metric"><div class="k">Intrinsic value / share</div><div class="v ' + (up?'up':'down') + '" style="font-size:20px">\u20b9' + fmtNum(d.intrinsic,2) + '</div><div class="sub">vs market \u20b9' + fmtNum(d.price,2) + '</div></div>' +
          '<div class="metric"><div class="k">' + (up?'Potential upside':'Potential downside') + '</div><div class="v ' + (up?'up':'down') + '">' + fmtNum(Math.abs(d.upside),1) + '%</div><div class="sub">' + (up?'Trading below the model':'Trading above the model') + '</div></div>' +
          '<div class="metric"><div class="k">Base free cash flow</div><div class="v">' + fmtCr(d.base) + '</div><div class="sub">Latest year, OCF minus capex</div></div>' +
          '<div class="metric"><div class="k">Assumed FCF growth</div><div class="v">' + fmtNum(d.growth*100,1) + '%</div><div class="sub">From history, fading to ' + fmtNum(d.tg*100,0) + '%</div></div>' +
          '<div class="metric"><div class="k">Discount rate</div><div class="v">' + fmtNum(d.disc*100,1) + '%</div><div class="sub">CAPM: 7% risk-free + beta \u00d7 6%</div></div>' +
          '<div class="metric"><div class="k">Net debt</div><div class="v">' + fmtCr(d.netDebt) + '</div><div class="sub">Debt minus cash, deducted from EV</div></div>' +
          '<div class="metric"><div class="k">Terminal share of value</div><div class="v">' + fmtNum((d.pvTerminal/d.ev)*100,0) + '%</div><div class="sub">How much rests on the terminal assumption</div></div>' +
          '<div class="metric"><div class="k">Enterprise value</div><div class="v">' + fmtCr(d.ev) + '</div><div class="sub">Sum of discounted cash flows</div></div>' +
        '</div>' +
        '<div class="note-inline" style="margin-top:12px">A DCF is a model, not a measurement \u2014 the output moves a lot with small changes in growth and discount rate. The grid below shows that sensitivity. Treat the range, not the single number, as the answer.</div>' +
        sens;
    }
    const eqEl = document.getElementById('eqBlock');
    const q = earningsQuality(ann);
    if (!q) {
      eqEl.innerHTML = '<div class="note-inline">Not enough published cash-flow history to assess earnings quality.</div>';
    } else {
      const gradeCls = q.grade==='Strong' ? 'up' : q.grade==='Weak' ? 'down' : 'info';
      eqEl.innerHTML =
        '<div class="metric-grid">' +
          '<div class="metric"><div class="k">Overall</div><div class="v ' + gradeCls + '" style="font-size:20px">' + q.grade + '</div><div class="sub">' + q.score + ' of ' + q.max + ' checks passed \u00b7 ' + q.years + ' years</div></div>' +
          '<div class="metric"><div class="k">Cash flow / net profit</div><div class="v ' + (q.cfni>=1?'up':'down') + '">' + (q.cfni==null?'\u2014':fmtNum(q.cfni,2) + '\u00d7') + '</div><div class="sub">Above 1.0 means profit is cash-backed</div></div>' +
          '<div class="metric"><div class="k">Accruals ratio</div><div class="v ' + (q.accr!=null && q.accr<=5?'up':'down') + '">' + (q.accr==null?'\u2014':fmtNum(q.accr,1)+'%') + '</div><div class="sub">(Profit \u2212 cash flow) / assets; lower is cleaner</div></div>' +
          '<div class="metric"><div class="k">Free cash flow margin</div><div class="v ' + (q.fcfMargin>0?'up':'down') + '">' + (q.fcfMargin==null?'\u2014':fmtNum(q.fcfMargin,1)+'%') + '</div><div class="sub">FCF as a share of revenue</div></div>' +
          '<div class="metric"><div class="k">Capex intensity</div><div class="v">' + (q.capexInt==null?'\u2014':fmtNum(q.capexInt,0)+'%') + '</div><div class="sub">Share of operating cash flow reinvested</div></div>' +
          '<div class="metric"><div class="k">Revenue vs cash growth</div><div class="v">' + (q.revG==null?'\u2014':fmtNum(q.revG,1)+'%') + ' / ' + (q.ocfG==null?'\u2014':fmtNum(q.ocfG,1)+'%') + '</div><div class="sub">CAGR \u2014 cash should track revenue</div></div>' +
        '</div>' +
        '<div class="news-list" style="margin-top:12px">' +
          q.flags.map(f => '<div class="news-item" style="cursor:default"><div class="news-title" style="color:' + (f.good?'var(--gain)':'var(--loss)') + '">' + (f.good?'\u2713 ':'\u26a0 ') + f.t + '</div></div>').join('') +
        '</div>';
    }
    try { renderThesis(symbol, hist, price, (d && !d.error) ? d : null, q, pa, atrLast(hist.highs, hist.lows, hist.closes, 14)); } catch (err) { suppressed('detail: thesis block', err); }
  } catch {
    const dcfEl = document.getElementById('dcfBlock'), eqEl = document.getElementById('eqBlock');
    const msg = '<div class="note-inline">Couldn\u2019t load multi-year financials just now \u2014 reopen this stock in a moment.</div>';
    if (dcfEl) dcfEl.innerHTML = msg;
    if (eqEl) eqEl.innerHTML = msg;
  }
}
