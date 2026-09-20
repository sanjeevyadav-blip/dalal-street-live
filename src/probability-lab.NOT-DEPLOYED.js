
  // ======================================================================
  // Probability lab — model-based estimates of forward direction.
  // Every output here is "what this model says under its own assumptions",
  // not a forecast. Assumptions are printed alongside each number.
  // ======================================================================

  function logReturns(c){ const r=[]; for (let i=1;i<c.length;i++) r.push(Math.log(c[i]/c[i-1])); return r; }
  function mean(a){ return a.reduce(function(x,y){return x+y;},0)/(a.length||1); }
  function stdev(a){ const m=mean(a); return Math.sqrt(a.reduce(function(s,v){return s+(v-m)*(v-m);},0)/((a.length-1)||1)); }
  function normCdf(z){ return 0.5*(1+erf(z/Math.SQRT2)); }
  function erf(x){
    const s = x<0?-1:1; x = Math.abs(x);
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
    const t=1/(1+p*x), y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
    return s*y;
  }
  // Box-Muller with a seeded LCG so results are reproducible across reloads
  function rng(seed){ let s = seed>>>0; return function(){ s = (1664525*s + 1013904223)>>>0; return s/4294967296; }; }
  function gauss(u){ const a=Math.max(u(),1e-12), b=u(); return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b); }

  // ---------- 1. GBM Monte Carlo ----------
  function gbmMonteCarlo(closes, horizonDays, paths){
    const r = logReturns(closes.slice(-504));
    const mu = mean(r), sig = stdev(r);
    const S0 = closes[closes.length-1];
    const u = rng(20260829);
    const ends = new Array(paths);
    const dt = 1;
    for (let p=0;p<paths;p++){
      let S = S0;
      for (let t=0;t<horizonDays;t++) S *= Math.exp((mu - 0.5*sig*sig)*dt + sig*Math.sqrt(dt)*gauss(u));
      ends[p] = S;
    }
    ends.sort(function(a,b){return a-b;});
    const up = ends.filter(function(x){return x > S0;}).length / paths;
    const se = Math.sqrt(up*(1-up)/paths);
    function q(p){ return ends[Math.min(ends.length-1, Math.max(0, Math.floor(p*ends.length)))]; }
    return { pUp: up*100, se: se*100, S0, median: q(0.5), p05: q(0.05), p95: q(0.95),
      annVol: sig*Math.sqrt(252)*100, annDrift: mu*252*100, horizonDays, paths };
  }

  // ---------- 2. GARCH(1,1) ----------
  function fitGarch(closes){
    const r = logReturns(closes.slice(-756));
    if (r.length < 250) return null;
    const m = mean(r);
    const e = r.map(function(x){ return x-m; });
    const varUnc = mean(e.map(function(x){return x*x;}));
    let best = null;
    // coarse grid search on (alpha, beta); omega pinned to match unconditional variance
    for (let a=0.02; a<=0.30; a+=0.02){
      for (let b=0.55; b<=0.97; b+=0.02){
        if (a+b >= 0.999) continue;
        const w = varUnc*(1-a-b);
        let s2 = varUnc, ll = 0, ok = true;
        for (let i=0;i<e.length;i++){
          if (s2 <= 0){ ok=false; break; }
          ll += -0.5*(Math.log(2*Math.PI) + Math.log(s2) + (e[i]*e[i])/s2);
          s2 = w + a*e[i]*e[i] + b*s2;
        }
        if (ok && (best === null || ll > best.ll)) best = { a:a, b:b, w:w, ll:ll, nextVar:s2 };
      }
    }
    if (!best) return null;
    const persist = best.a + best.b;
    const halfLife = persist < 1 ? Math.log(0.5)/Math.log(persist) : Infinity;
    return {
      alpha: best.a, beta: best.b, omega: best.w, logLik: best.ll,
      persistence: persist, halfLife: halfLife,
      nextDayVol: Math.sqrt(best.nextVar)*100,
      annVolNow: Math.sqrt(best.nextVar*252)*100,
      annVolUnc: Math.sqrt(varUnc*252)*100
    };
  }

  // GBM re-run using the GARCH-implied volatility instead of a static one
  function gbmWithVol(closes, horizonDays, paths, dailyVol){
    const r = logReturns(closes.slice(-504));
    const mu = mean(r), S0 = closes[closes.length-1];
    const u = rng(987654321);
    let up = 0;
    for (let p=0;p<paths;p++){
      let S = S0;
      for (let t=0;t<horizonDays;t++) S *= Math.exp((mu - 0.5*dailyVol*dailyVol) + dailyVol*gauss(u));
      if (S > S0) up++;
    }
    const pUp = up/paths;
    return { pUp: pUp*100, se: Math.sqrt(pUp*(1-pUp)/paths)*100 };
  }

  // ---------- 6. Hidden Markov regime detection (2-state Gaussian, Baum-Welch) ----------
  function fitHmm(closes){
    const r = logReturns(closes.slice(-756));
    if (r.length < 200) return null;
    const sd = stdev(r), m = mean(r);
    // init: state0 = calm/up, state1 = volatile/down
    let mu = [m + 0.3*sd, m - 0.3*sd];
    let sg = [sd*0.7, sd*1.6];
    let A = [[0.95,0.05],[0.10,0.90]];
    let pi = [0.5,0.5];
    const N = r.length;
    function pdf(x,i){ const d=(x-mu[i])/sg[i]; return Math.exp(-0.5*d*d)/(sg[i]*Math.sqrt(2*Math.PI)) + 1e-300; }
    let gamma = null;
    for (let iter=0; iter<40; iter++){
      const al = [], be = [], sc = [];
      let a0 = [pi[0]*pdf(r[0],0), pi[1]*pdf(r[0],1)];
      let s0 = a0[0]+a0[1]; sc.push(s0); al.push([a0[0]/s0, a0[1]/s0]);
      for (let t=1;t<N;t++){
        const prev = al[t-1];
        const a = [ (prev[0]*A[0][0]+prev[1]*A[1][0])*pdf(r[t],0),
                    (prev[0]*A[0][1]+prev[1]*A[1][1])*pdf(r[t],1) ];
        const s = a[0]+a[1]; sc.push(s); al.push([a[0]/s, a[1]/s]);
      }
      be[N-1] = [1,1];
      for (let t=N-2;t>=0;t--){
        const nx = be[t+1];
        be[t] = [ (A[0][0]*pdf(r[t+1],0)*nx[0] + A[0][1]*pdf(r[t+1],1)*nx[1])/sc[t+1],
                  (A[1][0]*pdf(r[t+1],0)*nx[0] + A[1][1]*pdf(r[t+1],1)*nx[1])/sc[t+1] ];
      }
      gamma = [];
      for (let t=0;t<N;t++){
        const g0 = al[t][0]*be[t][0], g1 = al[t][1]*be[t][1];
        const s = g0+g1 || 1;
        gamma.push([g0/s, g1/s]);
      }
      // re-estimate
      const xi = [[0,0],[0,0]];
      for (let t=0;t<N-1;t++){
        for (let i=0;i<2;i++) for (let j=0;j<2;j++)
          xi[i][j] += al[t][i]*A[i][j]*pdf(r[t+1],j)*be[t+1][j]/sc[t+1];
      }
      for (let i=0;i<2;i++){
        const tot = xi[i][0]+xi[i][1] || 1;
        A[i][0] = xi[i][0]/tot; A[i][1] = xi[i][1]/tot;
        let gs=0, ms=0;
        for (let t=0;t<N;t++){ gs += gamma[t][i]; ms += gamma[t][i]*r[t]; }
        mu[i] = ms/(gs||1);
        let vs=0;
        for (let t=0;t<N;t++){ const d=r[t]-mu[i]; vs += gamma[t][i]*d*d; }
        sg[i] = Math.sqrt(vs/(gs||1)) || sd;
      }
      pi = [gamma[0][0], gamma[0][1]];
    }
    const now = gamma[N-1];
    // label states by their mean return
    const bullIdx = mu[0] >= mu[1] ? 0 : 1, bearIdx = 1-bullIdx;
    const pBull = now[bullIdx];
    // expected next-day return = weighted by regime persistence
    const nextBull = now[bullIdx]*A[bullIdx][bullIdx] + now[bearIdx]*A[bearIdx][bullIdx];
    const expRet = nextBull*mu[bullIdx] + (1-nextBull)*mu[bearIdx];
    const blendVol = Math.sqrt(nextBull*sg[bullIdx]*sg[bullIdx] + (1-nextBull)*sg[bearIdx]*sg[bearIdx]);
    return {
      pBullNow: pBull*100, pBullNext: nextBull*100,
      muBull: mu[bullIdx]*252*100, muBear: mu[bearIdx]*252*100,
      volBull: sg[bullIdx]*Math.sqrt(252)*100, volBear: sg[bearIdx]*Math.sqrt(252)*100,
      stickBull: A[bullIdx][bullIdx]*100, stickBear: A[bearIdx][bearIdx]*100,
      expRetAnn: expRet*252*100, blendVolAnn: blendVol*Math.sqrt(252)*100,
      regime: pBull > 0.6 ? 'Bullish regime' : pBull < 0.4 ? 'Bearish regime' : 'Transitional'
    };
  }

  // ---------- 4. Factor regression (market + self-built size & momentum proxies) ----------
  function olsMulti(y, X){
    const n = y.length, k = X[0].length;
    const XtX = [], Xty = [];
    for (let i=0;i<k;i++){ XtX.push(new Array(k).fill(0)); Xty.push(0); }
    for (let t=0;t<n;t++){
      for (let i=0;i<k;i++){
        Xty[i] += X[t][i]*y[t];
        for (let j=0;j<k;j++) XtX[i][j] += X[t][i]*X[t][j];
      }
    }
    // gaussian elimination with partial pivoting
    const A = XtX.map(function(row,i){ return row.concat([Xty[i]]); });
    for (let c=0;c<k;c++){
      let piv = c;
      for (let r2=c+1;r2<k;r2++) if (Math.abs(A[r2][c])>Math.abs(A[piv][c])) piv = r2;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      const tmp=A[c]; A[c]=A[piv]; A[piv]=tmp;
      for (let r2=0;r2<k;r2++){
        if (r2===c) continue;
        const f = A[r2][c]/A[c][c];
        for (let cc=c;cc<=k;cc++) A[r2][cc] -= f*A[c][cc];
      }
    }
    const beta = [];
    for (let i=0;i<k;i++) beta.push(A[i][k]/A[i][i]);
    // residual variance -> standard errors on the diagonal
    let ss=0;
    for (let t=0;t<n;t++){
      let fit=0; for (let i=0;i<k;i++) fit += X[t][i]*beta[i];
      ss += (y[t]-fit)*(y[t]-fit);
    }
    const s2 = ss/Math.max(1,(n-k));
    const se = [];
    for (let i=0;i<k;i++) se.push(Math.sqrt(Math.abs(s2/(XtX[i][i]||1))));
    let tss=0; const ym=mean(y);
    for (let t=0;t<n;t++) tss += (y[t]-ym)*(y[t]-ym);
    return { beta:beta, se:se, r2: tss>0 ? 1 - ss/tss : 0, n:n };
  }

  // ---------- 5. Walk-forward logistic classifier ----------
  function logistic(closes, volumes, horizon){
    const c = closes, n = c.length;
    if (n < 320) return null;
    const s20 = smaSeries(c,20), s50 = smaSeries(c,50);
    const rsiF = rsiSeriesFull(c,14), macdF = macdSeriesFull(c);
    const rows = [];
    for (let i=210; i<n-horizon; i++){
      if (rsiF[i]==null || s50[i]==null) continue;
      const vAvg = mean(volumes.slice(Math.max(0,i-20), i)) || 1;
      const f = [
        1,
        (rsiF[i]-50)/25,
        macdF.histArr[i]/(c[i]*0.02),
        (c[i]/s20[i]-1)*20,
        (c[i]/s50[i]-1)*10,
        Math.min(3, volumes[i]/vAvg) - 1,
        (c[i]/c[i-21]-1)*5,
        (c[i]/c[i-63]-1)*3
      ].map(function(x){ return isFinite(x)?x:0; });
      rows.push({ f:f, y: c[i+horizon] > c[i] ? 1 : 0 });
    }
    if (rows.length < 120) return null;
    // walk-forward: train on the first 70%, evaluate strictly out-of-sample on the rest
    const split = Math.floor(rows.length*0.7);
    const train = rows.slice(0, split), test = rows.slice(split);
    const k = train[0].f.length;
    let w = new Array(k).fill(0);
    const lr = 0.05, lam = 0.01;
    for (let ep=0; ep<400; ep++){
      const g = new Array(k).fill(0);
      for (let i=0;i<train.length;i++){
        let z=0; for (let j=0;j<k;j++) z += w[j]*train[i].f[j];
        const p = 1/(1+Math.exp(-z));
        const err = p - train[i].y;
        for (let j=0;j<k;j++) g[j] += err*train[i].f[j];
      }
      for (let j=0;j<k;j++) w[j] -= lr*(g[j]/train.length + lam*w[j]);
    }
    function predict(f){ let z=0; for (let j=0;j<k;j++) z += w[j]*f[j]; return 1/(1+Math.exp(-z)); }
    let correct=0, brier=0;
    test.forEach(function(r2){ const p=predict(r2.f); if ((p>0.5?1:0)===r2.y) correct++; brier += (p-r2.y)*(p-r2.y); });
    const baseRate = mean(test.map(function(r2){return r2.y;}));
    // current prediction
    const i = n-1;
    const vAvg = mean(volumes.slice(Math.max(0,i-20), i)) || 1;
    const fNow = [1,(rsiF[i]-50)/25, macdF.histArr[i]/(c[i]*0.02), (c[i]/s20[i]-1)*20,
      (c[i]/s50[i]-1)*10, Math.min(3, volumes[i]/vAvg)-1, (c[i]/c[i-21]-1)*5, (c[i]/c[i-63]-1)*3]
      .map(function(x){ return isFinite(x)?x:0; });
    return {
      pUp: predict(fNow)*100,
      accuracy: (correct/test.length)*100,
      baseRate: baseRate*100,
      edge: (correct/test.length - Math.max(baseRate,1-baseRate))*100,
      brier: brier/test.length,
      nTrain: train.length, nTest: test.length, horizon: horizon
    };
  }

  // ---------- 9. DCF Monte Carlo ----------
  function dcfMonteCarlo(base, shares, netDebt, price, gMid, dMid, runs){
    if (!(base>0) || !shares || !price) return null;
    const u = rng(13579);
    const vals = [];
    for (let i=0;i<runs;i++){
      const g = gMid + gauss(u)*0.04;
      const d = Math.max(0.09, Math.min(0.18, dMid + gauss(u)*0.015));
      const tg = Math.max(0.02, Math.min(0.055, 0.04 + gauss(u)*0.008));
      if (d <= tg) continue;
      let f = base, pv = 0;
      for (let y=1;y<=10;y++){ const gy=g*Math.pow(0.85,y-1); f = f*(1+Math.max(tg,gy)); pv += f/Math.pow(1+d,y); }
      const t = (f*(1+tg))/(d-tg)/Math.pow(1+d,10);
      vals.push((pv+t-(netDebt||0))/shares);
    }
    if (!vals.length) return null;
    vals.sort(function(a,b){return a-b;});
    function q(p){ return vals[Math.min(vals.length-1, Math.floor(p*vals.length))]; }
    const above = vals.filter(function(v){return v>price;}).length/vals.length;
    return { pUnder: above*100, median:q(0.5), p10:q(0.10), p90:q(0.90), runs:vals.length, price:price };
  }

  // ---------- 10. Headline sentiment (lexicon) ----------
  const POS = ['beat','beats','surge','surges','jump','jumps','rally','rallies','gain','gains','record','strong','growth','upgrade','upgrades','outperform','profit','wins','win','order','expansion','high','bullish','rise','rises','boost','robust'];
  const NEG = ['miss','misses','fall','falls','drop','drops','slump','decline','declines','loss','losses','weak','downgrade','downgrades','underperform','probe','fraud','penalty','fine','cut','cuts','concern','concerns','risk','bearish','plunge','slide','warning'];
  function scoreHeadlines(items){
    if (!items || !items.length) return null;
    let pos=0, neg=0, scored=0;
    items.forEach(function(it){
      const t = (it.title||'').toLowerCase();
      let p=0,n=0;
      POS.forEach(function(w){ if (t.indexOf(w)!==-1) p++; });
      NEG.forEach(function(w){ if (t.indexOf(w)!==-1) n++; });
      if (p||n){ scored++; pos+=p; neg+=n; }
    });
    const tot = pos+neg;
    return { pos:pos, neg:neg, scored:scored, total:items.length,
      score: tot ? ((pos-neg)/tot)*100 : 0,
      tone: !tot ? 'Neutral / no signal' : (pos-neg)/tot > 0.25 ? 'Positive' : (pos-neg)/tot < -0.25 ? 'Negative' : 'Mixed' };
  }

  // ---------- 8. Bayesian ensemble ----------
  function bayesEnsemble(signals){
    // start from an uninformative 50% prior, update in log-odds with capped weights
    let lo = 0;
    const used = [];
    signals.forEach(function(s){
      if (s.p == null || !isFinite(s.p)) return;
      const p = Math.max(0.02, Math.min(0.98, s.p/100));
      const contrib = Math.log(p/(1-p)) * s.w;
      lo += contrib;
      used.push({ name:s.name, p:s.p, w:s.w, contrib:contrib });
    });
    if (!used.length) return null;
    const post = 1/(1+Math.exp(-lo));
    const spread = used.length>1 ? stdev(used.map(function(x){return x.p;})) : 0;
    return { posterior: post*100, used:used, disagreement: spread,
      confidence: spread < 6 ? 'Models agree' : spread < 14 ? 'Some disagreement' : 'Models disagree sharply' };
  }
