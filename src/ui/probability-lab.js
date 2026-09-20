// The probability lab block — EPIC-5 story E5-4.
//
// The acceptance criterion is "each model states its failure mode", and that is the design
// constraint, not a caption to be added afterwards. Every model here renders as a triplet:
//
//     what it says   ·   what it assumes   ·   how it fails
//
// If a model cannot be given the third, it does not belong on the page. That is also why the
// models are shown SEPARATELY, above the ensemble that blends them — the same reasoning as
// the verdict panel in thesis.js. Where the models agree, the reader does not need the blend;
// where they conflict, the conflict is the finding, and a single blended number would hide
// the most useful thing here.
//
// WHAT THIS BLOCK IS NOT ALLOWED TO SAY
//
//   - No target price, and no probability of reaching a price by a date. CLAUDE.md hard rule
//     2, enforced by scripts/check-invariants.sh. Every dispersion figure is a percentage of
//     today's price, which reads as spread rather than as a destination.
//   - No buy/sell/hold conclusion drawn from any of it. Hard rule 1.
//   - No number without its provenance. Hard rule 4. The estimation window, the path count
//     and the priors are on screen, not in a tooltip.
//
// The DCF Monte Carlo deliberately answers a different question from the rest and is placed
// apart from them for that reason: P(the model values this above its price) has no horizon
// and is not a probability the price rises. Blending it with the direction models would be a
// category error, and it is not offered to the ensemble.

import { fmtNum } from './format.js';
import { suppressed } from '../suppressed.js';
import { gbmMonteCarlo, gbmConditional } from '../models/monte-carlo.js';
import { fitGarch } from '../models/garch.js';
import { fitHmm } from '../models/hmm.js';
import { walkForwardLogistic } from '../models/logistic.js';
import { bayesEnsemble, DEFAULT_WEIGHTS } from '../models/ensemble.js';
import { dcfMonteCarlo } from '../valuation/dcf-monte-carlo.js';

const HORIZON_DAYS = 21;   // one trading month
const PATHS = 20000;

