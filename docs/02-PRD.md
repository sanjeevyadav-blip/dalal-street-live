# 1. Product Requirements — Dalal Street Live

**Owner:** Sanjeev Yadav · **Live:** https://sanjeevyadav-blip.github.io/dalal-street-live/
**Status:** Web + mobile web + PWA shipped. Native app not built.

## 1.1 Problem

Retail equity research in India is split across a dozen sites: prices on one, technicals on
another, fundamentals on a third, option chains on a fourth — each with its own ads,
paywalls, and target-price hype. None of them show you *where a number came from* or
*how far you should trust it*.

## 1.2 What this is

A single-page dashboard for NSE/BSE equities that puts price, technicals, valuation,
earnings quality, options-implied probability and factor exposure on one screen, with
provenance and failure modes printed next to every figure.

## 1.3 Who it is for

Primary: the owner — an analytics manager doing his own research, statistically literate,
wants to see the workings rather than a conclusion.
Secondary: anyone who lands on the public URL. Hence the glossary and user manual, which
assume no finance background.

## 1.4 Goals

| # | Goal | How it is met |
|---|---|---|
| G1 | One screen for a full stock picture | 13 analysis blocks in the detail panel |
| G2 | Every number traceable | Snapshot table has a Source column on every row |
| G3 | Honest uncertainty | DCF sensitivity grid, t-stats, risk-neutral caveats |
| G4 | Understandable by a layperson | ~95-term glossary, ⓘ tooltips, 12-step manual |
| G5 | Free to run forever | GitHub Pages + Cloudflare Workers free tiers |
| G6 | Usable on a phone | Mobile layout + installable PWA |

## 1.5 Explicit non-goals — these are decisions, not gaps

- **No BUY / HOLD / AVOID verdict.** The verdict panel reports five pillars separately and
  says why it stops there. DCF output swings 40%+ across defensible assumptions; synthesis
  depends on the user's horizon, holdings and tax position; and publishing buy/sell calls in
  India is restricted to SEBI-registered Research Analysts.
- **No target prices**, and no "probability of reaching price X by date Y".
- **No fabricated metrics.** A blank cell is correct when data is missing. A filled cell must
  be real.
- **Not a trading terminal.** Data comes from unofficial endpoints; check your broker before
  acting.

## 1.6 Functional requirements

**FR1 Market view** — scrolling ticker, 3 index cards, IST clock, market-open status.
**FR2 Search** — 3+ char ranked autocomplete over a ~110-name directory, keyboard nav.
**FR3 Watchlist** — add/remove symbols, NSE or BSE, click through to detail.
**FR4 Stock detail** — snapshot, charts, technicals, risk/momentum, price action,
candlesticks, DCF, earnings quality, options, factors, thesis walkthrough, news, profile.
**FR5 Screener** — 13 columns, 55-name universe, independent row-count selector.
**FR6 Ranking** — composite score, 11 columns incl. P(up) 1 week / 1 month + reasoning.
**FR7 IPO watch** — live NSE issues, news, filing links.
**FR8 Glossary + manual** — tooltips auto-attached, searchable glossary, 12-step manual.
**FR9 Mobile + PWA** — responsive layout, bottom nav, installable, offline shell.

## 1.7 Non-functional

- Cold load to first price: **< 1.5s** (measured 1.1s).
- Full stock detail: **< 3s** for core blocks; heavy blocks fill in progressively.
- Zero recurring cost. Cloudflare free tier is 100k requests/day; typical use is < 500.
- No backend, no database, no auth, no PII collected.

## 1.8 Success criteria

1. Owner uses it instead of opening four other sites.
2. No number on screen that cannot be traced to a source or a stated assumption.
3. A non-finance reader can understand any metric via its tooltip.
