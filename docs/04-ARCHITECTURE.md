# 2. Technical Architecture

## 2.1 Shape

```
Browser (GitHub Pages, static)
   │  fetch(...)  — all client-side, no backend
   ▼
Cloudflare Worker  "dalal-proxy"      ← the only server-side component
   │  adds CORS headers, Yahoo crumb, NSE session cookies
   ▼
Yahoo Finance  ·  NSE India  ·  Bing News RSS
```

There is no database, no auth, no server state. Everything is computed in the browser
from data fetched at page load.

## 2.2 Why a proxy exists

Yahoo and NSE do not send `Access-Control-Allow-Origin`, so a browser on another origin
cannot read their responses. The Worker fetches server-side (where CORS does not apply)
and re-serves with permissive headers. It also holds the two auth handshakes, which
cannot be done from the browser because they need cross-origin cookies.

The host allowlist is deliberate: without it the Worker is an open relay that anyone who
finds the URL can use to burn your quota.

## 2.3 Current file layout (as deployed)

| File | Size | Contents |
|---|---|---|
| `index.html` | ~264 KB | Everything: CSS, HTML, all JS in one IIFE |
| `manifest.json` | 1.3 KB | PWA metadata, inline SVG icons |
| `sw.js` | 1.2 KB | Service worker, network-first shell cache |

## 2.4 How `index.html` is organised internally

One `(function(){ 'use strict'; ... })();`. Modules were **appended sequentially** over many
iterations, and later modules override earlier functions by reassignment:

```js
const __origRenderDetailCore = renderDetailCore;
renderDetailCore = function(symbol, hist, niftyHist){
  __origRenderDetailCore(symbol, hist, niftyHist);
  renderDeepAnalysis(symbol, hist, price);   // new block appended
};
```

`renderDetailCore` is wrapped **four times** (deep analysis → options+factors → snapshot).
Render order therefore depends on wrap order and `setTimeout` delays.

> **This is the main technical debt.** It works, and every layer was syntax-checked before
> deploy, but it is at the limit of what an append-only approach should carry. See doc 6.

## 2.5 Module map (search these strings in `index.html`)

| Concern | Entry points |
|---|---|
| Networking | `fetchJsonThroughProxy`, `fetchTextThroughProxy`, `runPool`, `PROXIES` |
| Price data | `fetchHistory`, `fetchQuote`, `fetchFundamentals`, `fetchAnnuals` |
| Indicators | `smaSeries`, `emaSeries`, `rsiLast`, `rsiSeriesFull`, `macdLast`, `macdSeriesFull`, `bollingerLast`, `atrLast`, `annualizedVolPct`, `betaAndCorrelation` |
| Charting | `drawChart`, `drawSubplot`, `drawVolumeSubplot` (raw canvas, no library) |
| Price action | `detectPatterns`, `priceAction` |
| Valuation | `computeDcf`, `reverseDcf`, `earningsQuality` |
| Options | `fetchOptionChain`, `analyseOptions`, `nCdf` |
| Factors | `buildFactors`, `olsMulti`, `renderFactors` |
| Ranking | `scoreStock20`, `gbmProbUp`, `runRanking3`, `renderRankRows` |
| Screener | `fetchScreenerRow2`, `loadScreener3` |
| Snapshot | `renderSnapshot`, `buildSnapTable` |
| Thesis | `renderThesis`, `fetchCatalysts` |
| IPO | `fetchIpos`, `showIpoDetail`, `renderIpoExtras` |
| Glossary | `GLOSSARY`, `annotateGlossary`, `glossaryLookup` |
| Mobile/PWA | `mobileLayer` |

## 2.6 Concurrency

`runPool(items, worker, n)` runs `n` fetches in flight. Used at 5–6 everywhere. This was the
single biggest performance win: sequential fetching took 20–60s, parallel takes ~1s.
Do not raise above ~8 — the free proxies and NSE will rate-limit.

## 2.7 Caching layers

| Layer | TTL | Note |
|---|---|---|
| Cloudflare edge | 30s | Yahoo only. NSE is `no-store` — session cookies make caching unsafe |
| `historyCache` | session | Keyed `symbol|range|interval` |
| `scrCache`, `rankCache` | session | So changing row count re-slices instead of re-fetching |
| `factorCache` | session | 24-stock factor series, built once |
| Service worker | until updated | Page shell only. **Market data is never cached.** |

## 2.8 Target architecture (for the rewrite)

```
src/
  data/        proxy.js  yahoo.js  nse.js  news.js
  indicators/  trend.js  momentum.js  volatility.js  patterns.js
  valuation/   dcf.js  reverse-dcf.js  earnings-quality.js
  models/      gbm.js  garch.js  hmm.js  ols.js  logistic.js
  options/     chain.js  black-scholes.js
  ui/          charts.js  snapshot.js  thesis.js  tables.js  glossary.js
  app.js
tests/         unit tests for every pure function
```
Build with Vite; `vite-plugin-singlefile` keeps a single-file output for GitHub Pages.
