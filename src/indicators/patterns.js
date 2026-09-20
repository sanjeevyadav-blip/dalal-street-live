// Candlestick patterns, swing-based structure and pivot levels.
//
// detectPatterns looks only at the last five sessions and reports a bias per pattern; it
// never aggregates them into a signal. priceAction derives support and resistance from
// swing points over roughly six months, falling back to the window's own extremes when no
// swing qualifies.

export function detectPatterns(o, h, l, c){
  const out = [];
  const n = c.length - 1;
  if (n < 3) return out;
  function body(i){ return Math.abs(c[i]-o[i]); }
  function range(i){ return (h[i]-l[i]) || 1e-9; }
  function upper(i){ return h[i] - Math.max(o[i],c[i]); }
  function lower(i){ return Math.min(o[i],c[i]) - l[i]; }
  function bull(i){ return c[i] >= o[i]; }
  for (let k = 0; k < 5 && n-k >= 1; k++){
    const i = n - k;
    const b = body(i), r = range(i);
    const age = k === 0 ? 'today' : k + 'd ago';
    if (b / r < 0.1) out.push({ name:'Doji', bias:'neutral', age, note:'Open and close nearly equal — indecision' });
    else if (lower(i) > 2*b && upper(i) < b && bull(i)) out.push({ name:'Hammer', bias:'bullish', age, note:'Long lower wick — sellers rejected' });
    else if (lower(i) > 2*b && upper(i) < b && !bull(i)) out.push({ name:'Hanging Man', bias:'bearish', age, note:'Long lower wick after an advance' });
    else if (upper(i) > 2*b && lower(i) < b) out.push({ name:'Shooting Star', bias:'bearish', age, note:'Long upper wick — buyers rejected' });
    else if (b / r > 0.9) out.push({ name: bull(i) ? 'Bullish Marubozu' : 'Bearish Marubozu', bias: bull(i)?'bullish':'bearish', age, note:'Full-body candle, one side in control' });
    const j = i - 1;
    if (j >= 0){
      if (bull(i) && !bull(j) && c[i] >= o[j] && o[i] <= c[j] && body(i) > body(j))
        out.push({ name:'Bullish Engulfing', bias:'bullish', age, note:"Today's body swallows yesterday's down candle" });
      if (!bull(i) && bull(j) && o[i] >= c[j] && c[i] <= o[j] && body(i) > body(j))
        out.push({ name:'Bearish Engulfing', bias:'bearish', age, note:"Today's body swallows yesterday's up candle" });
    }
    const m = i - 2;
    if (m >= 0){
      if (!bull(m) && body(i-1)/range(i-1) < 0.3 && bull(i) && c[i] > (o[m]+c[m])/2)
        out.push({ name:'Morning Star', bias:'bullish', age, note:'Down candle, pause, then strong recovery' });
      if (bull(m) && body(i-1)/range(i-1) < 0.3 && !bull(i) && c[i] < (o[m]+c[m])/2)
        out.push({ name:'Evening Star', bias:'bearish', age, note:'Up candle, pause, then sharp reversal' });
    }
  }
  const seen = {};
  return out.filter(p => { if (seen[p.name]) return false; seen[p.name] = 1; return true; }).slice(0, 6);
}

export function priceAction(h, l, c){
  const n = c.length;
  const look = Math.min(120, n);
  const H = h.slice(-look), L = l.slice(-look), C = c.slice(-look);
  const sw = { highs:[], lows:[] };
  for (let i = 2; i < H.length-2; i++){
    if (H[i] > H[i-1] && H[i] > H[i-2] && H[i] > H[i+1] && H[i] > H[i+2]) sw.highs.push(H[i]);
    if (L[i] < L[i-1] && L[i] < L[i-2] && L[i] < L[i+1] && L[i] < L[i+2]) sw.lows.push(L[i]);
  }
  const price = C[C.length-1];
  const resistance = sw.highs.filter(v => v > price).sort((a,b)=>a-b)[0] || Math.max.apply(null, H);
  const support = sw.lows.filter(v => v < price).sort((a,b)=>b-a)[0] || Math.min.apply(null, L);
  const hi = sw.highs.slice(-3), lo = sw.lows.slice(-3);
  let trend = 'Sideways / range-bound';
  if (hi.length >= 2 && lo.length >= 2){
    const hh = hi[hi.length-1] > hi[0], hl = lo[lo.length-1] > lo[0];
    const lh = hi[hi.length-1] < hi[0], ll = lo[lo.length-1] < lo[0];
    if (hh && hl) trend = 'Uptrend — higher highs and higher lows';
    else if (lh && ll) trend = 'Downtrend — lower highs and lower lows';
  }
  return { trend, support, resistance,
    toSupport: ((price-support)/price)*100,
    toResistance: ((resistance-price)/price)*100 };
}

export function pivotPoints(highs, lows, closes){
  const i = closes.length >= 2 ? closes.length-2 : closes.length-1;
  const H=highs[i], L=lows[i], C=closes[i];
  const p = (H+L+C)/3;
  return { p, r1: 2*p-L, r2: p+(H-L), s1: 2*p-H, s2: p-(H-L) };
}
