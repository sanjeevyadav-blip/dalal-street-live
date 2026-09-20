# 03. Software Requirements Specification (Functional Spec)

Each requirement has an ID, a statement, and acceptance criteria that can become a test.
Traces back to BR-n in doc 01.

## FR-1 Market overview  *(BR-1)*
The system shall display live index values and a scrolling ticker.
- **AC-1.1** Nifty 50, Sensex, Nifty Bank each show last price, absolute change, % change.
- **AC-1.2** Direction is colour-coded (green up / red down) **and** carries an arrow glyph.
- **AC-1.3** An IST clock updates every second and shows Market open/closed against
  09:15–15:30 IST on weekdays.
- **AC-1.4** If a feed fails, the last known value is shown flagged as stale — never a zero.

## FR-2 Stock search  *(BR-1)*
- **AC-2.1** Typing 3+ characters shows ranked suggestions (symbol-prefix > name-prefix >
  symbol-substring > name-substring), max 10.
- **AC-2.2** ↑/↓ navigate, Enter selects, Esc closes.
- **AC-2.3** NSE/BSE selector appends `.NS`/`.BO`.
- **AC-2.4** An unresolvable symbol shows an explanatory message, not a blank panel.

## FR-3 Watchlist  *(BR-1)*
- **AC-3.1** Add by symbol + exchange; remove per row; clicking a row opens detail.
- **AC-3.2** Auto-refresh at 15/30/60s or off.
- **AC-3.3** Rows fetch in parallel (pool of 5), not sequentially.

## FR-4 Stock detail — snapshot  *(BR-2, BR-6)*
- **AC-4.1** Every row shows Metric, Value, **Source**.
- **AC-4.2** Source is one of: `Computed here`, `Yahoo Finance`, `NSE option chain · live`,
  `Not sourced — fixed input`.
- **AC-4.3** Stale or assumption-based values carry a ⚠ flag with an explanation.
- **AC-4.4** Quote timestamp is displayed; when market is closed this is stated.

## FR-5 Charts  *(BR-2)*
- **AC-5.1** Price with 50/200 DMA and Bollinger shading; volume, RSI, MACD subplots.
- **AC-5.2** Range selector 1M/3M/6M/1Y/2Y re-slices cached data without re-fetching.
- **AC-5.3** Hover tooltip shows date and close.
- **AC-5.4** Canvas respects `devicePixelRatio`; redraws on resize.

## FR-6 Technical indicators  *(BR-2)*
RSI(14), MACD(12,26,9), Bollinger %B(20,2), ATR(14), annualised volatility, beta and
correlation vs Nifty, SMA 20/50/100/200, CAGR, max drawdown, Sharpe-style ratio,
Stochastic %K/%D, OBV trend, classic pivots, intraday VWAP.
- **AC-6.1** All computed client-side from the price series — never a vendor figure.
- **AC-6.2** Insufficient history yields `—`, not a partial-window number.

## FR-7 Price action & candlesticks  *(BR-2)*
- **AC-7.1** Trend classified from swing highs/lows as uptrend / downtrend / range.
- **AC-7.2** Nearest support and resistance with % distance.
- **AC-7.3** Detects Doji, Hammer, Hanging Man, Shooting Star, Marubozu, Bullish/Bearish
  Engulfing, Morning/Evening Star over the last 5 sessions, each tagged with bias.

## FR-8 Valuation — DCF and reverse DCF  *(BR-3)*
- **AC-8.1** FCF = operating cash flow − capex, from 4 years of timeseries data.
- **AC-8.2** Growth from historical CAGR, clamped [−5%, +20%], fading 15%/yr to terminal 4%.
- **AC-8.3** Discount rate = CAPM (7% + β×6%), clamped [11%, 16%].
- **AC-8.4** Net debt deducted; result divided by shares outstanding.
- **AC-8.5** A 3×3 sensitivity grid (3 discount rates × 3 growth rates) is always shown.
- **AC-8.6** Terminal value share of total is displayed.
- **AC-8.7** Negative FCF produces an explanatory message, never a negative "fair value".
- **AC-8.8** Reverse DCF solves by bisection for the growth rate implying current price, and
  compares it to historical growth.