function esc(s){
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const pct = (v, dp = 1) => (v == null || !Number.isFinite(v) ? '—' : fmtNum(v, dp) + '%');
const signedPct = (v, dp = 1) => (v == null || !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + fmtNum(v, dp) + '%');

/**
 * One model's card: the number, the assumption behind it, and the way it breaks.
 * `fails` is required by construction — a model with no stated failure mode is not rendered.
 */
function modelCard({ title, value, sub, assumes, fails }){
  return '<div class="metric" style="grid-column:1 / -1">' +
    '<div class="k">' + esc(title) + '</div>' +
    '<div class="v">' + esc(value) + '</div>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
    '<div class="sub" style="margin-top:6px"><b>Assumes:</b> ' + esc(assumes) + '</div>' +
    '<div class="sub"><b>Fails when:</b> ' + esc(fails) + '</div>' +
  '</div>';
}

/**
 * Run every model that the available data supports.
 *
 * Exported separately from the render so the composition can be tested without a DOM, and so
 * a caller can see exactly which models ran and which declined.
 */
export function runProbabilityLab(hist, dcfInputs){
  const closes = hist && hist.closes;
  const volumes = (hist && hist.volumes) || [];
  if (!closes || closes.length < 60) return null;

  const out = { horizonDays: HORIZON_DAYS, paths: PATHS };

  try { out.gbm = gbmMonteCarlo(closes, HORIZON_DAYS, PATHS); }
  catch (err){ suppressed('lab: gbm', err); out.gbm = null; }

  try { out.garch = fitGarch(closes); }
  catch (err){ suppressed('lab: garch', err); out.garch = null; }

  // The conditional run only makes sense if GARCH fitted. When it did, the two runs together
  // say whether the current market differs from its own long-run norm.
  try {
    out.gbmCond = out.garch ? gbmConditional(closes, HORIZON_DAYS, out.garch.nextDayVol, PATHS) : null;
  } catch (err){ suppressed('lab: gbm conditional', err); out.gbmCond = null; }

  try { out.hmm = fitHmm(closes); }
  catch (err){ suppressed('lab: hmm', err); out.hmm = null; }

  try { out.logistic = walkForwardLogistic(closes, volumes, HORIZON_DAYS); }
  catch (err){ suppressed('lab: logistic', err); out.logistic = null; }

  if (dcfInputs && dcfInputs.base > 0){
    try {
      out.dcfMc = dcfMonteCarlo(dcfInputs.base, dcfInputs.shares, dcfInputs.netDebt,
        dcfInputs.price, dcfInputs.growth, dcfInputs.disc);
    } catch (err){ suppressed('lab: dcf monte carlo', err); out.dcfMc = null; }
  }

  // The logistic contributes ONLY when it beat its own base rate out of sample. A classifier
  // with no demonstrated edge is not evidence, and letting it vote anyway is how an ensemble
  // launders noise into a confident-looking posterior.
  const signals = [
    out.gbm ? { name: 'GBM', p: out.gbm.pUp, w: DEFAULT_WEIGHTS.gbm } : null,
    out.gbmCond ? { name: 'GBM on current volatility', p: out.gbmCond.pUp, w: DEFAULT_WEIGHTS.garch } : null,
    out.hmm ? { name: 'Regime model', p: out.hmm.pBullNext, w: DEFAULT_WEIGHTS.hmm } : null,
    (out.logistic && out.logistic.hasEdge)
      ? { name: 'Classifier', p: out.logistic.pUp, w: DEFAULT_WEIGHTS.logistic }
      : null
  ].filter(Boolean);

  out.ensemble = signals.length ? bayesEnsemble(signals) : null;
  out.logisticExcluded = Boolean(out.logistic && !out.logistic.hasEdge);
  return out;
}

export function renderProbabilityLab(hist, dcfInputs){
  const host = document.getElementById('detailCard');
  if (!host) return null;

  const old = document.getElementById('labBlock');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'labBlock';
  wrap.innerHTML =
    '<div class="section-label"><span>Probability lab</span><span class="rule-line"></span></div>' +
    '<div id="labBody"><div class="note-inline">Running the models…</div></div>';
  host.appendChild(wrap);

  const body = document.getElementById('labBody');
  const lab = runProbabilityLab(hist, dcfInputs);

  if (!lab){
    body.innerHTML = '<div class="note-inline">Not enough price history to run these models. ' +
      'They need at least a few months of daily closes, and the shortest of them needs more than a year.</div>';
    return null;
  }

  const cards = [];

  if (lab.gbm){
    cards.push(modelCard({
      title: 'Geometric Brownian motion — P(higher in ' + lab.horizonDays + ' trading days)',
      value: pct(lab.gbm.pUp) + ' ± ' + fmtNum(lab.gbm.se, 2) + ' pts',
      sub: 'Middle 90% of simulated outcomes: ' + signedPct(lab.gbm.p05Pct) + ' to ' +
        signedPct(lab.gbm.p95Pct) + ' from today. ' +
        fmtNum(lab.gbm.paths, 0) + ' paths, drift and volatility from the last two years (' +
        pct(lab.gbm.annVol, 0) + ' annualised).',
      assumes: 'returns are independent, identically distributed and normal, and the next month ' +
        'resembles the last two years.',
      fails: 'returns are none of those things. Moves cluster, tails are fatter than normal, and ' +
        'prices gap on news — so this understates the chance of a large move, most in exactly the ' +
        'situations worth knowing about. The drift is also estimated from ~500 days, and that ' +
        'estimate alone moves this figure by several points — so read the first digit and ignore ' +
        'the decimal. It says "near a coin flip", not anything more precise.'
    }));
  }

  if (lab.garch && lab.gbmCond){
    const elevated = lab.garch.volRatio > 1;
    cards.push(modelCard({
      title: 'GARCH(1,1) — volatility now, and the same question re-run on it',
      value: pct(lab.gbmCond.pUp) + '  ·  ' + pct(lab.garch.annVolNow, 0) + ' annualised now',
      sub: 'Long-run level ' + pct(lab.garch.annVolUnc, 0) + ', so current volatility is ' +
        fmtNum(lab.garch.volRatio, 2) + '× its own norm' +
        (elevated ? ' — elevated' : ' — subdued') + '. A shock decays halfway back in about ' +
        fmtNum(lab.garch.halfLife, 0) + ' trading days (persistence ' + fmtNum(lab.garch.persistence, 3) + ').',
      assumes: 'volatility clusters and reverts to a constant long-run level, and shocks are ' +
        'symmetric — a 3% fall and a 3% rise raise tomorrow’s volatility equally.',
      fails: 'equity volatility is not symmetric: falls raise it far more than rises do, which ' +
        'plain GARCH cannot represent. The parameters are also fitted on a coarse grid and ' +
        'reported without standard errors, so persistence and half-life are indicative, not measured.'
    }));
  }

  if (lab.hmm){
    // Three bands, not two. The source in models/hmm.js puts the arbitrary/real boundary at
    // 0.1 and 0.3, and a two-way split called a separation of 0.10 "genuinely
    // distinguishable" — which is precisely the overclaim this block exists to avoid.
    const sep = lab.hmm.separation;
    const separationNote = sep < 0.1
      ? ' — too low for the split to mean anything; treat this whole row as noise.'
      : sep < 0.3
        ? ' — marginal. The two states overlap heavily, so read the probability above as weak evidence at best.'
        : ' — the two states are genuinely distinguishable.';
    cards.push(modelCard({
      title: 'Hidden Markov regime model — P(in the higher-drift state)',
      value: pct(lab.hmm.pBullNow) + ' now, ' + pct(lab.hmm.pBullNext) + ' tomorrow',
      // States are named by drift, not by calm: the model sorts them on fitted mean, and on
      // real data the higher-drift state often carries the higher volatility too.
      sub: 'Higher-drift state: ' + signedPct(lab.hmm.muBullAnn, 0) + '/yr at ' + pct(lab.hmm.volBullAnn, 0) +
        ' volatility, typically lasting ' + fmtNum(lab.hmm.expectedDaysBull, 0) + ' days. ' +
        'Lower-drift state: ' + signedPct(lab.hmm.muBearAnn, 0) + '/yr at ' + pct(lab.hmm.volBearAnn, 0) +
        ', lasting ' + fmtNum(lab.hmm.expectedDaysBear, 0) + ' days. ' +
        'State separation ' + fmtNum(lab.hmm.separation, 2) + separationNote,
      assumes: 'there are exactly two market states and today’s depends only on yesterday’s.',
      fails: 'markets have more than two moods, and a genuine third regime gets split across the ' +
        'two rather than recognised. It is also fitted on the whole window including recent data, ' +
        'so its reading of today is not out-of-sample — it will always look like it spotted the ' +
        'last crash, because it was shown the last crash.'
    }));
  }

  if (lab.logistic){
    const l = lab.logistic;
    cards.push(modelCard({
      title: 'Walk-forward classifier — out-of-sample edge over the base rate',
      value: l.hasEdge ? signedPct(l.edge) + ' edge' : 'No edge — ' + signedPct(l.edge),
      sub: 'Accuracy ' + pct(l.accuracy) + ' against a ' + pct(l.baseRate) +
        ' base rate on ' + fmtNum(l.nTest, 0) + ' unseen cases (trained on ' + fmtNum(l.nTrain, 0) +
        '). Brier score ' + fmtNum(l.brier, 3) +
        (l.brier < 0.25 ? ' — better than a constant 50% guess, which scores 0.25.'
          : ' — worse than a constant 50% guess, which scores 0.25.') +
        ' Its current reading is ' + pct(l.pUp) +
        (l.hasEdge ? '.' : ', and it is excluded from the blend below because it earned no edge.'),
      assumes: 'the relationship between these eight technical features and the next month’s ' +
        'direction is stable enough to learn from the first 70% and apply to the last 30%.',
      fails: 'usually. No edge is the expected result for short-horizon equity direction, and this ' +
        'row exists to say so rather than to be beaten. Consecutive training rows also overlap ' +
        '(a 21-day label on Monday shares 20 days with Tuesday’s), which makes the accuracy ' +
        'figure less precise than its case count suggests.'
    }));
  }

  const ens = lab.ensemble;
  const ensembleHtml = !ens ? '' :
    '<div class="metric" style="grid-column:1 / -1;border-color:var(--gold)">' +
      '<div class="k">Blended — ' + fmtNum(ens.nUsed, 0) + ' models, weighted log-odds</div>' +
      '<div class="v">' + pct(ens.posterior) + '</div>' +
      '<div class="sub">' + esc(ens.agreement) + ' (spread ' + fmtNum(ens.disagreement, 1) +
        ' points across ' + esc(ens.used.map((u) => u.name).join(', ')) + ').</div>' +
      '<div class="sub" style="margin-top:6px"><b>Read this last, and least.</b> ' + esc(ens.caveat) + '</div>' +
    '</div>';

  const dcfHtml = !lab.dcfMc ? '' :
    '<div class="section-label" style="margin-top:18px"><span>Valuation under uncertainty</span>' +
      '<span class="rule-line"></span></div>' +
    '<div class="metric-grid">' +
      modelCard({
        title: 'DCF Monte Carlo — P(worth more than today’s price, under this model)',
        value: pct(lab.dcfMc.pUndervalued),
        sub: 'Across ' + fmtNum(lab.dcfMc.runs, 0) + ' drawn assumption sets the model’s value ' +
          'ranged from ₹' + fmtNum(lab.dcfMc.p10Value, 0) + ' (10th percentile) to ₹' +
          fmtNum(lab.dcfMc.p90Value, 0) + ' (90th) around a median of ₹' +
          fmtNum(lab.dcfMc.medianValue, 0) + ' — a ' + fmtNum(lab.dcfMc.spreadRatio, 1) +
          '× spread. Growth drawn ±' + pct(lab.dcfMc.priors.growthSd * 100, 0) +
          ', discount rate ±' + pct(lab.dcfMc.priors.discountSd * 100, 1) +
          ', terminal growth around ' + pct(lab.dcfMc.priors.terminalMean * 100, 0) + '.',
        assumes: 'the priors above. They are chosen, not measured — a wider growth prior produces ' +
          'a less confident answer from identical financials.',
        fails: 'this is not a probability the price rises and carries no horizon at all. A company ' +
          'can be 80% undervalued by this model and fall for three years. The spread is the point: ' +
          'it is why this page reports pillars separately instead of a verdict.'
      }) +
    '</div>';

  body.innerHTML =
    '<div class="note-inline">Everything below is <b>model output, not forecast</b>. Each row states ' +
    'what it assumes and how it breaks, because a probability without those is a number pretending ' +
    'to be knowledge. Horizon is ' + lab.horizonDays + ' trading days throughout. ' +
    'The options-implied probability in the block above is deliberately <b>not</b> blended in here: ' +
    'it is a risk-neutral probability, a different quantity from these real-world ones, and mixing ' +
    'the two would produce a number that is neither.</div>' +
    '<div class="metric-grid" style="margin-top:12px">' + cards.join('') + ensembleHtml + '</div>' +
    dcfHtml;

  return lab;
}
