# 17. Changelog

Reverse chronological. Format: Conventional Commits categories.

## Unreleased
- `refactor` EPIC-1: the 3,888-line monolithic `index.html` became 39 ES modules built by
  Vite into one `dist/index.html`. Behaviour proven unchanged against the deployed file.
- `test` 220 offline tests against 31 committed API fixtures, including 33 golden snapshots.
- `test` §10.4: 10 live-API integration checks (`npm run test:integration`), opt-in.
- `test` §10.5: 27 Playwright E2E specs on desktop and mobile (`npm run test:e2e`), routed
  through the committed fixtures so they run deterministically and offline.
- `fix(pwa)` **the build stopped shipping the PWA.** `publicDir: false` meant Vite emitted
  `index.html` alone, while the page still linked `manifest.json` and registered `sw.js`.
  On a deploy the manifest would 404 and `sw.js` would be served the HTML fallback, failing
  registration with "unsupported MIME type ('text/html')" — no install prompt, no offline
  shell. Introduced by the EPIC-1 file moves, never deployed, found by the first E2E run.
  `src/public/` + `publicDir: 'public'` restores the three-file layout the live site has.
- **Planned:** probability lab deployment, symbol validation, Capacitor native wrapper.

## v1.9 — Mobile & PWA
- `feat(mobile)` responsive layout ≤760px: sticky header, swipe indices strip, 2-column
  metrics, 16px inputs (stops iOS zoom), bottom navigation, safe-area insets.
- `feat(pwa)` manifest, service worker, install prompt. Installable on Android and iOS.
- `feat(pwa)` service worker deliberately excludes market data from caching.

## v1.8 — Row-count selectors
- `feat(tables)` independent 10/15/20/30/50 selector on all four tables.
- `feat(data)` universes expanded to 55 names each.
- `perf` result caching: changing count re-slices instead of re-fetching.
- `fix(data)` dead tickers replaced: TATAMOTORS→TMPV, ZOMATO→ETERNAL, LTIM removed;
  duplicate NMDC replaced with POLYCAB.

## v1.7 — Screener v2
- **`fix(screener)` 1-day change equalled 1-year change.** With `range=1y` Yahoo omits
  `meta.previousClose`, and the fallback to `chartPreviousClose` used a year-old price.
  Now derived from `closes[len-2]` with a 25% sanity check.
- `feat(screener)` five columns added: market cap, ROE, debt/equity, dividend yield,
  vs 200-DMA. Plus volume-vs-average.
- `feat(ui)` horizontal scroll for wide tables.

## v1.6 — Top 20, probabilities, user manual
- `feat(ranking)` top 20 from a 40-name universe; P(up) 1 week and 1 month; reasoning column.
- `feat(docs)` 12-step in-product user manual.

## v1.5 — Glossary
- `feat(ux)` ~95-term glossary; ⓘ tooltips auto-attached via MutationObserver so
  dynamically rendered panels are covered; searchable glossary section.
- `fix(copy)` corrected a stale claim that NSE's option-chain API returned nothing — it
  works; derivatives are excluded from the composite for performance and coverage reasons.

## v1.4 — Options & factors
- `feat(options)` **live NSE option chain working.** Two-step NSE cookie handshake plus
  `option-chain-v3` with explicit expiry. Black-Scholes N(d₂), ATM IV, implied move, PCR,
  max pain, IV skew, strike ladder. *Previously declared impossible — that was wrong.*
- `feat(factors)` OLS factor decomposition with alpha t-statistic, R², idiosyncratic share.
- `feat(snapshot)` snapshot table with a Source column and staleness flags on every row.
- `fix(factors)` `olsMulti` was missing, leaving the block stuck on "Building…".

## v1.3 — Analysis & thesis
- `feat(analysis)` price action, 9 candlestick patterns, DCF with sensitivity grid,
  earnings-quality grading.
- `feat(thesis)` 6-step walkthrough: consensus vs estimate → DCF + reverse DCF → catalysts
  → technical levels → position sizing → verdict panel.
- `feat(ranking)` composite technical ranking.

## v1.2 — IPO watch
- `feat(ipo)` NSE upcoming issues, detail panel, news, official filing links.

## v1.1 — Reliability
- `feat(infra)` **own Cloudflare Worker** replaced failing public CORS relays.
- `feat(infra)` Yahoo crumb handshake — fixes 401 on all fundamentals.
- `fix(news)` switched Google News → Bing RSS; Google blocks Cloudflare IPs with 503.
- `perf` parallel fetching via `runPool`; load time 20–60s → ~1.1s.
- `fix(js)` a dropped `[` from a destructuring pattern had killed the entire script.

## v1.0 — Initial
- Ticker, indices, search, watchlist, canvas charts, technical indicators, screener,
  GitHub Pages deployment.
