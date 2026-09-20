// The options-implied probability block, from the live NSE chain.
//
// Every probability here is RISK-NEUTRAL — N(d2) under the pricing measure, not a
// real-world forecast — and the block is required to say so on screen (CLAUDE.md invariant
// 4). Only about 180 NSE names have listed options; for everything else this renders an
// explicit 'no contracts listed' rather than zeros.

import { fetchOptionChain } from '../data/nse.js';
import { analyseOptions } from '../options/chain.js';
import { suppressed } from '../suppressed.js';
import { fmtNum } from './format.js';

export async function renderOptions(ticker, spot){
  const host = document.getElementById('detailCard');
  if (!host) return;
  const old = document.getElementById('optBlock');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'optBlock';
  wrap.innerHTML =
    '<div class="section-label"><span>Options-implied probability</span><span class="rule-line"></span></div>' +
    '<div id="optBody"><div class="note-inline">Pulling the live NSE option chain\u2026</div></div>';
  host.appendChild(wrap);
  const body = document.getElementById('optBody');
  let chain = null;
  try { chain = await fetchOptionChain(ticker); } catch (err) { suppressed('options: chain fetch', err); }
  if (!chain){
    body.innerHTML = '<div class="note-inline">No F&amp;O contracts listed for this stock. Only about 180 NSE names have options \u2014 for everything else there is no market-implied probability to read, because no one is trading one.</div>';
    return;
  }
  const o = analyseOptions(chain, spot);
  if (!o){ body.innerHTML = '<div class="note-inline">The option chain came back empty for this expiry.</div>'; return; }
  const bias = o.pcrOI == null ? 'info' : o.pcrOI > 1.2 ? 'up' : o.pcrOI < 0.7 ? 'down' : 'info';
  const biasTxt = o.pcrOI == null ? '\u2014' : o.pcrOI > 1.2 ? 'Put-heavy (often read as bullish)' : o.pcrOI < 0.7 ? 'Call-heavy (often read as bearish)' : 'Balanced';
  const ladder = '<table class="book" style="margin-top:12px"><thead><tr><th>Strike</th><th>vs spot</th><th>IV</th><th>Market P(above)</th><th>Call OI</th><th>Put OI</th></tr></thead><tbody>' +
    o.ladder.map(function(l){
      return '<tr><td class="sym">\u20b9' + fmtNum(l.strike,0) + '</td>' +
        '<td class="num">' + (l.pct>0?'+':'') + l.pct + '%</td>' +
        '<td class="num">' + fmtNum(l.iv,1) + '%</td>' +
        '<td class="num ' + (l.pAbove>=50?'up':'down') + '"><b>' + (l.pAbove==null?'\u2014':fmtNum(l.pAbove,1)+'%') + '</b></td>' +
        '<td class="num">' + fmtNum(l.ceOI,0) + '</td>' +
        '<td class="num">' + fmtNum(l.peOI,0) + '</td></tr>';
    }).join('') + '</tbody></table>';
  body.innerHTML =
    '<div class="metric-grid">' +
      '<div class="metric"><div class="k">P(above spot) at expiry</div><div class="v ' + (o.pAbove>=50?'up':'down') + '" style="font-size:20px">' + (o.pAbove==null?'\u2014':fmtNum(o.pAbove,1)+'%') + '</div><div class="sub">Risk-neutral, from ATM implied vol</div></div>' +
      '<div class="metric"><div class="k">Expiry</div><div class="v" style="font-size:14px">' + o.expiry + '</div><div class="sub">' + o.dte + ' days away</div></div>' +
      '<div class="metric"><div class="k">ATM implied volatility</div><div class="v">' + (o.atmIV==null?'\u2014':fmtNum(o.atmIV,1)+'%') + '</div><div class="sub">What option sellers are charging</div></div>' +
      '<div class="metric"><div class="k">Implied move by expiry</div><div class="v info">\u00b1' + (o.impliedMove==null?'\u2014':fmtNum(o.impliedMove,1)+'%') + '</div><div class="sub">One standard deviation</div></div>' +
      '<div class="metric"><div class="k">Put-call ratio (OI)</div><div class="v ' + bias + '">' + (o.pcrOI==null?'\u2014':fmtNum(o.pcrOI,2)) + '</div><div class="sub">' + biasTxt + '</div></div>' +
      '<div class="metric"><div class="k">Put-call ratio (volume)</div><div class="v">' + (o.pcrVol==null?'\u2014':fmtNum(o.pcrVol,2)) + '</div><div class="sub">Today\u2019s flow, not positioning</div></div>' +
      '<div class="metric"><div class="k">Max pain</div><div class="v">\u20b9' + fmtNum(o.maxPain,0) + '</div><div class="sub">' + fmtNum(((o.maxPain-o.S)/o.S)*100,1) + '% from spot</div></div>' +
      '<div class="metric"><div class="k">Volatility skew</div><div class="v ' + (o.skew>2?'down':o.skew<-2?'up':'info') + '">' + (o.skew==null?'\u2014':fmtNum(o.skew,1)+' pts') + '</div><div class="sub">10% OTM put IV minus call IV</div></div>' +
      '<div class="metric"><div class="k">Heaviest call OI</div><div class="v">\u20b9' + (o.topCE?fmtNum(o.topCE.strike,0):'\u2014') + '</div><div class="sub">Often acts as a ceiling</div></div>' +
      '<div class="metric"><div class="k">Heaviest put OI</div><div class="v">\u20b9' + (o.topPE?fmtNum(o.topPE.strike,0):'\u2014') + '</div><div class="sub">Often acts as a floor</div></div>' +
    '</div>' + ladder +
    '<div class="note-inline" style="margin-top:12px">These are <b>risk-neutral</b> probabilities \u2014 what the option market is pricing, derived from N(d\u2082) in Black-Scholes using live implied volatility. ' +
    'They are the market\u2019s own view backed by real capital, which is why they are worth more than any model on this page. Two honest caveats: risk-neutral is not real-world probability (it embeds a risk premium, so downside odds look slightly overstated), and thin open interest makes far strikes unreliable. ' +
    'Check the OI columns before trusting any single row.</div>';
}
