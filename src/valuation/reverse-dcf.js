// Reverse DCF: the FCF growth rate the current price already implies.
//
// Bisects on growth between -20% and +60% until the model value matches the market price.
// When the answer is outside that bracket it returns the bound with `capped: true` — that
// flag matters, because a capped figure is a floor or a ceiling, not a solution, and
// reporting it as though it were one would be inventing precision.
//
// This is deliberately the honest direction to run the model: rather than asserting what a
// company is worth, it states what you would have to believe for today's price to be right.

export function reverseDcf(price, base, shares, disc, tg, netDebt){
  if (!(base > 0) || !shares || !price) return null;
  function valueAt(g){
    let f = base, pv = 0;
    for (let y=1;y<=10;y++){ const gy = g*Math.pow(0.85,y-1); f = f*(1+Math.max(tg,gy)); pv += f/Math.pow(1+disc,y); }
    const t = (f*(1+tg))/(disc-tg)/Math.pow(1+disc,10);
    return (pv + t - (netDebt||0))/shares;
  }
  let lo = -0.20, hi = 0.60;
  if (valueAt(hi) < price) return { implied: hi, capped:true, valueAt };
  if (valueAt(lo) > price) return { implied: lo, capped:true, valueAt };
  for (let i=0;i<60;i++){ const mid=(lo+hi)/2; if (valueAt(mid) < price) lo = mid; else hi = mid; }
  return { implied: (lo+hi)/2, capped:false, valueAt };
}
