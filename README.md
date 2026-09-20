# Dalal Street Live

Live NSE/BSE equity research dashboard. Static site + one Cloudflare Worker. ₹0 to run.

**Live:** https://sanjeevyadav-blip.github.io/dalal-street-live/

## Contents

```
CLAUDE.md                     standing brief (Claude Code reads this automatically)
PROMPT-FOR-CLAUDE-CODE.md     paste this as your first message in Claude Code

docs/00-DOCUMENT-INDEX.md         map of all documents + reading order by role
docs/01-BRD.md                    business case, objectives, constraints
docs/02-PRD.md                    product requirements and non-goals
docs/03-SRS-FUNCTIONAL-SPEC.md    FR-1..FR-17 with acceptance criteria
docs/04-ARCHITECTURE.md           system design, module map, target structure
docs/05-DATA-MODEL.md             object shapes, units, caches, formulas
docs/06-API-SPEC.md               endpoints, auth handshakes, dead ends
docs/07-DESIGN-SYSTEM-UX.md       tokens, components, mobile, PWA, native routes
docs/08-SECURITY-COMPLIANCE.md    threat model, privacy, SEBI position
docs/09-SDLC-PROCESS.md           branching, commits, DoR/DoD, review, release
docs/10-TEST-PLAN.md              unit, regression, integration, E2E, invariants
docs/11-DEPLOYMENT-RUNBOOK.md     deploy, verify, health checks, rollback
docs/12-MAINTENANCE-SUPPORT.md    monitoring, fragilities, fallbacks, cost
docs/13-RISK-REGISTER.md          15 risks with mitigations
docs/14-ADR.md                    10 architecture decision records
docs/15-ROADMAP-BACKLOG.md        prioritised backlog
docs/16-USER-MANUAL.md            end-user guide
docs/17-CHANGELOG.md              version history

engineering/18-DELIVERY-PLAN.md        6 epics, 34 stories, estimates, 5-sprint plan
engineering/19-TEAM-ONBOARDING-RACI.md day-1 setup, RACI matrix, escalation policy
engineering/20-CICD-PIPELINE.md        pipeline, quality gates, environments, secrets
engineering/21-SRE-OBSERVABILITY.md    SLIs/SLOs, data-quality assertions, incidents

scaffold/package.json                  scripts: dev, build, test, lint, verify
scaffold/vite.config.js                single-file build for GitHub Pages
scaffold/vitest.config.js              unit tests + 80% coverage gate
scaffold/playwright.config.js          E2E, desktop + mobile projects
scaffold/eslint.config.js              incl. no-empty-catch rule
scaffold/scripts/check-invariants.sh   fails build on recommendation-shaped output
scaffold/.github/workflows/            ci.yml, deploy.yml, healthcheck.yml
scaffold/.github/                      PR template, issue templates, CODEOWNERS
CONTRIBUTING.md                        the three non-negotiable rules

src/index.html                the whole app (~264 KB)
src/manifest.json, src/sw.js  PWA files
src/probability-lab.NOT-DEPLOYED.js   written, verified, not shipped
worker/worker.js              CORS proxy (both auth handshakes)
worker/wrangler.toml          Worker config
```

## For an engineering team

```bash
cp -r scaffold/. .          # build, test, lint, CI configs
npm install
npm run verify              # lint + tests + invariants + build
```
Then work the backlog in `engineering/18-DELIVERY-PLAN.md`. Sprint 1 ships the scaffolding
before any refactor — the refactor needs a test safety net to prove behavioural parity.

## Quick start

```bash
# serve locally
cd src && python3 -m http.server 8000
# → http://localhost:8000

# deploy the worker
cd worker && npx wrangler deploy
```

## Features

Price/indices/watchlist · candlestick patterns and price action · DCF with sensitivity grid
and reverse DCF · earnings-quality grading · live NSE options-implied probability (Black-
Scholes N(d₂), PCR, max pain, IV skew) · factor decomposition with t-stats · 6-step thesis
walkthrough with position sizing · screener (13 cols) and ranking (11 cols) with independent
row-count selectors · IPO watch · ~95-term glossary with tooltips · 12-step user manual ·
mobile layout · installable PWA.

## What it deliberately does not do

No buy/sell/hold verdict. No target prices. No fabricated numbers when data is missing.
See `CLAUDE.md` for why.
