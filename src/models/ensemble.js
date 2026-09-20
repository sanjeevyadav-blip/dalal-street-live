// Bayesian ensemble — EPIC-5 story E5-3.
//
// Combines several models' probabilities into one, by adding their log-odds with weights:
//
//     posterior_logodds = sum over models of w_i * log( p_i / (1 - p_i) )
//
// Log-odds rather than an average of probabilities, because probabilities do not combine
// linearly. Two independent models each saying 60% should land above 60%, not at 60% —
// averaging throws away the fact that they agree. In log-odds that follows automatically.
//
// THE ASSUMPTION THIS MAKES, AND WHY IT IS WRONG
//
// Adding log-odds is Bayes' rule for CONDITIONALLY INDEPENDENT evidence. These models are
// not independent. GBM and the GARCH-conditional GBM share their drift estimate outright;
// the HMM and the logistic both read the same price series. Treating correlated models as
// independent overstates confidence — it is the single largest flaw in this construction and
// it is not fixable within it.
//
// Two things make it tolerable rather than dishonest:
//
//   1. The weights below are well under 1 and sum to less than 1, which is a deliberate
//      shrinkage toward 50%. They are judgement, not estimates, and are labelled as such.
//   2. `disagreement` is reported alongside, and a reader should trust the posterior LESS
//      when the models disagree, not more — the opposite of how a single blended number
//      usually reads. Where the inputs conflict, the conflict is the finding.
//
// The starting point is an uninformative 50% prior. Every input is clamped to [2%, 98%]
// before it enters, so no single overconfident model can drag the posterior to a corner.

import { mean, stdev } from './stats.js';

/**
 * Default weights. Judgement, not fitted — there is no out-of-sample record to fit them to,
 * and inventing one would be worse than admitting this.
 *
 * THE OPTIONS-IMPLIED PROBABILITY IS DELIBERATELY ABSENT.
 *
 * It is the most tempting input available: the option chain is the only forward-looking
 * number on the page with real capital behind it. But it is a RISK-NEUTRAL probability —
 * N(d2) under the pricing measure — and the models here are real-world. The two are not the
 * same quantity. Risk-neutral probabilities embed a risk premium, which is why they
 * systematically overstate downside odds, and CLAUDE.md invariant 4 requires that
 * distinction to be flagged wherever they appear.
 *
 * Blending them would quietly erase it: the posterior would be part risk-neutral and part
 * real-world, labelled as neither, and no caveat could repair that. The options block
 * reports its own number, correctly labelled, and the lab points readers at it.
 *
 * The weights sum to 0.8, under 1, which shrinks the posterior toward 50%. That is
 * deliberate shrinkage for correlated inputs — see the note at the top of this file.
 */
export const DEFAULT_WEIGHTS = {
  gbm: 0.25,
  garch: 0.20,
  hmm: 0.15,
  logistic: 0.20
};

const clampP = (p) => Math.max(0.02, Math.min(0.98, p));

/**
 * @param {Array<{name: string, p: number, w: number, note?: string}>} signals
 *   `p` is a percentage (0-100). Signals with a null or non-finite p are skipped, and which
 *   ones were skipped is reported — a posterior built from two of five models is a different
 *   object from one built from all five, and the reader has to be able to tell.
 */
export function bayesEnsemble(signals){
  if (!Array.isArray(signals)) return null;

  const used = [];
  const skipped = [];
  let logOdds = 0;

  for (const s of signals){
    if (!s || s.p == null || !Number.isFinite(s.p) || !Number.isFinite(s.w)){
      if (s && s.name) skipped.push(s.name);
      continue;
    }
    const p = clampP(s.p / 100);
    const contribution = Math.log(p / (1 - p)) * s.w;
    logOdds += contribution;
    used.push({ name: s.name, p: s.p, w: s.w, contribution, note: s.note || null });
  }

  if (!used.length) return null;

  const posterior = 1 / (1 + Math.exp(-logOdds));
  // Spread of the RAW model probabilities, not of their weighted contributions: the reader's
  // question is "do the models agree", and weighting would hide a loud disagreement between
  // two lightly-weighted models.
  const disagreement = used.length > 1 ? stdev(used.map((x) => x.p)) : 0;

  return {
    posterior: posterior * 100,
    used,
    skipped,
    nUsed: used.length,
    meanInput: mean(used.map((x) => x.p)),
    disagreement,
    // Deliberately not a confidence score. High agreement among models that share their
    // inputs is not evidence of anything, and this label says only what it measures.
    agreement: disagreement < 6 ? 'Models broadly agree'
      : disagreement < 14 ? 'Some disagreement'
        : 'Models disagree sharply',
    // The honest reading instruction, carried with the number so it cannot be separated
    // from it in the UI.
    caveat: 'These models share inputs, so adding their log-odds overstates confidence. ' +
      'Treat wide disagreement as a reason to trust this less, not more.'
  };
}
