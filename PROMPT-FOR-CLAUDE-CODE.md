# Paste this as your first message in Claude Code

---

I'm handing you a live project with a complete document set. Everything you need is here.

## Read first, in this order

1. `CLAUDE.md` — standing brief, hard rules, known traps
2. `docs/00-DOCUMENT-INDEX.md` — map of all 22 documents
3. `engineering/18-DELIVERY-PLAN.md` — **the backlog you'll work from**
4. `docs/04-ARCHITECTURE.md` — how it's built now, and the target structure
5. `docs/06-API-SPEC.md` — endpoints, auth handshakes, and the **confirmed dead ends**
   (those are tested; don't re-attempt them)
6. `docs/14-ADR.md` — why key decisions were made

## What exists

A working NSE/BSE research dashboard, live on GitHub Pages, free to run. Price data,
technicals, candlestick patterns, DCF + reverse DCF, earnings quality, live NSE
options-implied probability, factor regression with t-stats, a 6-step thesis walkthrough,
screener and ranking tables, IPO watch, ~95-term glossary with tooltips, user manual,
mobile layout, installable PWA.

Backing it: one Cloudflare Worker doing CORS proxying plus two auth handshakes (Yahoo
crumb, NSE session). Both are load-bearing — without them fundamentals and options go dark.

## The problem

`src/index.html` is 264 KB — every module appended into a single IIFE over many sessions,
with `renderDetailCore` wrapped four times by reassignment. **There are zero tests.** A real
bug shipped (the screener's 1-day change equalled its 1-year change) and was caught only
because a human looked at a screenshot.

## What I want, in order

**Sprint 1 — scaffolding first, refactor second.**
`scaffold/` has working Vite, Vitest, Playwright, ESLint and GitHub Actions configs. Copy
them in, get `npm run verify` green, then start EPIC-1. Do not begin the refactor before
the test harness exists — without golden fixtures you cannot prove behavioural parity.

1. **Tell me your refactor plan before writing code.** I want to agree module boundaries.
2. **EPIC-1** — modularise per `docs/04` §2.8, keeping single-file output via
   `vite-plugin-singlefile`. Behaviour must not change.
3. **EPIC-2** — test suite: unit, the regression cases in `docs/10` §10.3, E2E, 80% coverage
   on the maths modules.
4. **EPIC-3** — CI/CD. Note `deploy.yml` verifies the Pages rebuild actually fired; that
   check exists because a commit once landed while the build silently never ran.
5. **EPIC-5** — ship `src/probability-lab.NOT-DEPLOYED.js`. It's written and passes
   `node --check` but was never deployed. `olsMulti` from it is already live in
   `index.html` — don't double-define.

Then **EPIC-6**: Capacitor wrapper for Android/iOS (`docs/07` §4.5).

## Non-negotiable

`docs/14-ADR.md` ADR-003 and ADR-009, enforced by `scaffold/scripts/check-invariants.sh`:

- **No BUY/HOLD/AVOID verdict**, no target prices, no "probability of reaching X by date Y".
  SEBI restricts published buy/sell calls to registered Research Analysts, and the DCF swings
  40%+ across defensible assumptions — a derived verdict would claim confidence the inputs
  don't support.
- **Never fabricate a value.** Missing data renders `—`. A plausible-looking guess is
  indistinguishable from real data on screen, and someone will act on it.

These are product decisions with reasoning behind them, not unfinished work. The CI
invariant check will fail the build if they're violated — please don't route around it.

## About me

Analytics manager — strong on SQL, Python and statistics, light on front-end. Explain the
reasoning, not just the diff. If you conclude a data source is impossible, show me the
failing response first: that call was wrong once already (NSE options worked after a cookie
handshake and the right endpoint).

---
