// NSE option-chain analysis: ATM implied volatility, implied move, put-call ratio,
// max pain, IV skew and a strike ladder.
//
// The probabilities here are RISK-NEUTRAL — Black-Scholes N(d2), the probability under the
// pricing measure, not a real-world forecast. They embed the market's risk premium and are
// systematically not what "chance this finishes above X" means in plain English. The UI is
// required to label them as such (CLAUDE.md invariant 4); do not relabel them.
//
// Max pain is the strike at which the most option value expires worthless. It is widely
// quoted and weakly evidenced — it is reported because traders ask for it, not because it
// predicts anything.

import { nCdf } from '../models/normal.js';

export function analyseOptions(chain, spot){
  const rows = chain.data.filter(function(r){ return r.CE || r.PE; });
  if (!rows.length) return null;
  const parts = chain.expiry.split('-');
  const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const expDate = new Date(parseInt(parts[2],10), months[parts[1]], parseInt(parts[0],10));
  const dte = Math.max(1, Math.round((expDate - new Date())/86400000));
  const T = dte/365;
  const r = 0.07;
  const S = chain.underlying || spot;
  let ceOI=0, peOI=0, ceVol=0, peVol=0;
  rows.forEach(function(x){
    if (x.CE){ ceOI += x.CE.openInterest||0; ceVol += x.CE.totalTradedVolume||0; }
    if (x.PE){ peOI += x.PE.openInterest||0; peVol += x.PE.totalTradedVolume||0; }
  });
  const pcrOI = ceOI ? peOI/ceOI : null;
  const pcrVol = ceVol ? peVol/ceVol : null;
  let atm = null, bestD = Infinity;
  rows.forEach(function(x){ const d = Math.abs(x.strikePrice - S); if (d < bestD){ bestD = d; atm = x; } });
  const atmIV = atm ? ((atm.CE && atm.CE.impliedVolatility) || (atm.PE && atm.PE.impliedVolatility) || 0)/100 : null;
  function probITM(K, iv){ // risk-neutral P(S_T > K), i.e. N(d2)
    if (!iv || iv <= 0 || !K) return null;
    const d2 = (Math.log(S/K) + (r - 0.5*iv*iv)*T) / (iv*Math.sqrt(T));
    return nCdf(d2);
  }
  const pAbove = atmIV ? probITM(S, atmIV) : null;
  const ladder = [];
  [-10,-5,0,5,10].forEach(function(pct){
    const K = S*(1+pct/100);
    let near = null, nd = Infinity;
    rows.forEach(function(x){ const d = Math.abs(x.strikePrice - K); if (d<nd){ nd=d; near=x; } });
    if (!near) return;
    const iv = ((near.CE && near.CE.impliedVolatility) || (near.PE && near.PE.impliedVolatility) || 0)/100;
    const p = probITM(near.strikePrice, iv || atmIV);
    ladder.push({ pct: pct, strike: near.strikePrice, iv: (iv||atmIV)*100, pAbove: p!=null?p*100:null,
      ceOI: near.CE?near.CE.openInterest:0, peOI: near.PE?near.PE.openInterest:0 });
  });
  let maxPain = null, minLoss = Infinity;
  rows.forEach(function(k){
    const K = k.strikePrice;
    let loss = 0;
    rows.forEach(function(x){
      if (x.CE) loss += Math.max(0, K - x.strikePrice) * (x.CE.openInterest||0);
      if (x.PE) loss += Math.max(0, x.strikePrice - K) * (x.PE.openInterest||0);
    });
    if (loss < minLoss){ minLoss = loss; maxPain = K; }
  });
  let topCE = null, topPE = null;
  rows.forEach(function(x){
    if (x.CE && (!topCE || x.CE.openInterest > topCE.oi)) topCE = { strike:x.strikePrice, oi:x.CE.openInterest };
    if (x.PE && (!topPE || x.PE.openInterest > topPE.oi)) topPE = { strike:x.strikePrice, oi:x.PE.openInterest };
  });
  function ivNear(K, side){
    let near=null, nd=Infinity;
    rows.forEach(function(x){ const d=Math.abs(x.strikePrice-K); if (d<nd){ nd=d; near=x; } });
    if (!near) return null;
    const leg = side==='P' ? near.PE : near.CE;
    return leg && leg.impliedVolatility ? leg.impliedVolatility : null;
  }
  const putIV = ivNear(S*0.9,'P'), callIV = ivNear(S*1.1,'C');
  const skew = (putIV!=null && callIV!=null) ? putIV-callIV : null;
  return { dte, expiry: chain.expiry, S, atmIV: atmIV!=null?atmIV*100:null, pAbove: pAbove!=null?pAbove*100:null,
    pcrOI, pcrVol, ceOI, peOI, ladder, maxPain, topCE, topPE, skew,
    impliedMove: atmIV!=null ? S*atmIV*Math.sqrt(T)*100/S : null,
    strikes: rows.length, timestamp: chain.timestamp };
}
