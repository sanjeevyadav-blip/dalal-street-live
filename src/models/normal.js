// The standard normal cumulative distribution.
//
// Lives here rather than in options/ because two callers need it: the Black-Scholes N(d2)
// in options/chain.js and the GBM drift model in models/gbm.js. Putting it under options/
// would mean models/ importing from options/, which is the wrong way round.
//
// This is an Abramowitz-Stegun style rational approximation, accurate to roughly 7 decimal
// places — ample for reporting probabilities to the nearest percent, and pinned at the
// reference points in tests/unit/valuation-models.test.js.

export function nCdf(x){
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const s = x<0?-1:1; const z = Math.abs(x)/Math.SQRT2;
  const t = 1/(1+p*z);
  const y = 1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-z*z);
  return 0.5*(1+s*y);
}
