// The intraday desk: opening range, VWAP, gap and relative volume for the current session.
//
// Everything here is derived from 5-minute bars, so it is empty outside market hours and
// says so rather than showing yesterday's numbers as though they were today's.

import { openingRange, vwapSeries, gapPct, relativeVolume } from '../indicators/intraday.js';
import { fmtNum, fmtPct } from './format.js';

export function renderIntradayDesk(intraday, ctx){
  const block = document.getElementById('intradayBlock');
  if (!block) return;
  const n = intraday.closes.length;
  if (!n){
    block.innerHTML = `<div class="note-inline">No intraday bars available — this is normal outside market hours or right at the open.</div>`;
    return;
  }
  const vw = vwapSeries(intraday);
  const vwap = vw[vw.length-1];
  const last = intraday.closes[n-1];
  const dayOpen = intraday.opens[0];
  const sessHigh = Math.max(...intraday.highs);
  const sessLow = Math.min(...intraday.lows);
  const orb = openingRange(intraday, 15);
  const gap = gapPct(dayOpen, ctx.prevClose);
  const dayVol = intraday.volumes.reduce((a,b)=>a+b,0);
  const rvol = relativeVolume(dayVol, ctx.avgVol20);
  const atr = ctx.atr14;
  const p = ctx.pivots;

  const vwapSide = vwap == null ? '—' :
    (last >= vwap ? '<span class="up">above VWAP</span>' : '<span class="down">below VWAP</span>');
  const vwapDist = vwap ? ((last - vwap)/vwap*100) : null;

  const orbState = !orb ? '—' :
    (last > orb.high ? '<span class="up">above opening range</span>'
     : last < orb.low ? '<span class="down">below opening range</span>'
     : 'inside opening range');

  const rangeUsed = (sessHigh - sessLow);
  const atrUsedPct = atr ? (rangeUsed / atr) * 100 : null;

  block.innerHTML = `
    <div class="metric-grid">
      <div class="metric"><div class="k">VWAP</div><div class="v">${vwap==null?'—':'₹'+fmtNum(vwap,2)}</div>
        <div class="sub">Price ${vwapSide}${vwapDist!=null?' by '+fmtNum(Math.abs(vwapDist),2)+'%':''}</div></div>
      <div class="metric"><div class="k">Opening range (15m)</div><div class="v" style="font-size:14px;">${orb?'₹'+fmtNum(orb.low,2)+' – ₹'+fmtNum(orb.high,2):'—'}</div>
        <div class="sub">${orbState}</div></div>
      <div class="metric"><div class="k">Gap at open</div><div class="v ${gap>=0?'up':'down'}">${gap==null?'—':fmtPct(gap,2)}</div>
        <div class="sub">Open vs previous close</div></div>
      <div class="metric"><div class="k">Relative volume</div><div class="v ${rvol>=1?'up':'down'}">${rvol==null?'—':fmtNum(rvol,2)+'x'}</div>
        <div class="sub">Session volume vs 20-day average</div></div>
      <div class="metric"><div class="k">Session range</div><div class="v" style="font-size:14px;">₹${fmtNum(sessLow,2)} – ₹${fmtNum(sessHigh,2)}</div>
        <div class="sub">${atrUsedPct!=null?fmtNum(atrUsedPct,0)+'% of a typical (ATR) day used':''}</div></div>
      <div class="metric"><div class="k">Bars so far</div><div class="v">${n}</div><div class="sub">5-minute intervals</div></div>
      <div class="metric" style="grid-column:span 2;"><div class="k">Intraday pivot levels</div>
        <div class="v" style="font-size:13px;">S2 ${fmtNum(p.s2,0)} · S1 ${fmtNum(p.s1,0)} · <b>P ${fmtNum(p.p,0)}</b> · R1 ${fmtNum(p.r1,0)} · R2 ${fmtNum(p.r2,0)}</div>
        <div class="sub">Classic pivots from the previous session</div></div>
      <div class="metric" style="grid-column:span 2;"><div class="k">Expected daily move (ATR-14)</div>
        <div class="v" style="font-size:14px;">± ₹${atr==null?'—':fmtNum(atr,2)}</div>
        <div class="sub">Average true range — how far this stock typically travels in a day</div></div>
    </div>
    <div class="note-inline" style="margin-top:12px;">These are descriptive session statistics, not entry or exit signals. VWAP, opening range and pivots are reference levels traders watch; where price sits relative to them is a fact, what to do about it isn't.</div>
  `;
}

export function renderIntradayVWAP(intraday){
  const stat = document.getElementById('vwapStat');
  if (!stat) return;
  let num=0, den=0;
  for (let i=0;i<intraday.closes.length;i++){
    const typical = (intraday.highs[i]+intraday.lows[i]+intraday.closes[i])/3;
    num += typical*intraday.volumes[i]; den += intraday.volumes[i];
  }
  const vwap = den>0 ? num/den : null;
  stat.querySelector('.v').textContent = vwap!=null ? '₹'+fmtNum(vwap,2) : '—';
}
