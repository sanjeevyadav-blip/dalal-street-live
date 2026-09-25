// Shareholding: who owns the company, quarter by quarter, and how much of the promoter's
// stake is pledged. On the Financials tab.
//
// Yahoo only has today's promoter figure, a single number with no history. The trend is the
// point: a promoter stake drifting down for six quarters is a different fact from one that
// has been flat, and neither is visible from one snapshot.

import { fetchShareholding, fetchPledge, shareholdingQuarters, pledgeSummary } from '../data/nse.js';
import { detailState } from './detail-state.js';
import { fmtNum } from './format.js';
import { suppressed } from '../suppressed.js';

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const label = (d) => MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();

function fmtShares(n){
  if (n >= 1e7) return fmtNum(n / 1e7, 2) + ' Cr';
  if (n >= 1e5) return fmtNum(n / 1e5, 2) + ' L';
  return fmtNum(n, 0);
}

function changeCell(x){
  if (x == null) return '<td class="num">—</td>';
  if (x === 0) return '<td class="num">0.00</td>';
  return '<td class="num ' + (x > 0 ? 'up' : 'down') + '">' + (x > 0 ? '+' : '−') + fmtNum(Math.abs(x), 2) + '</td>';
}

export function shareholdingHtml(quarters, pledge){
  if (!quarters.length){
    return '<div class="note-inline">NSE returned no shareholding filings for this company.</div>';
  }
  const latest = quarters[0];
  const oldest = quarters[quarters.length - 1];
  const drift = quarters.length > 1 ? latest.promoter - oldest.promoter : null;

  const pledgeCard = !pledge
    ? '<div class="metric"><div class="k">Promoter shares pledged</div><div class="v">—</div>' +
      '<div class="sub">NSE returned no pledge disclosure</div></div>'
    : pledge.sharesPledged === 0
      ? '<div class="metric"><div class="k">Promoter shares pledged</div><div class="v up">None</div>' +
        '<div class="sub">As disclosed' + (pledge.asOf ? ' for ' + label(pledge.asOf) : '') + '</div></div>'
      : '<div class="metric"><div class="k">Promoter shares pledged</div>' +
        '<div class="v' + (pledge.ofPromoter != null && pledge.ofPromoter >= 20 ? ' down' : '') + '">' +
        (pledge.ofPromoter == null ? '—' : fmtNum(pledge.ofPromoter, 1) + '%') + '</div>' +
        '<div class="sub">of the promoter’s stake · ' +
        (pledge.ofCompany == null ? '' : fmtNum(pledge.ofCompany, 2) + '% of all shares · ') +
        fmtShares(pledge.sharesPledged) + ' shares' + (pledge.asOf ? ' · ' + label(pledge.asOf) : '') + '</div></div>';

  return '<div class="metric-grid" style="margin-bottom:14px">' +
      '<div class="metric"><div class="k">Promoter holding</div><div class="v">' + fmtNum(latest.promoter, 2) + '%</div>' +
      '<div class="sub">' + label(latest.date) +
      (drift == null ? '' : ' · ' + (drift >= 0 ? '+' : '−') + fmtNum(Math.abs(drift), 2) +
        ' pts over ' + quarters.length + ' quarters') + '</div></div>' +
      '<div class="metric"><div class="k">Public holding</div><div class="v">' +
      (latest.public == null ? '—' : fmtNum(latest.public, 2) + '%') + '</div>' +
      '<div class="sub">Institutions and retail together</div></div>' +
      pledgeCard +
    '</div>' +
    '<div class="rank-scroll"><table class="book share-table">' +
      '<thead><tr><th>Quarter</th><th>Promoter</th><th>Change</th><th>Public</th></tr></thead><tbody>' +
      quarters.map(q => '<tr><td class="sym">' + label(q.date) + '</td>' +
        '<td class="num">' + fmtNum(q.promoter, 2) + '%</td>' + changeCell(q.change) +
        '<td class="num">' + (q.public == null ? '—' : fmtNum(q.public, 2) + '%') + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="note-inline" style="margin-top:12px">' +
      '<b>How to read this.</b> A falling promoter stake is not automatically a warning — a share sale to ' +
      'institutions or a fresh issue dilutes it too. A rising one is not automatically confidence — a buyback ' +
      'raises it without the promoter buying anything. Pledged shares are the sharper signal: lenders can sell ' +
      'them if the price falls, which can force the very decline they were protecting against. ' +
      '<b>Not shown:</b> the split between foreign and domestic institutions. NSE’s summary publishes only ' +
      'promoter and public; the breakdown sits inside each filing’s XBRL document, which this app does not ' +
      'read. Source: NSE shareholding-pattern and pledge disclosures.' +
    '</div>';
}

export async function renderShareholding(symbol){
  const block = document.getElementById('shareBlock');
  if (!block) return;
  if (!/\.NS$/.test(symbol)){
    block.innerHTML = '<div class="note-inline">Shareholding history comes from NSE, so it is shown for NSE listings only.</div>';
    return;
  }
  const ticker = symbol.replace(/\.NS$/, '');
  block.innerHTML = '<div class="note-inline">Fetching NSE shareholding filings…</div>';
  try {
    // The pledge disclosure is a separate, less reliable endpoint. Its failure must not
    // cost the reader the shareholding table, which is the main content here.
    const [rows, pledgeRaw] = await Promise.all([
      fetchShareholding(ticker),
      fetchPledge(ticker).catch(err => { suppressed('shareholding: pledge', err); return null; })
    ]);
    if (detailState.symbol !== symbol) return;
    block.innerHTML = shareholdingHtml(shareholdingQuarters(rows, 8), pledgeSummary(pledgeRaw));
  } catch (err) {
    suppressed('shareholding: pattern', err);
    if (detailState.symbol !== symbol) return;
    // A Retry button rather than "open the stock again". NSE drops connections from
    // Cloudflare's edge intermittently — measured at roughly half of requests in one bad
    // spell, across every NSE endpoint including the long-standing option chain — and the
    // proxy layer's single automatic retry still loses about a quarter at that rate.
    // Re-opening the whole stock to retry one block would refetch a dozen others.
    block.innerHTML = '<div class="note-inline">NSE’s shareholding data did not respond — NSE ' +
      'intermittently drops requests from cloud servers, and a second try usually works. ' +
      '<button type="button" class="retry-btn" id="shareRetry">Retry</button></div>';
    const retry = document.getElementById('shareRetry');
    if (retry) retry.addEventListener('click', () => renderShareholding(symbol));
  }
}
