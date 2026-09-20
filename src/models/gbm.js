// Geometric Brownian motion: the probability the price is higher after N trading days,
// given the last year's drift and volatility.
//
// This is model output, not a forecast, and the assumption it rests on — that the future
// resembles the past year — is exactly the assumption that fails around shocks and news.
// Values cluster between 45% and 60% because a week of stock movement genuinely is close to
// a coin flip; a tool showing 85% confidence on a one-week move is selling something.
//
// Returns null rather than a number when there are fewer than 30 returns or zero variance.

import { nCdf } from './normal.js';

export function gbmProbUp(closes, days){
  const r = [];
  const s = closes.slice(-252);
  for (let i=1;i<s.length;i++) r.push(Math.log(s[i]/s[i-1]));
  if (r.length < 30) return null;
  let m = 0; r.forEach(function(x){ m += x; }); m /= r.length;
  let v = 0; r.forEach(function(x){ v += (x-m)*(x-m); }); v /= (r.length-1);
  const sd = Math.sqrt(v);
  if (!(sd > 0)) return null;
  const z = (m*days) / (sd*Math.sqrt(days));
  return { p: nCdf(z)*100, drift: m*252*100, vol: sd*Math.sqrt(252)*100 };
}
