# 3. Data Sources & API Reference

Every endpoint below was tested live. The "dead ends" section exists so you do not
waste hours rediscovering them.

Proxy base: `https://dalal-proxy.sanjeev-yadav.workers.dev/?url=<urlencoded target>`

## 3.1 Working endpoints

### Price / OHLC — Yahoo chart
```
https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=2y
```
- NSE symbols use `.NS`, BSE uses `.BO`. Indices: `^NSEI`, `^BSESN`, `^NSEBANK`.
- Returns `chart.result[0]` with `meta`, `timestamp[]`, `indicators.quote[0]{open,high,low,close,volume}`.
- Intraday: `range=1d&interval=5m` (used for VWAP).
- 5y gives ~1241 daily bars — enough for GARCH/HMM.

> **Trap:** with `range=1y`, `meta.previousClose` is **absent**. Falling back to
> `meta.chartPreviousClose` gives the close from a *year* ago. This shipped as a real bug
> where 1-day change equalled 1-year change. Always derive previous close from
> `closes[len-2]`, and sanity-check `previousClose` is within 25% of spot before using it.

### Fundamentals — Yahoo quoteSummary (**needs crumb**)
```
https://query2.finance.yahoo.com/v10/finance/quoteSummary/{SYMBOL}
  ?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,
           calendarEvents,earningsHistory,recommendationTrend
```
Returns `401 Invalid Cookie` without the crumb. Values are wrapped as `{raw, fmt}` — use the
`val()` helper.

### Multi-year financials — Yahoo timeseries
```
https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{SYM}
  ?symbol={SYM}&type=annualOperatingCashFlow,annualCapitalExpenditure,
   annualNetIncome,annualTotalRevenue,annualTotalAssets&period1={unix}&period2={unix}
```
Gives 4 years. **This is the only source of operating cash flow and capex** — the old
`cashflowStatementHistory` module now returns only `netIncome`. Powers the DCF and
earnings-quality blocks.

### Option chain — NSE (**needs NSE session**)
```
1. https://www.nseindia.com/api/option-chain-contract-info?symbol=RELIANCE
   → { expiryDates: ["29-Sep-2026", ...] }
2. https://www.nseindia.com/api/option-chain-v3?type=Equity&symbol=RELIANCE&expiry=29-Sep-2026
   → records{ underlyingValue, data[]{ strikePrice, CE{...}, PE{...} } }
```
Indices use `type=Indices&symbol=NIFTY`. Only ~180 NSE names have options — handle absence
explicitly rather than showing zeros.

### IPOs — NSE
```
https://www.nseindia.com/api/all-upcoming-issues?category=ipo
```
Returns 8 fields only: companyName, symbol, issuePrice, issueSize, start/end dates, series,
status. **No financials** — pre-listing numbers live in DRHP PDFs on SEBI, which no free API
exposes as data. Link to them instead.

### News — Bing RSS
```
https://www.bing.com/news/search?q={company}+stock&format=RSS
```
Parse with `DOMParser`. Returns relevant Indian market coverage including IPO GMP articles.

## 3.2 Confirmed dead ends — do not re-attempt

| Endpoint | Result | Why |
|---|---|---|
| `option-chain-equities` | `{}` always | Deprecated. Use `option-chain-v3` + explicit expiry |
| Google News RSS | `503 "automated queries"` | Google blocks Cloudflare IP ranges |
| Yahoo `v7/finance/options` for `.NS` | 0 expiries | No Indian options coverage |
| Yahoo `v1/finance/search` news | Generic US headlines | Ignores the query entirely |
| `cashflowStatementHistory` | only `netIncome` | Yahoo stripped it; use timeseries |
| `nseindia.com/api/quote-equity` | 403 Access Denied | Akamai bot wall |
| corsproxy.io | 401 | Now needs a paid key |
| allorigins / codetabs | timeouts | Unreliable free relays; that is why the Worker exists |

## 3.3 Auth handshakes

**Yahoo crumb** (cached 30 min, refreshed on 401/403):
```
GET https://fc.yahoo.com/                      → collect set-cookie
GET query1.../v1/test/getcrumb  (with cookie)  → crumb string
then append &crumb=<crumb> to every Yahoo request
```

**NSE session** (cached 10 min):
```
GET https://www.nseindia.com/                  → cookies
GET https://www.nseindia.com/option-chain      → more cookies
merge all set-cookie values, then send with:
  Referer: https://www.nseindia.com/option-chain
  X-Requested-With: XMLHttpRequest
  Accept: application/json, text/plain, */*
```
NSE responses must **not** be edge-cached — the session is per-request-context.

## 3.4 Ticker universe rot

Symbols die when companies merge or rename. Already fixed:

| Dead | Replacement | Cause |
|---|---|---|
| `TATAMOTORS` | `TMPV` | Demerger |
| `ZOMATO` | `ETERNAL` | Rename |
| `LTIM` | (none found) | No working variant on this feed |
| duplicate `NMDC` | `POLYCAB` | Listed twice in mid-cap universe |

**Build a startup validation pass** that pings each universe symbol and reports dead ones,
rather than silently dropping rows.

## 3.5 Assumptions that are not sourced

| Input | Value | Note |
|---|---|---|
| Risk-free rate | 7.00% | Hardcoded. No free India 10-Y G-Sec API. Feeds CAPM + DCF |
| Equity risk premium | 6.00% | Standard India assumption |
| Terminal growth | 4.00% | Long-run nominal GDP proxy |
| Discount rate clamp | 11–16% | Yahoo betas for Indian names are often understated |

These are labelled in the UI as assumptions, not data. Keep it that way.
