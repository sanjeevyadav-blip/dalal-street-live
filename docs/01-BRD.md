# 01. Business Requirements Document

**Project:** Dalal Street Live · **Sponsor/Owner:** Sanjeev Yadav
**Type:** Personal/professional build — research tool and portfolio artefact
**Budget:** ₹0 recurring (hard constraint)

## 1. Business context

Retail equity research in India is fragmented. A single stock decision typically requires
four to six sites: one for prices, one for charts, one for fundamentals, one for the option
chain, one for news. Each carries ads, upsells and — most damagingly — target prices and
buy calls presented with a confidence the underlying analysis does not support.

There is also a skills dimension. The owner is an analytics manager targeting Analytics
Head level within four years, and is deliberately building AI-augmented, interview-grade
proof of work. A production system that combines statistics, valuation theory, data
engineering and product judgement is a stronger artefact than any certificate.

## 2. Business objectives

| ID | Objective | Measure |
|---|---|---|
| BO-1 | Consolidate equity research into one screen | Replaces 4+ sites for a stock review |
| BO-2 | Make every number traceable and honestly bounded | 100% of displayed metrics carry a source or stated assumption |
| BO-3 | Zero recurring cost | ₹0/month, verified against free-tier limits |
| BO-4 | Demonstrable senior-level technical artefact | Withstands senior-interview scrutiny on design choices |
| BO-5 | Accessible to a non-finance reader | Every term explained in plain English in-product |
| BO-6 | Usable on mobile | Installable, works on a phone |

## 3. Business requirements

| ID | Requirement | Priority |
|---|---|---|
| BR-1 | Live NSE/BSE prices and indices | Must |
| BR-2 | Technical analysis (trend, momentum, volatility, patterns) | Must |
| BR-3 | Fundamental valuation (DCF, reverse DCF, earnings quality) | Must |
| BR-4 | Market-implied probability from live option chains | Must |
| BR-5 | Comparative screening and ranking across a stock universe | Must |
| BR-6 | Plain-English explanation of every metric | Must |
| BR-7 | Mobile and installable app experience | Must |
| BR-8 | IPO pipeline visibility | Should |
| BR-9 | Factor decomposition (market/size/momentum) | Should |
| BR-10 | Statistical probability models (GBM, GARCH, HMM, ML) | Could |
| BR-11 | Portfolio tracking with P&L | Won't (this phase) |
| BR-12 | Trade execution | Won't — out of scope, needs broker integration and regulatory cover |

## 4. Constraints

| ID | Constraint | Consequence |
|---|---|---|
| C-1 | No budget | Static hosting + free-tier serverless only; no paid data vendor |
| C-2 | No backend/database | All computation client-side; no user accounts, no persistence |
| C-3 | Unofficial data sources | Yahoo/NSE endpoints can change without notice; must degrade gracefully |
| C-4 | SEBI regulation | Cannot publish buy/sell recommendations or target prices |
| C-5 | Owner is not a front-end developer | Code must be AI-maintainable; documentation matters more than usual |

## 5. Assumptions

- Yahoo Finance and NSE public endpoints remain reachable through a proxy.
- Cloudflare Workers free tier (100k req/day) far exceeds single-user demand.
- Data is for research and learning, not for placing trades without broker verification.

## 6. Stakeholders

| Stakeholder | Interest |
|---|---|
| Owner | Daily research use; portfolio artefact |
| Public visitors | Free access; must not be misled |
| SEBI (regulatory context) | No unlicensed investment advice published |
| Data providers (Yahoo, NSE, Bing) | Reasonable, low-volume, non-commercial use |

## 7. Success criteria

1. Owner uses it in preference to existing sites — **met**.
2. Zero cost — **met**.
3. No untraceable number on screen — **met** via the Snapshot source column.
4. Loads in under 1.5s on a cold visit — **met** (measured 1.1s).
5. Installable on a phone — **met** (PWA).

## 8. Out of scope

Trade execution · brokerage integration · portfolio P&L · alerts/notifications ·
multi-user accounts · paid data feeds · intraday tick data · derivatives strategy builder.
