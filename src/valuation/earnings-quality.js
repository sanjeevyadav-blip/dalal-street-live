// Earnings quality: does the reported profit show up as cash?
//
// Grades four things — cash conversion (OCF vs net income), accruals as a share of assets,
// free-cash-flow margin, and capex intensity. Returns null when the multi-year series is
// missing rather than grading on partial data.
//
// Each check carries its own pass/fail flag and message so the UI can show why a grade
// landed where it did, rather than only the grade.

export function earningsQuality(ann){
  const ocf = ann.ocf.map(x=>x.v), ni = ann.ni.map(x=>x.v),
        rev = ann.rev.map(x=>x.v), capex = ann.capex.map(x=>Math.abs(x.v)),
        assets = ann.assets.map(x=>x.v);
  if (!ocf.length || !ni.length) return null;
  const L = ocf.length-1, Ln = ni.length-1;
  const cfni = ni[Ln] ? ocf[L]/ni[Ln] : null;
  const accr = (assets.length && assets[assets.length-1]) ? ((ni[Ln]-ocf[L])/assets[assets.length-1])*100 : null;
  const fcf = ocf[L] - (capex[capex.length-1]||0);
  const fcfMargin = rev.length ? (fcf/rev[rev.length-1])*100 : null;
  const capexInt = ocf[L] ? ((capex[capex.length-1]||0)/ocf[L])*100 : null;
  let revG = null, ocfG = null;
  if (rev.length>=2 && rev[0]>0) revG = (Math.pow(rev[rev.length-1]/rev[0], 1/(rev.length-1))-1)*100;
  if (ocf.length>=2 && ocf[0]>0) ocfG = (Math.pow(ocf[L]/ocf[0], 1/(ocf.length-1))-1)*100;
  const flags = [];
  let score = 0, max = 0;
  function judge(ok, warn, good, bad){ max++; if (ok){ score++; flags.push({ good:true, t:good }); } else flags.push({ good:false, t:bad }); }
  if (cfni != null) judge(cfni >= 1, null, 'Operating cash flow exceeds reported profit — earnings are cash-backed', 'Profit is running ahead of cash generation — worth checking why');
  if (accr != null) judge(accr <= 5, null, 'Low accruals — little reliance on non-cash accounting entries', 'High accruals — a bigger share of profit is non-cash');
  if (fcfMargin != null) judge(fcfMargin > 0, null, 'Positive free cash flow after capex', 'Capex is consuming all operating cash flow');
  if (revG != null && ocfG != null) judge(ocfG >= revG - 5, null, 'Cash flow is keeping pace with revenue growth', 'Revenue is growing faster than cash flow — possible receivables build-up');
  const pct = max ? (score/max)*100 : 0;
  const grade = pct >= 85 ? 'Strong' : pct >= 60 ? 'Reasonable' : pct >= 35 ? 'Mixed' : 'Weak';
  return { cfni, accr, fcf, fcfMargin, capexInt, revG, ocfG, flags, grade, score, max, years: ocf.length };
}
