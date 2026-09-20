// Trend indicators: moving averages, MACD and on-balance volume.
//
// Note that emaSeries seeds from arr[0] rather than from an initial SMA. That makes the
// first values of the series warm-up artefacts rather than true EMA values, which matters
// for MACD on short inputs. It is what the deployed code does, so it stays; the unit tests
// pin the behaviour so a future "fix" is a visible decision rather than a silent drift.

export function smaSeries(arr, period){
  const out = new Array(arr.length).fill(null); let sum=0;
  for (let i=0;i<arr.length;i++){ sum+=arr[i]; if (i>=period) sum-=arr[i-period]; if (i>=period-1) out[i]=sum/period; }
  return out;
}

export function emaSeries(arr, period){
  const out = new Array(arr.length).fill(null); const k = 2/(period+1); let prev = arr[0]; out[0]=prev;
  for (let i=1;i<arr.length;i++){ prev = arr[i]*k + prev*(1-k); out[i]=prev; }
  return out;
}

export function macdLast(closes){
  const e12 = emaSeries(closes,12), e26 = emaSeries(closes,26);
  const macdArr = closes.map((_,i)=> e12[i]-e26[i]);
  const signalArr = emaSeries(macdArr,9);
  const n = closes.length-1;
  return { macd: macdArr[n], signal: signalArr[n], hist: macdArr[n]-signalArr[n] };
}

export function macdSeriesFull(closes){
  const e12 = emaSeries(closes,12), e26 = emaSeries(closes,26);
  const macdArr = closes.map((_,i)=> e12[i]-e26[i]);
  const signalArr = emaSeries(macdArr,9);
  const histArr = macdArr.map((v,i)=> v-signalArr[i]);
  return { macdArr, signalArr, histArr };
}

export function obvTrend(closes, volumes){
  const obv = new Array(closes.length).fill(0);
  for (let i=1;i<closes.length;i++){
    if (closes[i]>closes[i-1]) obv[i]=obv[i-1]+volumes[i];
    else if (closes[i]<closes[i-1]) obv[i]=obv[i-1]-volumes[i];
    else obv[i]=obv[i-1];
  }
  const ma20 = smaSeries(obv,20);
  const last = obv[obv.length-1], lastMa = ma20[ma20.length-1];
  if (lastMa==null) return 'insufficient data';
  return last >= lastMa ? 'rising (volume confirming)' : 'falling (volume diverging)';
}
