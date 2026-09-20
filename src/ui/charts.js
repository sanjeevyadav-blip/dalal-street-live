// All charting, drawn straight onto <canvas> with no library.
//
// That is a deliberate trade (docs/14 ADR): the whole app is one static file with no build
// step at the time it was written, and a charting library would have been the largest
// dependency by far. The cost is that axes, scaling and hit-testing are hand-rolled here.
//
// Everything reads from detailState.chartData, which holds the full 2-year series. Changing
// the visible range re-slices that in place rather than re-fetching — RANGE_DAYS maps a
// range key to a bar count.
//
// drawChart is also bound to window resize in app.js, so it must stay safe to call at any
// time; it returns early when there is no chart data.

import { detailState } from './detail-state.js';
import { fmtNum } from './format.js';

export const RANGE_DAYS = { '1m':22, '3m':66, '6m':132, '1y':252, '2y':504 };

export function drawChart(){
  if (!detailState.chartData) return;
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const n = RANGE_DAYS[detailState.range] || 252;
  const slice = (arr) => arr.slice(Math.max(0, arr.length - n));
  const dates = slice(detailState.chartData.dates), closes = slice(detailState.chartData.closes);
  const sma50 = slice(detailState.chartData.sma50), sma200 = slice(detailState.chartData.sma200);
  const bollUpper = slice(detailState.chartData.bollUpper), bollLower = slice(detailState.chartData.bollLower);

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w*dpr; canvas.height = h*dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);

  const padding = { top:14, right:14, bottom:24, left:56 };
  const plotW = w - padding.left - padding.right, plotH = h - padding.top - padding.bottom;
  const allVals = closes.concat(sma50.filter(v=>v!=null)).concat(sma200.filter(v=>v!=null)).concat(bollUpper.filter(v=>v!=null)).concat(bollLower.filter(v=>v!=null));
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const yScale = v => padding.top + plotH - ((v-minV)/((maxV-minV)||1))*plotH;
  const xScale = i => padding.left + (closes.length>1 ? (i/(closes.length-1))*plotW : plotW/2);

  ctx.strokeStyle = 'rgba(237,230,214,0.08)'; ctx.fillStyle = '#9DA8B4'; ctx.font = '11px IBM Plex Mono';
  const ticks = 4;
  for (let t=0;t<=ticks;t++){
    const v = minV + (maxV-minV)*(t/ticks); const y = yScale(v);
    ctx.beginPath(); ctx.moveTo(padding.left,y); ctx.lineTo(w-padding.right,y); ctx.stroke();
    ctx.fillText(v.toFixed(0), 4, y+4);
  }

  // Bollinger band shading
  ctx.beginPath();
  let started=false;
  bollUpper.forEach((v,i) => { if (v==null) return; const x=xScale(i), y=yScale(v); if (!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y); });
  for (let i=bollLower.length-1;i>=0;i--){ if (bollLower[i]==null) continue; ctx.lineTo(xScale(i), yScale(bollLower[i])); }
  ctx.closePath(); ctx.fillStyle = 'rgba(110,155,201,0.08)'; ctx.fill();

  ctx.beginPath();
  closes.forEach((c,i) => { const x=xScale(i), y=yScale(c); if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.lineTo(xScale(closes.length-1), padding.top+plotH); ctx.lineTo(xScale(0), padding.top+plotH); ctx.closePath();
  const grad = ctx.createLinearGradient(0,padding.top,0,padding.top+plotH);
  grad.addColorStop(0,'rgba(201,162,75,0.22)'); grad.addColorStop(1,'rgba(201,162,75,0)');
  ctx.fillStyle = grad; ctx.fill();

  function drawLine(arr, color, width){
    ctx.beginPath(); let started=false;
    arr.forEach((v,i) => { if (v==null) return; const x=xScale(i), y=yScale(v); if (!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y); });
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  drawLine(bollUpper, 'rgba(110,155,201,0.5)', 1);
  drawLine(bollLower, 'rgba(110,155,201,0.5)', 1);
  drawLine(sma200, '#C1533E', 1.3);
  drawLine(sma50, '#4CAF6D', 1.3);
  drawLine(closes, '#C9A24B', 2);

  ctx.fillStyle = '#9DA8B4';
  const fmtDate = d => d.toLocaleDateString('en-IN',{ day:'2-digit', month:'short' });
  ctx.fillText(fmtDate(dates[0]), padding.left, h-6);
  ctx.fillText(fmtDate(dates[dates.length-1]), w-padding.right-40, h-6);

  canvas.__state = { padding, plotW, closes, dates, xScale };
  if (!canvas.__hoverBound){
    canvas.__hoverBound = true;
    const tooltip = document.getElementById('chartTooltip');
    canvas.addEventListener('mousemove', (e) => {
      const st = canvas.__state; if (!st) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = Math.round(((x - st.padding.left) / (st.plotW||1)) * (st.closes.length-1));
      if (idx < 0 || idx >= st.closes.length) { tooltip.style.display='none'; return; }
      tooltip.style.display = 'block';
      tooltip.style.left = st.xScale(idx) + 'px';
      tooltip.style.top = '10px';
      tooltip.innerHTML = `${st.dates[idx].toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}<br>₹${fmtNum(st.closes[idx],2)}`;
    });
    canvas.addEventListener('mouseleave', () => { tooltip.style.display='none'; });
  }

  drawVolumeSubplot(dates);
  drawRsiSubplot(dates);
  drawMacdSubplot(dates);
}

function drawSubplot(canvas, series /* [{data,color,type:'line'|'bar',width}] */, opts){
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w*dpr; canvas.height = h*dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const padding = { top:8, right:10, bottom:6, left:44 };
  const plotW = w-padding.left-padding.right, plotH = h-padding.top-padding.bottom;
  let allVals = [];
  series.forEach(s => { allVals = allVals.concat(s.data.filter(v=>v!=null)); });
  if (opts && opts.refLines) opts.refLines.forEach(r => allVals.push(r.value));
  if (!allVals.length) return;
  let minV = (opts && opts.yMin!=null) ? opts.yMin : Math.min(...allVals);
  let maxV = (opts && opts.yMax!=null) ? opts.yMax : Math.max(...allVals);
  if (minV === maxV){ minV -= 1; maxV += 1; }
  const n = series[0].data.length;
  const xScale = i => padding.left + (n>1 ? (i/(n-1))*plotW : plotW/2);
  const yScale = v => padding.top + plotH - ((v-minV)/((maxV-minV)||1))*plotH;

  ctx.strokeStyle = 'rgba(237,230,214,0.07)'; ctx.fillStyle = '#9DA8B4'; ctx.font = '10px IBM Plex Mono';
  [minV, maxV].forEach(v => { const y=yScale(v); ctx.beginPath(); ctx.moveTo(padding.left,y); ctx.lineTo(w-padding.right,y); ctx.stroke(); ctx.fillText(v>=1000?v.toFixed(0):v.toFixed(1), 2, y+3); });

  if (opts && opts.refLines){
    opts.refLines.forEach(r => {
      const y = yScale(r.value);
      ctx.setLineDash([3,3]); ctx.strokeStyle = r.color || '#9DA8B4';
      ctx.beginPath(); ctx.moveTo(padding.left,y); ctx.lineTo(w-padding.right,y); ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  series.forEach(s => {
    if (s.type === 'bar'){
      const bw = Math.max(1, (plotW/n)*0.7);
      const zeroY = yScale(minV < 0 && maxV > 0 ? 0 : minV);
      s.data.forEach((v,i) => { if (v==null) return; const x=xScale(i), y=yScale(v); ctx.fillStyle = s.color; ctx.fillRect(x-bw/2, Math.min(y,zeroY), bw, Math.abs(y-zeroY)||1); });
    } else {
      ctx.beginPath(); let started=false;
      s.data.forEach((v,i) => { if (v==null) return; const x=xScale(i), y=yScale(v); if (!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y); });
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.3; ctx.stroke();
    }
  });
}

export function drawVolumeSubplot(dates){
  const n = dates.length;
  const vols = detailState.chartData.volumes.slice(-n);
  const closes = detailState.chartData.closes.slice(-n);
  const colors = closes.map((c,i) => i===0 || c>=closes[i-1] ? 'rgba(76,175,109,0.6)' : 'rgba(193,83,62,0.6)');
  const canvas = document.getElementById('volumeChart');
  if (!canvas) return;
  // color per-bar isn't supported by the generic single-color series, so draw manually here
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w*dpr; canvas.height = h*dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const padding = { top:8, right:10, bottom:6, left:44 };
  const plotW = w-padding.left-padding.right, plotH = h-padding.top-padding.bottom;
  const maxV = Math.max(...vols, 1);
  const xScale = i => padding.left + (n>1 ? (i/(n-1))*plotW : plotW/2);
  const bw = Math.max(1, (plotW/n)*0.7);
  ctx.fillStyle = '#9DA8B4'; ctx.font = '10px IBM Plex Mono';
  ctx.fillText((maxV/1e5).toFixed(1)+'L', 2, padding.top+8);
  vols.forEach((v,i) => { const hgt = (v/maxV)*plotH; ctx.fillStyle = colors[i]; ctx.fillRect(xScale(i)-bw/2, padding.top+plotH-hgt, bw, hgt||1); });
}

export function drawRsiSubplot(dates){
  const n = dates.length;
  const rsi = detailState.chartData.rsiFull.slice(-n);
  drawSubplot(document.getElementById('rsiChart'), [{ data: rsi, color:'#C9A24B', type:'line' }],
    { yMin:0, yMax:100, refLines:[{value:70,color:'rgba(193,83,62,0.6)'},{value:30,color:'rgba(76,175,109,0.6)'}] });
}

export function drawMacdSubplot(dates){
  const n = dates.length;
  const macd = detailState.chartData.macdFull.macdArr.slice(-n);
  const signal = detailState.chartData.macdFull.signalArr.slice(-n);
  const hist = detailState.chartData.macdFull.histArr.slice(-n);
  drawSubplot(document.getElementById('macdChart'), [
    { data: hist, color:'rgba(110,155,201,0.45)', type:'bar' },
    { data: macd, color:'#C9A24B', type:'line' },
    { data: signal, color:'#C1533E', type:'line', width:1.2 },
  ], {});
}
