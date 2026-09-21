# 17. Changelog

Reverse chronological. Format: Conventional Commits categories.

## Unreleased
- `refactor` EPIC-1: the 3,888-line monolithic `index.html` became 39 ES modules built by
  Vite into one `dist/index.html`. Behaviour proven unchanged against the deployed file.
- `test` 342 offline tests against 31 committed API fixtures, including 33 golden snapshots.
- `test` §10.4: 10 live-API integration checks (`npm run test:integration`), opt-in.
- `test` §10.5: 49 Playwright E2E specs on desktop and mobile (`npm run test:e2e`), routed
  through the committed fixtures so they run deterministically and offline.
- `fix(pwa)` **the build stopped shipping the PWA.** `publicDir: false` meant Vite emitted
  `index.html` alone, while the page still linked `manifest.json` and registered `sw.js`.
  On a deploy the manifest would 404 and `sw.js` would be served the HTML fallback, failing
  registration with "unsupported MIME type ('text/html')" — no install prompt, no offline
  shell. Introduced by the EPIC-1 file moves, never deployed, found by the first E2E run.
  `src/public/` + `publicDir: 'public'` restores the three-file layout the live site has.
- `feat(reliability)` EPIC-4 E4-3: transient upstream failures (network error, timeout, 408,
  425, 429, 5xx) are retried once with exponential backoff, bounded by a wall-clock budget.
  Other 4xx are not retried — a 403 is the allowlist and a 404 is a dead symbol.
- `feat(reliability)` EPIC-4 E4-4: suppressed failures are kept in a bounded, PII-free ring
  buffer and shown in a new opt-in Diagnostics panel (toggle, or `?diag=1`). Nothing is sent
  anywhere; records carry the upstream host, never the full URL.
- `feat(reliability)` EPIC-4 E4-2: per-block error boundaries. One dead feed now renders its
  own failure state instead of blanking the detail panel.
- `feat(reliability)` EPIC-4 E4-1: dead or renamed tickers are named under the screener and
  ranking tables instead of silently vanishing from the row count.
- `feat(worker)` EPIC-4 E4-5: per-IP rate limit (300/min) and structured JSON logs.
  **Written but not deployed** — the live Worker is unchanged.
- `chore` deleted `.github/workflows/`; the gates run locally via `npm run verify:full`.
- `feat(models)` EPIC-5: the probability lab ships. GBM Monte Carlo, GARCH(1,1), a two-state
  hidden Markov regime model, a walk-forward logistic classifier, a DCF Monte Carlo and a
  Bayesian ensemble, as eight new modules under `src/models/` and `src/valuation/`.
- `feat(ui)` the Probability lab block. Every model states what it says, what it assumes and
  how it fails; the models are shown individually above the blend, and the blend is labelled
  "read this last, and least". The options-implied probability is deliberately excluded — it
  is risk-neutral, and the lab's models are real-world.
- `fix(models)` the lab's GBM applied the Ito correction to a drift that was already a log
  drift, subtracting it twice and disagreeing with the shipped closed form by nine points.
- `fix(models)` the regime model's state-separation measure used only the mean gap, which
  scored a genuinely regime-switching series below a random walk. Now Bhattacharyya distance.
- `feat(ux)` eight glossary entries for the lab, each warning about the specific misreading
  its model invites.
- `refactor` `src/probability-lab.NOT-DEPLOYED.js` deleted; its duplicate `olsMulti` and
  `normCdf` go with it (E5-5).
- `fix(ux)` **thirteen glossary terms never reached the Glossary section.** `mountGlossary`
  read `GLOSSARY` once and the `extendGlossaryFor*` calls run after it, so those terms worked
  as tooltips and appeared nowhere else. The section is still created where it was and only
  its list is re-rendered at the end of `bootstrap()` — moving the mount, which is what the
  open-findings note recommended, would have left the user manual stranded at the foot of
  the page, because `mountManual` positions itself relative to the glossary section.
- `fix(valuation)` **`reverseDcf` reported −20% when it could not resolve at all.** The model
  floors growth at the 4% terminal rate, so every rate below that produces an identical
  value and the bisection has nothing to search. It returned the bottom of its bracket,
  which read as "the market expects a 20% annual decline". It now reports `belowFloor` with
  no figure, and the UI explains that the price implies growth below the floor and the model
  cannot say how far below.
- `fix(valuation)` **a bank no longer gets a DCF.** `computeDcf` accepts the Yahoo sector and
  industry and declines for lenders: their operating cash flow is dominated by deposits and
  loan originations, so OCF-minus-capex is not free cash flow. HDFCBANK previously reported
  an intrinsic value with growth pinned at the +20% cap. The golden snapshot was re-baselined
  for this deliberately; the four non-financial fixtures are unchanged.
- `fix(ui)` `drawChart` and the three subplot renderers guard `getContext` returning null
  instead of dereferencing it.
- `test(worker)` `scripts/worker-preflight.mjs`: a deploy gate that exercises the proxy path
  no unit test reaches — the Yahoo crumb handshake, the NSE session handshake, and the E4-5
  rate-limit header — against a running Worker. Run it against `wrangler dev` before
  deploying and against the live URL after. `docs/11` §5.0 has the procedure and rollback.
- **Blocked:** the Worker deploy needs `wrangler login`, an interactive OAuth flow.
- **Planned:** Capacitor native wrapper (needs a JDK and the Android SDK, neither installed).

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
