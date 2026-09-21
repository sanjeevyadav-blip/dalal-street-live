// Reverse DCF: the FCF growth rate the current price already implies.
//
// Bisects on growth until the model value matches the market price. This is deliberately
// the honest direction to run the model: rather than asserting what a company is worth, it
// states what you would have to believe for today's price to be right.
//
// THE FLOOR, AND WHY -20% WAS A LIE
//
// The model fades growth toward the terminal rate and takes `Math.max(tg, gy)` each year,
// exactly as computeDcf does — reverseDcf has to invert the same model or it is answering a
// different question. But that floor means every growth rate at or below the terminal rate
// produces the IDENTICAL value: below 4%, `Math.max` returns 4% and the growth input stops
// mattering. valueAt is flat across the whole lower half of the bracket.
//
// The old code did not notice. It bisected anyway, found valueAt(-20%) still above the
// price, and returned `{ implied: -0.20, capped: true }`. A reader saw "implied growth
// -20%" and reasonably concluded the market was pricing in a 20% annual DECLINE. It meant
// nothing of the sort: it meant the model could not resolve the answer at all, and -20%
// was just the edge of a bracket the function never had any ability to search.
//
// That is a fabricated metric under CLAUDE.md invariant 3 — a filled cell that was not
// real. So the unresolvable case is now reported as unresolvable: `implied` is null and
// `belowFloor` says why, with `floorGrowth` naming the rate below which the model is blind.
//
// The three outcomes are now distinct, and callers must handle all three:
//
//   { implied: number, capped: false }            solved
//   { implied: 0.60,   capped: true  }            price implies MORE than the model can express
//   { implied: null,   belowFloor: true }         price implies LESS; the model cannot say how much

const LOWER_BRACKET = -0.20;
const UPPER_BRACKET = 0.60;

export function reverseDcf(price, base, shares, disc, tg, netDebt){
  if (!(base > 0) || !shares || !price) return null;

  function valueAt(g){
    let f = base, pv = 0;
    for (let y=1;y<=10;y++){ const gy = g*Math.pow(0.85,y-1); f = f*(1+Math.max(tg,gy)); pv += f/Math.pow(1+disc,y); }
    const t = (f*(1+tg))/(disc-tg)/Math.pow(1+disc,10);
    return (pv + t - (netDebt||0))/shares;
  }

  const hi = UPPER_BRACKET;
  // The real lower bound of the search is the terminal rate, not the bracket: below it the
  // function is constant, so there is nothing to bisect.
  const floorGrowth = tg;

  if (valueAt(hi) < price){
    return { implied: hi, capped: true, belowFloor: false, floorGrowth, valueAt };
  }

  if (valueAt(floorGrowth) > price){
    // Even growth pinned at the terminal rate values the company above its price. The price
    // therefore implies something lower — and this model, which never lets growth fall below
    // the terminal rate, physically cannot express what.
    return { implied: null, capped: false, belowFloor: true, floorGrowth, valueAt };
  }

  let lo = floorGrowth;
  let hiB = hi;
  for (let i=0;i<60;i++){ const mid=(lo+hiB)/2; if (valueAt(mid) < price) lo = mid; else hiB = mid; }
  return { implied: (lo+hiB)/2, capped: false, belowFloor: false, floorGrowth, valueAt };
}

/** The bracket the search uses, exported so tests and docs cannot drift from the code. */
export const REVERSE_DCF_BRACKET = { lower: LOWER_BRACKET, upper: UPPER_BRACKET };
