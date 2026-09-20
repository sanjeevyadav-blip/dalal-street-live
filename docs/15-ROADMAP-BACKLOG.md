# 6. Roadmap, Backlog & Test Plan

## 6.1 Priority backlog

### P0 — Refactor the monolith
`index.html` is ~264 KB with every module appended into one IIFE and `renderDetailCore`
wrapped four times. It works and each layer was syntax-checked, but it is at the limit of
what append-only can carry.

- Split per the target tree in doc 2 §2.8.
- Build with Vite + `vite-plugin-singlefile` to keep GitHub Pages deployment.
- Replace the reassignment-wrapping pattern with an explicit render pipeline:
  ```js
  const DETAIL_BLOCKS = [snapshot, priceHero, charts, technicals, riskMomentum,
                         priceAction, candles, dcf, earningsQuality, options,
                         factors, thesis, news, profile];
  DETAIL_BLOCKS.forEach(b => b.render(ctx));
  ```

### P0 — Add tests (there are none)
All indicator maths is pure functions and trivially testable. A real bug shipped
(1D% = 1Y%) and was caught only by eye, from a screenshot.

### P1 — Ship the probability lab
`src/probability-lab.NOT-DEPLOYED.js` is written and passes `node --check` but was never
deployed. Contains: GBM Monte Carlo, GARCH(1,1) via MLE grid search, 2-state Gaussian HMM
via Baum-Welch, walk-forward logistic classifier, DCF Monte Carlo, Bayesian ensemble,
lexicon sentiment. Note `olsMulti` from it **is** already live (the factor model needs it) —
do not double-define.

### P1 — Symbol validation on startup
Ping each universe symbol, report dead ones, don't silently drop rows.

### P2 — Capacitor native wrapper (doc 4 §4.5)
### P2 — Move Worker to Wrangler with source in repo
### P3 — Persist watchlist to localStorage (currently resets on reload)
### P3 — Add HML value factor (needs book-to-market across the universe)

## 6.2 Test plan

### Unit — pure functions
```
smaSeries, emaSeries      known series → known output
rsiLast                   Wilder's reference example → 70.53
macdLast                  crossover sign flips at the right bar
bollingerLast             %B = 1.0 at upper band, 0.0 at lower
atrLast                   matches hand-computed true range
annualizedVolPct          constant series → 0
betaAndCorrelation        series vs itself → beta 1.0, corr 1.0
detectPatterns            hand-built doji/hammer/engulfing candles
computeDcf                negative FCF → error object, not a number
reverseDcf                valueAt(implied) ≈ current price (within 0.5%)
olsMulti                  y = 2x + 3 → beta [3, 2], r2 = 1.0
gbmProbUp                 zero drift → exactly 50%
nCdf                      nCdf(0)=0.5, nCdf(1.96)≈0.975
```

### Regression — bugs that already shipped
```
1D% ≠ 1Y%          assert screener change1d !== change1y for a stock that moved
previousClose      with range=1y, assert prev comes from closes[len-2]
no dead tickers    assert every universe symbol returns bars
no duplicates      assert new Set(universe).size === universe.length
olsMulti defined   assert factor block renders, not stuck on "Building…"
```

### Integration — hit the live proxy
```
price feed returns bars for RELIANCE.NS
quoteSummary returns trailingPE (proves crumb works)
option-chain-v3 returns >0 strikes for RELIANCE (proves NSE session works)
timeseries returns >=3 years of annualOperatingCashFlow
Bing RSS returns >0 <item> elements
```

### UI / E2E (Playwright)
```
load → 3 index cards show numbers within 5s
search "reli" → suggestion appears → click → detail panel opens
detail panel → snapshot, DCF, options, factors, thesis all present
ranking → 55 scored, count selector re-slices without re-fetch
each of the 4 count selectors is independent
mobile viewport 390x844 → bottom nav visible, tables scroll horizontally
PWA → manifest 200, SW registers, display=standalone
```

## 6.3 Invariants — assert these in CI

1. No `BUY`/`SELL`/`HOLD`/`AVOID` verdict string is rendered as a recommendation.
2. No "target price" or "probability of reaching X by date Y" is produced.
3. Every snapshot row has a non-empty Source value.
4. Missing data renders as `—` or an explicit message, never `0`, `NaN`, or a guess.
5. Any probability shown is labelled as model output with its assumption stated.
