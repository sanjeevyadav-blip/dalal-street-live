// Factor decomposition: an OLS regression of the stock's returns on market, size and
// momentum factors, with alpha, t-stats and R-squared.
//
// The size and momentum factors are BUILT HERE from a 24-stock universe. They are not the
// canonical Fama-French series, which is not freely published for India, and there is no
// value (HML) factor for the same reason. Loadings are directionally right but not
// comparable to academic figures, and the block must keep saying so.
//
// The glossary entry for the t-stat warns that between -2 and 2 it is noise however large
// it looks — that is the misreading this block invites.
//
// buildFactors lives here rather than in src/models/ because it fetches its own history
// for the whole universe; it is an orchestrator, not a pure model.

import { runPool } from '../data/proxy.js';
import { FACTOR_LARGE, FACTOR_SMALL } from '../data/universes.js';
import { fetchHistory } from '../data/yahoo.js';
import { olsMulti } from '../models/ols.js';
import { suppressed } from '../suppressed.js';
import { fmtNum } from './format.js';

let factorCache = null;

async function buildFactors(){
  if (factorCache) return factorCache;
  const all = FACTOR_LARGE.concat(FACTOR_SMALL);
  const hist = {};
  await runPool(all, async function(t){
    try { hist[t] = await fetchHistory(t + '.NS', '2y', '1d'); } catch (err) { suppressed('factors: history fetch', err); }
  }, 6);
  const nifty = await fetchHistory('^NSEI', '2y', '1d');
  const series = Object.keys(hist).map(function(k){ return hist[k].closes; });
  if (series.length < 8) return null;
  const n = Math.min.apply(null, series.map(function(s){ return s.length; }).concat([nifty.closes.length]));
  function rets(c){ const out=[]; const s=c.slice(c.length-n); for (let i=1;i<s.length;i++) out.push(Math.log(s[i]/s[i-1])); return out; }
  const mkt = rets(nifty.closes);
  const bigR = FACTOR_LARGE.filter(function(t){return hist[t];}).map(function(t){ return rets(hist[t].closes); });
  const smlR = FACTOR_SMALL.filter(function(t){return hist[t];}).map(function(t){ return rets(hist[t].closes); });
  const T = mkt.length;
  function avgAt(arrs, i){ let s=0,c=0; arrs.forEach(function(a){ if (a[i]!=null){ s+=a[i]; c++; } }); return c?s/c:0; }
  const smb = [], wml = [];
  const allR = bigR.concat(smlR);
  const allTick = FACTOR_LARGE.filter(function(t){return hist[t];}).concat(FACTOR_SMALL.filter(function(t){return hist[t];}));
  for (let i=0;i<T;i++){
    smb.push(avgAt(smlR,i) - avgAt(bigR,i));
    if (i < 252){ wml.push(0); continue; }
    const scored = allR.map(function(a, idx){
      let cum = 0;
      for (let k=i-252;k<i-21;k++) cum += a[k]||0;
      return { idx: idx, m: cum };
    }).sort(function(a,b){ return b.m - a.m; });
    const nq = Math.max(1, Math.floor(scored.length/3));
    let win=0, los=0;
    for (let q=0;q<nq;q++) win += allR[scored[q].idx][i]||0;
    for (let q=scored.length-nq;q<scored.length;q++) los += allR[scored[q].idx][i]||0;
    wml.push(win/nq - los/nq);
  }
  factorCache = { mkt, smb, wml, T, universe: allTick.length };
  return factorCache;
}

