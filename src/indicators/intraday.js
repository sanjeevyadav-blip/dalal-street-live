// Intraday measures computed from 5-minute bars: opening range, VWAP, gap and relative
// volume. All of these return null rather than a guess when the inputs are missing.

export function openingRange(intraday, minutes){
  // Opening Range = high/low of the first N minutes of the session.
  const bars = Math.max(1, Math.round(minutes / 5)); // 5-minute bars
  const n = Math.min(bars, intraday.closes.length);
  if (!n) return null;
  return {
    high: Math.max(...intraday.highs.slice(0, n)),
    low: Math.min(...intraday.lows.slice(0, n)),
    bars: n
  };
}

export function vwapSeries(intraday){
  let num = 0, den = 0;
  const out = [];
  for (let i = 0; i < intraday.closes.length; i++){
    const typical = (intraday.highs[i] + intraday.lows[i] + intraday.closes[i]) / 3;
    num += typical * intraday.volumes[i];
    den += intraday.volumes[i];
    out.push(den > 0 ? num / den : null);
  }
  return out;
}

export function gapPct(todayOpen, prevClose){
  if (todayOpen == null || !prevClose) return null;
  return ((todayOpen - prevClose) / prevClose) * 100;
}

export function relativeVolume(todayVol, avgVol){
  if (!avgVol) return null;
  return todayVol / avgVol;
}
