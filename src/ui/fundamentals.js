// The fundamentals grid and company profile.
//
// renderFundamentalsUnavailable exists because the quoteSummary endpoint is the most
// fragile thing this app depends on — it needs the Yahoo crumb and returns 401 when that
// handshake lapses. When it fails the panel says so explicitly and the price and technical
// blocks carry on, because those are computed locally from price history and do not touch
// that endpoint.

import { val } from '../data/yahoo.js';
import { fmtNum, fmtCr, fmtPct } from './format.js';

export function renderFundamentals(f){
  const sd = f.summaryDetail || {}, ks = f.defaultKeyStatistics || {}, fd = f.financialData || {};
  const mh = f.majorHoldersBreakdown || null;
  const grid = document.getElementById('fundamentalsGrid');
  if (!grid) return;
  const marketCap = val(sd.marketCap) || val(ks.enterpriseValue);
  if (marketCap) document.getElementById('mcapStat') && (document.getElementById('mcapStat').textContent = fmtCr(marketCap));

  const items = [
    ['Market cap', marketCap!=null ? fmtCr(marketCap) : '—', ''],
    ['P/E (TTM)', fmtNum(val(sd.trailingPE),2), ''],
    ['Forward P/E', fmtNum(val(sd.forwardPE),2), ''],
    ['P/B', fmtNum(val(ks.priceToBook),2), ''],
    ['EPS (TTM)', val(ks.trailingEps)!=null ? '₹'+fmtNum(val(ks.trailingEps),2) : '—', ''],
    ['Dividend yield', val(sd.dividendYield)!=null ? fmtPct(val(sd.dividendYield)*100,2) : '—', ''],
    ['PEG ratio', fmtNum(val(ks.pegRatio),2), ''],
    ['Beta (Yahoo)', fmtNum(val(sd.beta) || val(ks.beta),2), ''],
    ['ROE', val(fd.returnOnEquity)!=null ? fmtPct(val(fd.returnOnEquity)*100,2) : '—', ''],
    ['ROA', val(fd.returnOnAssets)!=null ? fmtPct(val(fd.returnOnAssets)*100,2) : '—', ''],
    ['Debt / Equity', fmtNum(val(fd.debtToEquity),2), ''],
    ['Current ratio', fmtNum(val(fd.currentRatio),2), ''],
    ['Profit margin', val(fd.profitMargins)!=null ? fmtPct(val(fd.profitMargins)*100,2) : '—', ''],
    ['Operating margin', val(fd.operatingMargins)!=null ? fmtPct(val(fd.operatingMargins)*100,2) : '—', ''],
    ['Revenue growth (YoY)', val(fd.revenueGrowth)!=null ? fmtPct(val(fd.revenueGrowth)*100,2) : '—', ''],
    ['Earnings growth (YoY)', val(fd.earningsGrowth)!=null ? fmtPct(val(fd.earningsGrowth)*100,2) : '—', ''],
    ['Analyst mean target', val(fd.targetMeanPrice)!=null ? '₹'+fmtNum(val(fd.targetMeanPrice),2) : '—', ''],
    ['Analyst recommendation', fd.recommendationKey ? fd.recommendationKey.replace(/_/g,' ') : '—', val(fd.numberOfAnalystOpinions)!=null ? val(fd.numberOfAnalystOpinions)+' analysts' : ''],
    ['Analyst target range', (val(fd.targetLowPrice)!=null && val(fd.targetHighPrice)!=null) ? '₹'+fmtNum(val(fd.targetLowPrice),0)+' – ₹'+fmtNum(val(fd.targetHighPrice),0) : '—', 'Low to high of published targets'],
    ['Enterprise value', val(ks.enterpriseValue)!=null ? fmtCr(val(ks.enterpriseValue)) : '—', 'Market cap plus net debt'],
    ['EV / EBITDA', fmtNum(val(ks.enterpriseToEbitda),2), 'Valuation independent of capital structure'],
    ['EV / Revenue', fmtNum(val(ks.enterpriseToRevenue),2), ''],
    ['Price / Sales', fmtNum(val(sd.priceToSalesTrailing12Months),2), ''],
    ['Book value / share', val(ks.bookValue)!=null ? '₹'+fmtNum(val(ks.bookValue),2) : '—', ''],
    ['Total revenue (TTM)', val(fd.totalRevenue)!=null ? fmtCr(val(fd.totalRevenue)) : '—', ''],
    ['EBITDA', val(fd.ebitda)!=null ? fmtCr(val(fd.ebitda)) : '—', ''],
    ['Gross margin', val(fd.grossMargins)!=null ? fmtPct(val(fd.grossMargins)*100,2) : '—', ''],
    ['EBITDA margin', val(fd.ebitdaMargins)!=null ? fmtPct(val(fd.ebitdaMargins)*100,2) : '—', ''],
    ['Total cash', val(fd.totalCash)!=null ? fmtCr(val(fd.totalCash)) : '—', val(fd.totalCashPerShare)!=null ? '₹'+fmtNum(val(fd.totalCashPerShare),2)+' per share' : ''],
    ['Total debt', val(fd.totalDebt)!=null ? fmtCr(val(fd.totalDebt)) : '—', ''],
    ['Quick ratio', fmtNum(val(fd.quickRatio),2), 'Liquidity excluding inventory'],
    ['Operating cash flow', val(fd.operatingCashflow)!=null ? fmtCr(val(fd.operatingCashflow)) : '—', ''],
    ['Free cash flow', val(fd.freeCashflow)!=null ? fmtCr(val(fd.freeCashflow)) : '—', 'Cash left after capital spending'],
    ['Revenue / share', val(fd.revenuePerShare)!=null ? '₹'+fmtNum(val(fd.revenuePerShare),2) : '—', ''],
    ['Shares outstanding', val(ks.sharesOutstanding)!=null ? fmtNum(val(ks.sharesOutstanding)/1e7,2)+' Cr' : '—', ''],
    ['Float', val(ks.floatShares)!=null ? fmtNum(val(ks.floatShares)/1e7,2)+' Cr' : '—', 'Freely tradable shares'],
    ['Promoter / insider holding', mh && val(mh.insidersPercentHeld)!=null ? fmtPct(val(mh.insidersPercentHeld)*100,2) : '—', ''],
    ['Institutional holding', mh && val(mh.institutionsPercentHeld)!=null ? fmtPct(val(mh.institutionsPercentHeld)*100,2) : '—', ''],
    ['52-week change', val(ks['52WeekChange'])!=null ? fmtPct(val(ks['52WeekChange'])*100,1) : '—', ''],
    ['Vs Nifty (52w)', val(ks.SandP52WeekChange)!=null ? fmtPct(val(ks.SandP52WeekChange)*100,1) : '—', 'Benchmark move over the same period'],
    ['Payout ratio', val(sd.payoutRatio)!=null ? fmtPct(val(sd.payoutRatio)*100,1) : '—', 'Share of earnings paid as dividend'],
    ['Short ratio', fmtNum(val(ks.shortRatio),2), ''],
  ];
  grid.innerHTML = items.map(([k,v,sub]) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`).join('');

  const ap = f.assetProfile;
  if (ap){
    document.getElementById('profileBadges').innerHTML = [ap.sector,ap.industry].filter(Boolean).map(s=>`<span class="badge">${s}</span>`).join('');
    const summary = ap.longBusinessSummary ? (ap.longBusinessSummary.length > 420 ? ap.longBusinessSummary.slice(0,420) + '…' : ap.longBusinessSummary) : null;
    document.getElementById('profileBlock').innerHTML = summary
      ? `${summary}${ap.fullTimeEmployees ? `<br><br><b>Employees:</b> ${fmtNum(ap.fullTimeEmployees,0)}` : ''}`
      : 'No company profile available for this symbol.';
  } else {
    document.getElementById('profileBlock').textContent = 'No company profile available for this symbol.';
  }
}

export function renderFundamentalsUnavailable(){
  const grid = document.getElementById('fundamentalsGrid');
  if (grid) grid.innerHTML = `<div class="note-inline">Yahoo's fundamentals endpoint didn't respond (it's stricter than the price feed and sometimes blocks unauthenticated requests). Price and technicals above are unaffected — try again shortly.</div>`;
  const pb = document.getElementById('profileBlock');
  if (pb) pb.textContent = 'Company profile unavailable right now.';
}
