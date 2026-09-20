// Multiple linear regression by normal equations with Gaussian elimination.
//
// Returns null on a singular system rather than NaN — a factor loading of NaN renders as
// something, and something is worse than nothing here.
//
// The factor block that uses this once hung permanently on "Building..." because olsMulti
// was missing from the deployed bundle. It must be defined exactly once: EPIC-5 story E5-5
// removes the duplicate in probability-lab.NOT-DEPLOYED.js rather than shipping both.

export function olsMulti(y, X){
  const n = y.length, k = X[0].length;
  const XtX = [], Xty = [];
  for (let i=0;i<k;i++){ XtX.push(new Array(k).fill(0)); Xty.push(0); }
  for (let t=0;t<n;t++){
    for (let i=0;i<k;i++){
      Xty[i] += X[t][i]*y[t];
      for (let j=0;j<k;j++) XtX[i][j] += X[t][i]*X[t][j];
    }
  }
  const A = XtX.map(function(row,i){ return row.concat([Xty[i]]); });
  for (let c=0;c<k;c++){
    let piv = c;
    for (let r2=c+1;r2<k;r2++) if (Math.abs(A[r2][c])>Math.abs(A[piv][c])) piv = r2;
    if (Math.abs(A[piv][c]) < 1e-14) return null;
    const tmp=A[c]; A[c]=A[piv]; A[piv]=tmp;
    for (let r2=0;r2<k;r2++){
      if (r2===c) continue;
      const f = A[r2][c]/A[c][c];
      for (let cc=c;cc<=k;cc++) A[r2][cc] -= f*A[c][cc];
    }
  }
  const beta = [];
  for (let i=0;i<k;i++) beta.push(A[i][k]/A[i][i]);
  let ss=0;
  for (let t=0;t<n;t++){
    let fit=0; for (let i=0;i<k;i++) fit += X[t][i]*beta[i];
    ss += (y[t]-fit)*(y[t]-fit);
  }
  const s2 = ss/Math.max(1,(n-k));
  const se = [];
  for (let i=0;i<k;i++) se.push(Math.sqrt(Math.abs(s2/(XtX[i][i]||1))));
  let tss=0, ym=0;
  for (let t=0;t<n;t++) ym += y[t];
  ym /= (n||1);
  for (let t=0;t<n;t++) tss += (y[t]-ym)*(y[t]-ym);
  return { beta:beta, se:se, r2: tss>0 ? 1 - ss/tss : 0, n:n };
}