## FR-9 Earnings quality  *(BR-3)*
- **AC-9.1** Reports cash-flow/net-profit, accruals ratio, FCF margin, capex intensity,
  revenue-vs-cash-flow growth divergence.
- **AC-9.2** Grades Strong / Reasonable / Mixed / Weak from passed checks, with each
  check shown as an explicit pass/fail line.

## FR-10 Options-implied probability  *(BR-4)*
- **AC-10.1** Fetches expiries, then the v3 chain with explicit expiry.
- **AC-10.2** P(above spot) = N(d₂) using live ATM implied volatility.
- **AC-10.3** Reports ATM IV, implied ±1σ move, PCR (OI and volume), max pain, IV skew,
  heaviest call/put OI, and a strike ladder at −10/−5/0/+5/+10%.
- **AC-10.4** Non-F&O stocks show "no contracts listed", never a computed zero.
- **AC-10.5** Output is explicitly labelled risk-neutral, not real-world.

## FR-11 Factor decomposition  *(BR-9)*
- **AC-11.1** OLS of excess returns on market, size and momentum factors.
- **AC-11.2** Reports alpha (annualised) with **t-statistic**, loadings, R², idiosyncratic %.
- **AC-11.3** |t| < 1.96 is labelled "not distinguishable from zero".
- **AC-11.4** Factors are labelled self-constructed proxies, not canonical Fama-French.

## FR-12 Thesis walkthrough  *(BR-3, BR-6)*
Six numbered steps: consensus vs our estimate → DCF + reverse DCF → catalysts →
technical levels → position sizing → verdict panel.
- **AC-12.1** Position sizing takes user capital, risk %, stop → shares, position value,
  % of capital, with a concentration warning above 25%.
- **AC-12.2** The verdict panel reports five pillars **separately** and renders no single
  BUY/HOLD/AVOID label.

## FR-13 Screener  *(BR-5)*
13 columns; 55-name universes; independent row-count selector (10/15/20/30/50); results
cached so widening only fetches new names; horizontal scroll.
- **AC-13.1** 1-day change must differ from 1-year change (regression guard).

## FR-14 Ranking  *(BR-5)*
- **AC-14.1** Composite = indicators 35% + relative strength 35% + candlesticks 15% +
  volume 15%.
- **AC-14.2** The **entire universe** is scored before slicing to top N.
- **AC-14.3** P(up) 1 week and 1 month from the stock's own drift/volatility, plus a tilt
  capped at ±6 points, with a reasoning column naming the drivers.

## FR-15 IPO watch  *(BR-8)*
Live NSE issues; detail shows price band, size, window, news and official filing links, and
states plainly that pre-listing financials exist only in DRHP PDFs.

## FR-16 Glossary & manual  *(BR-6)*
- **AC-16.1** ~95 terms; ⓘ markers auto-attached to labels via MutationObserver so
  dynamically rendered panels are covered.
- **AC-16.2** Searchable glossary section; 12-step user manual.

## FR-17 Mobile & PWA  *(BR-7)*
- **AC-17.1** ≤760px: sticky header, swipe indices, 2-col metrics, bottom nav, 16px inputs.
- **AC-17.2** Installable: valid manifest, registered service worker, install prompt.
- **AC-17.3** Service worker never caches market data.

## Non-functional requirements

| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-1 | Cold load to first price | < 1.5s | 1.1s measured |
| NFR-2 | Full stock detail render | < 3s core | met |
| NFR-3 | Recurring cost | ₹0 | met |
| NFR-4 | Graceful degradation on feed failure | No fabricated values | met |
| NFR-5 | Works offline (shell only) | Page loads, data shows error | met |
| NFR-6 | No PII collected | Zero | met |
| NFR-7 | Accessible on 360px screens | Usable | met |
