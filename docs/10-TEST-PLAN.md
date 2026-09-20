# 10. Test Plan & QA Strategy

> **Superseded intro (kept for the record).** This document opened by saying there were zero
> automated tests. As of EPIC-1 PR-6 there are **197**, all running offline against 31
> committed API fixtures: 102 unit, 63 regression, 18 boot, 7 build-output, 33 golden
> snapshots. §10.2 is complete; §10.3 is complete; §10.5 (E2E) and §10.4 (weekly live
> integration) are still outstanding.

This document is the plan, and it was the highest-priority engineering task after the
refactor.

A real bug shipped to production — the screener's 1-day change equalled its 1-year change
for every row — and was caught only because a human looked at a screenshot and thought
"those two numbers should not match". That instinct is not a test strategy.

## 10.1 Pyramid

```
        E2E (Playwright)        ~10 flows
     Integration (live APIs)    ~8 checks, run weekly
  Unit (pure functions)         ~60 cases, run on every commit
```

## 10.2 Unit tests — pure functions

| Function | Case | Expected |
|---|---|---|
| `smaSeries` | [1..10], period 3 | nulls then rolling means |
| `emaSeries` | constant series | same constant |
| `rsiLast` | Wilder's reference series, 15 closes | ≈70.46 (**corrected**, see below) |
| `rsiLast` | same series plus one bar | ≈66.25 |
| `rsiLast` | monotonically rising | 100 |
| `macdLast` | known crossover series | hist sign flips at expected bar |
| `bollingerLast` | price at upper band | %B = 1.0 |
| `atrLast` | hand-computed TR series | matches |
| `annualizedVolPct` | constant series | 0 |
| `betaAndCorrelation` | series vs itself | beta 1.0, corr 1.0 |
| `betaAndCorrelation` | <20 overlapping days | nulls, not a spurious number |
| `detectPatterns` | synthetic doji | includes Doji, bias neutral |
| `detectPatterns` | synthetic bullish engulfing | includes it, bias bullish |
| `priceAction` | rising swings | "Uptrend" |
| `computeDcf` | negative FCF | `{error}`, never a number |
| `computeDcf` | known inputs | intrinsic matches hand calc |
| `reverseDcf` | any valid input | `valueAt(implied) ≈ price` within 0.5% |
| `earningsQuality` | OCF > NI | cash-backed check passes |
| `olsMulti` | y = 3 + 2x | beta [3,2], r² = 1.0 |
| `olsMulti` | singular matrix | null, not NaN |
| `gbmProbUp` | zero drift | exactly 50 |
| `nCdf` | 0, 1.96, −1.96 | 0.5, ≈0.975, ≈0.025 |
| `analyseOptions` | synthetic chain | PCR = ΣPE/ΣCE; max pain at expected strike |
| `fmtCr` | 1e7 | "₹1 Cr" |

**Status: complete.** `tests/unit/indicators.test.js` (55 cases, PR-5) and
`tests/unit/valuation-models.test.js` (47 cases, PR-6) cover every row above.
`src/indicators/`, `src/valuation/`, `src/options/` and `src/models/` all sit at **100%
statement, function and line coverage**, 85.5% branch.

**Correction — the RSI expected value.** This table previously gave ≈70.53. That figure is
wrong. Running Wilder's published 15-close series gives **70.4641**, and extending it by one
bar gives **66.2496**; both match the canonical worked example to four significant figures.
70.53 comes from a variant that seeds the running averages differently. The implementation
was right and the test plan was not, so the plan is what changed. Worth stating explicitly:
had this been written as a test without checking the source of the number, it would have
failed and invited a "fix" to correct maths.

**Two other things that fell out of writing these:**

- `bollingerLast` %B = 1.0 "when price is at the upper band" is not constructible at an
  arbitrary window. With a flat window and one deviating bar, the bar lands exactly on the
  2σ band only when the period is **5**, regardless of how large the move is — the condition
  reduces to `n = 1 + 2√(n−1)`. At a 20-bar window the same outlier reads %B ≈ 1.59.
- `annualizedVolPct` uses the **sample** standard deviation (dividing by n−1). An expectation
  computed from the population value misses by ~0.5%, which is close enough to look like a
  rounding difference and far enough to hide a real unit error.
