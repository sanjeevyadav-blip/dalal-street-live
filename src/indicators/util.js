// Shared arithmetic for the indicator modules.
//
// average() divides by `arr.length || 1`, so an empty array returns 0 rather than NaN.
// That is load-bearing in a couple of call sites and is asserted in the unit tests — it is
// a deliberate choice, not an accident, and changing it would move real numbers.

export function average(arr){ return arr.reduce((a,b)=>a+b,0) / (arr.length||1); }
