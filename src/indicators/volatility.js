// Volatility and risk: Bollinger bands, ATR, annualised volatility, drawdown, beta.
//
// Units are the recurring bug in this codebase (docs/05). Read the names carefully:
// annualizedVolPct and maxDrawdownPct return PERCENTAGES; percentB and beta return plain
// ratios. sharpeStyleApprox takes its volatility and risk-free rate as percentages.
//
// betaAndCorrelation returns nulls below 20 overlapping days rather than a number computed
// from too little data — a spurious beta is worse than a blank cell (CLAUDE.md invariant 3).

import { average } from './util.js';
import { smaSeries } from './trend.js';

export function bollingerLast(closes, period, mult){
  const slice = closes.slice(closes.length-period);
  const mid = average(slice);
  const variance = slice.reduce((s,v)=>s+Math.pow(v-mid,2),0)/period;
  const sd = Math.sqrt(variance);
  const upper = mid+mult*sd, lower = mid-mult*sd;
  const price = closes[closes.length-1];
  const percentB = (price-lower)/((upper-lower)||1);
  return { mid, upper, lower, percentB };
}

export function bollingerSeriesFull(closes, period, mult){
  const mid = smaSeries(closes, period);
  const upper = new Array(closes.length).fill(null), lower = new Array(closes.length).fill(null);
  for (let i=period-1;i<closes.length;i++){
    const slice = closes.slice(i-period+1, i+1); const m = mid[i];
    const variance = slice.reduce((s,v)=>s+Math.pow(v-m,2),0)/period;
    const sd = Math.sqrt(variance);
    upper[i]=m+mult*sd; lower[i]=m-mult*sd;
  }
  return { mid, upper, lower };
}

export function atrLast(highs, lows, closes, period){
  const trs=[];
  for (let i=1;i<closes.length;i++){ trs.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]))); }
  if (trs.length < period) return null;
  let avg = average(trs.slice(0,period));
  for (let i=period;i<trs.length;i++){ avg = (avg*(period-1)+trs[i])/period; }
  return avg;
}

export function annualizedVolPct(closes){
  const rets=[]; for (let i=1;i<closes.length;i++) rets.push(Math.log(closes[i]/closes[i-1]));
  const m = average(rets);
  const variance = rets.reduce((s,v)=>s+Math.pow(v-m,2),0)/(rets.length-1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function maxDrawdownPct(closes){
  let peak = closes[0], maxDD = 0;
  for (const c of closes){ if (c > peak) peak = c; const dd = (c-peak)/peak; if (dd < maxDD) maxDD = dd; }
  return maxDD * 100;
}

export function sharpeStyleApprox(cagr, volPct, riskFreePct){
  if (cagr==null || !volPct) return null;
  return (cagr - riskFreePct) / volPct;
}

export function betaAndCorrelation(stockMap, niftyMap){
  const sArr=[], nArr=[];
  stockMap.forEach((v,k)=>{ if (niftyMap.has(k)){ sArr.push(v); nArr.push(niftyMap.get(k)); } });
  const n = sArr.length;
  if (n < 20) return { beta:null, corr:null };
  const ms = average(sArr), mn = average(nArr);
  let cov=0, varN=0, varS=0;
  for (let i=0;i<n;i++){ cov += (sArr[i]-ms)*(nArr[i]-mn); varN += Math.pow(nArr[i]-mn,2); varS += Math.pow(sArr[i]-ms,2); }
  cov/= (n-1); varN/=(n-1); varS/=(n-1);
  return { beta: cov/varN, corr: cov/(Math.sqrt(varN)*Math.sqrt(varS)) };
}

export function dailyReturnsByDate(dates, closes){
  const map = new Map();
  for (let i=1;i<closes.length;i++){
    const d = dates[i].toISOString().slice(0,10);
    map.set(d, Math.log(closes[i]/closes[i-1]));
  }
  return map;
}