- `nCdf` is a rational approximation with a worst absolute error of **~7e-8** over [-6, 6]
  (`nCdf(0)` returns 0.5000000005). Accurate to about 7 decimal places — ample for a
  probability shown to the nearest percent, but assertions tighter than that are asserting
  something the function never promised. `gbmProbUp`'s precision is bounded by this, not by
  its own arithmetic.
- **`reverseDcf` cannot resolve implied growth at or below the terminal rate.** Both it and
  `computeDcf` grow free cash flow by `Math.max(tg, gy)`, so growth is *floored* at 4%:
  nothing can be modelled as growing more slowly. Every implied growth ≤ 4% therefore
  produces an identical value and the bisection returns the −20% bound for all of them.
  **An implied-growth reading of −20% does not mean the market expects a 20% decline** — it
  means it expects 4% or less and the model cannot tell which. The `capped` flag is what
  says so, and the UI must keep showing it. Pinned in `tests/unit/valuation-models.test.js`
  so the behaviour is visible rather than surprising; whether the floor should exist at all
  is a product question, not an EPIC-1 one.

## 10.3 Regression tests — bugs that already shipped

```js
test('screener 1D change is not the 1Y change', () => {
  // with range=1y Yahoo omits meta.previousClose; falling through to
  // chartPreviousClose yields a year-old reference price
  const row = fetchScreenerRow2Sync(fixture_reliance_1y);
  expect(row.change1d).not.toBeCloseTo(row.change1y, 1);
});

test('previousClose is rejected when implausible', () => {
  expect(resolvePrevClose({ previousClose: 500 }, [1250, 1257]))
    .toBe(1250);   // 500 is >25% from spot → fall back to the series
});

test('no dead tickers in any universe', async () => {
  for (const t of [...UNIV_LARGE, ...UNIV_MID])
    expect(await hasBars(t + '.NS')).toBe(true);
});

test('universes contain no duplicates', () => {
  expect(new Set(UNIV_MID).size).toBe(UNIV_MID.length);
});

test('olsMulti is defined wherever renderFactors is used', () => {
  expect(typeof olsMulti).toBe('function');  // factor block once hung on "Building…"
});
```

## 10.4 Integration — against live APIs (weekly; they change without notice)

```
price feed        chart/RELIANCE.NS returns > 200 bars
crumb auth        quoteSummary returns trailingPE (401 means crumb broke)
NSE session       option-chain-contract-info returns >= 1 expiry
option chain      option-chain-v3 returns > 0 strikes with CE and PE
timeseries        returns >= 3 annualOperatingCashFlow points
news              Bing RSS returns > 0 <item>
IPO feed          all-upcoming-issues parses
worker allowlist  a non-allowlisted host returns 403
```

## 10.5 E2E (Playwright)

```
loads and shows 3 index prices within 5s
search "reli" → suggestion → click → detail panel opens
detail panel renders snapshot, chart, DCF, earnings quality, options, factors, thesis
options block shows "no contracts" for a non-F&O stock (not zeros)
position sizing: capital 500000, risk 1%, stop below price → plausible share count
ranking: scores universe, top-N slice, count change does not re-fetch
all four row-count selectors are independent
mobile 390×844: bottom nav visible, tables scroll horizontally, no layout overflow
PWA: manifest 200, service worker registers, display=standalone
offline: shell loads, market data shows an error rather than stale prices
```

## 10.6 Invariants — assert in CI, fail the build

1. No `BUY`/`SELL`/`HOLD`/`AVOID` rendered as a recommendation.
2. No "target price" or "probability of reaching X by date Y".
3. Every snapshot row has a non-empty Source.
4. Missing data renders `—` or an explicit message — never `0`, `NaN`, `undefined`.
5. Every probability shown is labelled as model output with its assumption stated.

## 10.7 Manual QA before any release

```
[ ] Large cap and mid cap load in both screener and ranking
[ ] Open 3 stocks: one F&O, one non-F&O, one bank (DCF should decline gracefully)
[ ] Change every row-count selector; confirm independence
[ ] Hover several ⓘ markers
[ ] Phone: install prompt, bottom nav, table scroll
```
