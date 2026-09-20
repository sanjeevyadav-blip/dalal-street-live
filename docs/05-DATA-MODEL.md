# 05. Data Model & Data Dictionary

No database. All structures are in-memory for the session.

## 5.1 Core objects

### `history` — returned by `fetchHistory(symbol, range, interval)`
```js
{
  meta: {                       // Yahoo chart meta, passed through
    regularMarketPrice, previousClose, chartPreviousClose,
    regularMarketDayHigh, regularMarketDayLow,
    fiftyTwoWeekHigh, fiftyTwoWeekLow,
    regularMarketVolume, regularMarketTime,   // unix seconds
    currency, shortName, longName, exchangeName
  },
  dates:   [Date],              // aligned index across all arrays
  closes:  [Number],
  opens:   [Number],
  highs:   [Number],
  lows:    [Number],
  volumes: [Number]
}
```
All six arrays are the same length; rows with a null close are dropped at parse time.

### `quote` — `fetchQuote(symbol)`
```js
{ symbol, name, price, change, changePercent, currency, time, stale }
```

### `annuals` — `fetchAnnuals(symbol)`
```js
{ ocf:[{date,v}], capex:[{date,v}], ni:[{date,v}], rev:[{date,v}], assets:[{date,v}] }
```
Oldest first. Typically 4 entries. **Only source of cash-flow data.**

### `dcf` — `computeDcf(...)`
```js
{ base, growth, disc, tg, shares, netDebt,
  pvExplicit, pvTerminal, ev, equity,
  intrinsic, price, upside,
  rows:[{y,fcf,pv}], sens:[{dr, vals:[Number]}] }
```
Or `{ error: "..." }` when FCF ≤ 0.

### `optionAnalysis` — `analyseOptions(chain, spot)`
```js
{ dte, expiry, S, atmIV, pAbove, pcrOI, pcrVol, ceOI, peOI,
  ladder:[{pct,strike,iv,pAbove,ceOI,peOI}],
  maxPain, topCE:{strike,oi}, topPE:{strike,oi}, skew, impliedMove, strikes }
```

### `rankRow` — `scoreStock20(...)`
```js
{ ticker, symbol, price, rsi, above50, above200,
  composite, ind, vol, rs, rs3, pWeek, pMonth,
  annVol, drift, reason, topPattern:{name,bias,age,note} }
```

## 5.2 Units — the most common source of error

| Field | Unit | Note |
|---|---|---|
| `price`, `strike`, `intrinsic` | INR | |
| `changePercent`, `rsi`, `upside` | percent (0–100) | already ×100 |
| `growth`, `disc`, `tg` | **decimal fraction** | 0.08 = 8% — multiply by 100 to display |
| `impliedVolatility` (NSE raw) | percent | divide by 100 before Black-Scholes |
| `dividendYield`, `returnOnEquity` (Yahoo) | **decimal fraction** | ×100 to display |
| `marketCap`, `ocf`, `capex`, `netDebt` | INR absolute | `fmtCr()` converts to crore |
| `regularMarketTime`, `asOfDate` | unix **seconds** | ×1000 for JS Date |
| `debtToEquity` (Yahoo) | percent | 37 means 37%, not 0.37 |

## 5.3 Caches

| Cache | Key | Lifetime |
|---|---|---|
| `quoteCache` | symbol | session |
| `historyCache` | `symbol\|range\|interval` | session |
| `scrCache` | `{large:{}, mid:{}}` by ticker | session |
| `rankCache` | `{large:[], mid:[]}` sorted rows | session |
| `factorCache` | single object | session |

## 5.4 Universes

| Constant | Size | Use |
|---|---|---|
| `UNIV_LARGE` | 55 | Screener + ranking, large cap |
| `UNIV_MID` | 55 | Screener + ranking, mid cap |
| `STOCK_DIRECTORY` | ~110 | Search autocomplete `[symbol, name]` |
| `FACTOR_LARGE` / `FACTOR_SMALL` | 12 each | Size factor construction |

**Maintenance:** these rot. See doc 06 §3.4.

## 5.5 Derived metric formulas

```
RSI(14)        Wilder smoothing of average gain/loss
MACD           EMA12 − EMA26; signal = EMA9(MACD); hist = MACD − signal
Bollinger %B   (price − lower) / (upper − lower), 20-period, 2σ
ATR(14)        Wilder average of max(H−L, |H−Cprev|, |L−Cprev|)
Ann. vol       stdev(log returns) × √252 × 100
Beta           cov(stock, nifty) / var(nifty), date-matched daily log returns
CAGR           (last/first)^(1/years) − 1
Max drawdown   min over series of (price − running peak) / running peak
FCF            operating cash flow − |capex|
Accruals       (net income − operating cash flow) / total assets
P(up) N days   N(  (μ·N) / (σ·√N)  )   where μ,σ are daily log-return moments
Black-Scholes  P(S_T > K) = N(d₂),  d₂ = [ln(S/K) + (r − σ²/2)T] / (σ√T)
Max pain       strike minimising Σ payout to option buyers across all open interest
```