export async function renderFactors(symbol, hist){
  const host = document.getElementById('detailCard');
  if (!host) return;
  const old = document.getElementById('facBlock');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'facBlock';
  wrap.innerHTML =
    '<div class="section-label"><span>Factor decomposition</span><span class="rule-line"></span></div>' +
    '<div id="facBody"><div class="note-inline">Building factor series from a 24-stock universe\u2026 first run takes a few seconds.</div></div>';
  host.appendChild(wrap);
  const body = document.getElementById('facBody');
  let F = null;
  try { F = await buildFactors(); } catch (err) { suppressed('factors: build', err); }
  if (!F){ body.innerHTML = '<div class="note-inline">Couldn\u2019t build the factor series just now \u2014 reopen this stock in a moment.</div>'; return; }
  const c = hist.closes;
  const n = Math.min(F.T + 1, c.length);
  const s = c.slice(c.length - n);
  const y = [];
  for (let i=1;i<s.length;i++) y.push(Math.log(s[i]/s[i-1]));
  const L = Math.min(y.length, F.T);
  const Y = y.slice(y.length-L), M = F.mkt.slice(F.mkt.length-L), S2 = F.smb.slice(F.smb.length-L), W = F.wml.slice(F.wml.length-L);
  const rfD = 0.07/252;
  const X = [];
  for (let i=0;i<L;i++) X.push([1, M[i]-rfD, S2[i], W[i]]);
  const fit = olsMulti(Y.map(function(v){ return v - rfD; }), X);
  if (!fit){ body.innerHTML = '<div class="note-inline">Regression did not converge for this symbol.</div>'; return; }
  const names = ['Alpha', 'Market (Nifty)', 'Size (SMB proxy)', 'Momentum (WML)'];
  const tstats = fit.beta.map(function(b,i){ return fit.se[i] ? b/fit.se[i] : 0; });
  const alphaAnn = fit.beta[0]*252*100;
  const sig = Math.abs(tstats[0]) > 1.96;
  const rows = names.map(function(nm,i){
    const isAlpha = i===0;
    const v = isAlpha ? fmtNum(alphaAnn,2)+'% p.a.' : fmtNum(fit.beta[i],2);
    const t = fmtNum(tstats[i],2);
    const strong = Math.abs(tstats[i]) > 1.96;
    return '<tr><td class="sym">' + nm + '</td>' +
      '<td class="num"><b>' + v + '</b></td>' +
      '<td class="num ' + (strong?'up':'') + '">' + t + '</td>' +
      '<td>' + (strong ? 'Statistically significant' : 'Not distinguishable from zero') + '</td></tr>';
  }).join('');
  body.innerHTML =
    '<div class="metric-grid">' +
      '<div class="metric"><div class="k">Annualised alpha</div><div class="v ' + (alphaAnn>=0?'up':'down') + '">' + fmtNum(alphaAnn,2) + '%</div><div class="sub">' + (sig?'Statistically significant':'Not significant \u2014 likely noise') + '</div></div>' +
      '<div class="metric"><div class="k">Market beta</div><div class="v">' + fmtNum(fit.beta[1],2) + '</div><div class="sub">Sensitivity to Nifty moves</div></div>' +
      '<div class="metric"><div class="k">Size loading</div><div class="v">' + fmtNum(fit.beta[2],2) + '</div><div class="sub">' + (fit.beta[2]>0.1?'Behaves like a smaller company':fit.beta[2]<-0.1?'Behaves like a large cap':'Neutral') + '</div></div>' +
      '<div class="metric"><div class="k">Momentum loading</div><div class="v">' + fmtNum(fit.beta[3],2) + '</div><div class="sub">' + (fit.beta[3]>0.1?'Trend-following behaviour':fit.beta[3]<-0.1?'Contrarian behaviour':'Neutral') + '</div></div>' +
      '<div class="metric"><div class="k">R\u00b2</div><div class="v">' + fmtNum(fit.r2*100,1) + '%</div><div class="sub">Share of moves explained by factors</div></div>' +
      '<div class="metric"><div class="k">Idiosyncratic</div><div class="v info">' + fmtNum((1-fit.r2)*100,1) + '%</div><div class="sub">Stock-specific, not systematic</div></div>' +
    '</div>' +
    '<table class="book" style="margin-top:12px"><thead><tr><th>Factor</th><th>Loading</th><th>t-stat</th><th>Reading</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="note-inline" style="margin-top:12px">Regressed on ' + L + ' daily observations. A |t-stat| above 1.96 means the loading is distinguishable from zero at 95% confidence. ' +
    '<b>Alpha is the number to be sceptical about</b> \u2014 it is usually statistically insignificant, and when it is, the honest reading is that the stock\u2019s returns are fully explained by its factor exposures with no evidence of skill or mispricing. ' +
    'One caveat stated plainly: the size and momentum factors are <b>built from a ' + F.universe + '-stock universe here</b>, not the canonical Fama-French series (which is not freely published for India), so loadings are directionally right but not comparable to academic figures. There is no value (HML) factor for the same reason.</div>';
}
