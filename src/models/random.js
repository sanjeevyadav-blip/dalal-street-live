// Seeded pseudo-randomness for the Monte Carlo models — EPIC-5.
//
// WHY SEEDED, AND NOT Math.random()
//
// A simulation driven by Math.random() gives a different answer every time the page is
// opened. For a model whose whole output is a probability, that is corrosive: the reader
// sees 54.1% on Monday and 53.6% on Tuesday and cannot tell whether the market moved or the
// dice did. With a fixed seed, the number changes only when the INPUT changes, so any
// movement on screen is real movement.
//
// The cost is that the reported figure carries the sampling error of one particular draw
// rather than being the true expectation. That is why every Monte Carlo result in this
// project also reports its standard error: at 20,000 paths the standard error on a
// probability near 50% is about 0.35 percentage points, which is the honest precision of
// the number and roughly the point at which reporting more decimal places starts lying.

/**
 * Linear congruential generator (Numerical Recipes constants).
 *
 * Not cryptographic and not trying to be — it is a deterministic stream for simulation.
 * Its period is 2^32, far more than the few million draws any model here makes.
 */
export function rng(seed){
  let s = seed >>> 0;
  return function(){
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * One standard normal draw, Box-Muller.
 *
 * The 1e-12 floor on the first uniform matters: Math.log(0) is -Infinity, which would put a
 * NaN into a price path and poison every statistic computed from it. An LCG can and does
 * return exactly 0.
 */
export function gauss(u){
  const a = Math.max(u(), 1e-12);
  const b = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}
