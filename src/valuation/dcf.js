// Discounted cash flow.
//
// Read the guard rails before trusting any single output:
//   - Base free cash flow is the latest year's OCF minus capex. If that is negative the
//     function returns { error }, never a number — a DCF on negative FCF is meaningless,
//     and a plausible-looking figure would be worse than a blank (CLAUDE.md invariant 3).
//   - Historical FCF growth is clamped to [-5%, +20%] and then faded by 15% a year toward
//     the terminal rate, so one freak year cannot run away with the model.
//   - The discount rate is CAPM (7% risk-free + beta x 6% ERP) clamped to [11%, 16%].
//     The 7% is an ASSUMPTION about the India 10Y, not fetched data, and the UI labels it
//     as such. Yahoo's betas for Indian names are often understated, so a beta below 0.2
//     is treated as 1.0.
//   - Terminal growth is fixed at 4%.
//
// The 3x3 sensitivity grid is the point of the output, not the single intrinsic value:
// ADR-003 records that the result swings 40%+ across defensible assumptions, which is why
// this feeds a range and never a target price.

/**
 * Sectors where OCF-minus-capex is not free cash flow, and this model must decline.
 *
 * For a bank, operating cash flow is dominated by deposit inflows and loan originations —
 * financing activity that happens to be classified as operating. Capex is a rounding error
 * against it. Their difference is not cash available to shareholders; it is mostly a
 * measure of how fast the loan book grew that year, and it can be hugely positive in a bad
 * year and negative in a good one. Insurers have the same problem with float.
 *
 * HDFCBANK was the case that exposed this: the model computed an intrinsic value with
 * growth pinned at its +20% cap, from cash-flow swings that had nothing to do with the
 * economics of the business. It produced a confident number that meant nothing, which
 * CLAUDE.md invariant 3 exists to prevent — a filled cell has to be real.
 *
 * Valuing a lender properly needs a different model (residual income, or a P/B to ROE
 * comparison against cost of equity). That is a feature, not a patch, and until it exists
 * the honest output is an explanation rather than a figure.
 */
const NO_DCF_SECTORS = ['financial services', 'financial'];
const NO_DCF_INDUSTRY_WORDS = ['bank', 'insurance', 'capital markets', 'asset management', 'credit services'];

export function isDcfUnsuitableSector(sector, industry){
  const s = String(sector || '').toLowerCase().trim();
  const i = String(industry || '').toLowerCase().trim();
  if (NO_DCF_SECTORS.includes(s)) return true;
  return NO_DCF_INDUSTRY_WORDS.some((w) => i.includes(w));
}

/**
 * @param {object} ann     annual OCF/capex/NI/revenue/assets series
 * @param {number} price
 * @param {number} shares
 * @param {number} beta
 * @param {number} netDebt
 * @param {object} [profile]  `{ sector, industry }` from Yahoo's assetProfile. Optional so
 *   existing callers keep working, but when it identifies a lender the model declines —
 *   see NO_DCF_SECTORS above.
 */
export function computeDcf(ann, price, shares, beta, netDebt, profile){
  if (profile && isDcfUnsuitableSector(profile.sector, profile.industry)){
    return { error: 'A discounted cash flow is not a meaningful way to value a bank, insurer ' +
      'or lender. For these businesses operating cash flow is dominated by deposits and loan ' +
      'originations rather than by trading profit, so operating cash flow minus capital ' +
      'expenditure is not free cash flow at all — it largely tracks how fast the loan book ' +
      'grew. This model declines rather than printing a number that would look authoritative ' +
      'and mean nothing. Use book value against return on equity for a lender instead.' };
  }
  const ocf = ann.ocf.map(x=>x.v), capex = ann.capex.map(x=>Math.abs(x.v));
  if (!ocf.length || !shares) return null;
  const years = Math.min(ocf.length, capex.length || ocf.length);
  const fcf = [];
  for (let i=0;i<years;i++) fcf.push(ocf[i] - (capex[i]||0));
  const base = fcf[fcf.length-1];
  if (!(base > 0)) return { error: 'Free cash flow is negative or unavailable, so a DCF would be meaningless here.' };
  let g = 0.08;
  if (fcf.length >= 2 && fcf[0] > 0){
    const yrs = fcf.length - 1;
    g = Math.pow(base/fcf[0], 1/yrs) - 1;
  }
  g = Math.max(-0.05, Math.min(0.20, g));
  const rf = 0.07, erp = 0.06;                 // India 10Y ~7%, equity risk premium ~6%
  const b = (beta && beta > 0.2) ? beta : 1.0; // Yahoo betas for Indian names are often understated
  let disc = rf + b*erp;
  disc = Math.max(0.11, Math.min(0.16, disc));
  const tg = 0.04;                              // terminal growth ~ long-run nominal GDP-ish
  let pv = 0, f = base;
  const rows = [];
  for (let y=1; y<=10; y++){
    const gy = g * Math.pow(0.85, y-1);         // fade growth toward terminal
    f = f * (1 + Math.max(tg, gy));
    const d = f / Math.pow(1+disc, y);
    pv += d;
    if (y<=5) rows.push({ y, fcf: f, pv: d });
  }
  const term = (f * (1+tg)) / (disc - tg);
  const pvTerm = term / Math.pow(1+disc, 10);
  const ev = pv + pvTerm;
  const eq = ev - (netDebt || 0);
  const iv = eq / shares;
  return {
    base, growth: g, disc, tg, shares, netDebt: netDebt||0,
    pvExplicit: pv, pvTerminal: pvTerm, ev, equity: eq,
    intrinsic: iv, price,
    upside: ((iv - price)/price)*100,
    rows,
    sens: [0.11,0.13,0.15].map(dr => ({
      dr,
      vals: [Math.max(-0.02,g-0.04), g, g+0.04].map(gg => {
        let ff = base, p2 = 0;
        for (let y=1;y<=10;y++){ const gy = gg*Math.pow(0.85,y-1); ff = ff*(1+Math.max(tg,gy)); p2 += ff/Math.pow(1+dr,y); }
        const t2 = (ff*(1+tg))/(dr-tg)/Math.pow(1+dr,10);
        return ((p2+t2-(netDebt||0))/shares);
      })
    }))
  };
}
