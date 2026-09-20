// Momentum indicators: RSI, stochastic and compound growth.
//
// rsiLast uses Wilder's smoothing (the running average form), not a simple mean of the last
// n gains. docs/10 §10.2 pins it against Wilder's own reference series.

import { average } from './util.js';

export function rsiLast(closes, period){
  const gains=[], losses=[];
  for (let i=1;i<closes.length;i++){ const d=closes[i]-closes[i-1]; gains.push(Math.max(d,0)); losses.push(Math.max(-d,0)); }
  if (gains.length < period) return null;
  let avgGain = average(gains.slice(0,period)), avgLoss = average(losses.slice(0,period));
  for (let i=period;i<gains.length;i++){ avgGain = (avgGain*(period-1)+gains[i])/period; avgLoss = (avgLoss*(period-1)+losses[i])/period; }
  if (avgLoss === 0) return 100;
  const rs = avgGain/avgLoss; return 100 - (100/(1+rs));
}

export function rsiSeriesFull(closes, period){
  const out = new Array(closes.length).fill(null);
  const gains=[], losses=[];
  for (let i=1;i<closes.length;i++){ const d=closes[i]-closes[i-1]; gains.push(Math.max(d,0)); losses.push(Math.max(-d,0)); }
  if (gains.length < period) return out;
  let avgGain = average(gains.slice(0,period)), avgLoss = average(losses.slice(0,period));
  out[period] = avgLoss===0 ? 100 : 100-(100/(1+avgGain/avgLoss));
  for (let i=period;i<gains.length;i++){
    avgGain = (avgGain*(period-1)+gains[i])/period; avgLoss = (avgLoss*(period-1)+losses[i])/period;
    const rs = avgLoss===0 ? 100 : avgGain/avgLoss;
    out[i+1] = avgLoss===0 ? 100 : 100-(100/(1+rs));
  }
  return out;
}

export function stochasticLast(highs, lows, closes, period, smoothK){
  if (closes.length < period+smoothK) return { k:null, d:null };
  const kRaw = [];
  for (let i=period-1;i<closes.length;i++){
    const hh = Math.max(...highs.slice(i-period+1,i+1)), ll = Math.min(...lows.slice(i-period+1,i+1));
    kRaw.push(((closes[i]-ll)/((hh-ll)||1))*100);
  }
  const kSmoothed = [];
  for (let i=smoothK-1;i<kRaw.length;i++) kSmoothed.push(average(kRaw.slice(i-smoothK+1,i+1)));
  const dSeries = [];
  for (let i=smoothK-1;i<kSmoothed.length;i++) dSeries.push(average(kSmoothed.slice(i-smoothK+1,i+1)));
  return { k: kSmoothed[kSmoothed.length-1], d: dSeries.length ? dSeries[dSeries.length-1] : null };
}

export function cagrPct(dates, closes){
  const years = (dates[dates.length-1]-dates[0]) / (1000*60*60*24*365.25);
  if (years <= 0) return null;
  return (Math.pow(closes[closes.length-1]/closes[0], 1/years) - 1) * 100;
}
