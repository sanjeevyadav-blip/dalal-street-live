# 18. Engineering Delivery Plan

Work breakdown for a team taking this from a working prototype to a maintainable product.
Estimates assume **2 engineers (1 senior FE, 1 mid FE/DevOps)** working in 2-week sprints.

Total: **~10 weeks / 5 sprints** to a tested, modular, monitored, store-shipped product.

## Team shape

| Role | Allocation | Owns |
|---|---|---|
| Tech Lead / Senior FE | 1.0 | Architecture, refactor, code review |
| Mid FE | 1.0 | Features, tests, UI |
| DevOps (part-time) | 0.3 | CI/CD, Worker, monitoring, store release |
| Product owner | 0.2 | Backlog, acceptance, the non-negotiables in doc 14 |
| QA | shared | Test plan doc 10; automated-first |

---

## EPIC-1 — Modularisation (P0)
**Why:** `index.html` is 264 KB, one IIFE, `renderDetailCore` wrapped 4×. Every new feature
raises the cost of the eventual refactor. **Blocks everything else.**

| ID | Story | Est | Acceptance |
|---|---|---|---|
| E1-1 | Repo scaffolding: Vite, ESLint, Prettier, Vitest, Playwright | 2d | `npm run dev/build/test/lint` all work |
| E1-2 | Extract `data/` — proxy, yahoo, nse, news | 2d | All fetches route through modules; behaviour identical |
| E1-3 | Extract `indicators/` — trend, momentum, volatility, patterns | 3d | Pure functions, zero DOM imports |
| E1-4 | Extract `valuation/` — dcf, reverse-dcf, earnings-quality | 2d | Pure; identical output on golden fixtures |
| E1-5 | Extract `options/` and `models/` | 2d | Pure |
| E1-6 | Extract `ui/` — charts, tables, snapshot, thesis, glossary | 4d | Rendering identical; visual diff clean |
| E1-7 | Replace wrap-by-reassignment with explicit render pipeline | 2d | `DETAIL_BLOCKS.forEach(b => b.render(ctx))`; order is declarative |
| E1-8 | Single-file build via `vite-plugin-singlefile` | 1d | Output deploys to Pages unchanged |

**Definition of done:** byte-for-byte behavioural parity, verified by screenshot diff on
5 stocks + the full E2E suite.

---

## EPIC-2 — Test suite (P0)
**Why:** zero tests today. A wrong number shipped (1D% = 1Y%) and was caught by eye.

| ID | Story | Est | Acceptance |
|---|---|---|---|
| E2-1 | Vitest setup + golden fixtures (5 stocks, saved API responses) | 2d | Fixtures committed; tests run offline |
| E2-2 | Unit tests: indicators (~25 cases, doc 10 §10.2) | 3d | Wilder RSI reference passes |
| E2-3 | Unit tests: valuation, options, models (~20 cases) | 3d | Negative-FCF path returns error object |
| E2-4 | Regression suite for shipped bugs (doc 10 §10.3) | 1d | 1D ≠ 1Y asserted |
| E2-5 | CI invariant checks (doc 10 §10.6) | 1d | Build fails if a BUY/SELL verdict string appears |
| E2-6 | Playwright E2E, 10 flows | 3d | Runs headless in CI |
| E2-7 | Coverage gate ≥ 80% on `indicators/`, `valuation/`, `models/` | 1d | Enforced in CI |

---

## EPIC-3 — CI/CD & environments (P0, DevOps)

| ID | Story | Est | Acceptance |
|---|---|---|---|
| E3-1 | CI workflow: lint, unit, build on every PR | 1d | Red PR cannot merge |
| E3-2 | Deploy workflow: build → Pages, **with rebuild verification** | 1d | Fails loudly if no Actions run fired (doc 11 Trap 2) |
| E3-3 | Staging environment (second Pages site from `staging`) | 1d | `staging` branch auto-deploys |
| E3-4 | Worker to Wrangler, source in repo, deploy from CI | 1d | `wrangler deploy` in pipeline, secrets in GH |
| E3-5 | Scheduled API health check (daily 09:00 IST) | 0.5d | Failing run emails the team |
| E3-6 | PR + issue templates, CODEOWNERS | 0.5d | Review checklist enforced in template |

---

## EPIC-4 — Reliability hardening (P1) — **COMPLETE**

| ID | Story | Est | Acceptance | Status |
|---|---|---|---|---|
| E4-1 | Startup symbol validation; dead tickers surfaced not dropped | 2d | Console + UI warning naming dead symbols | **done** — validated as a by-product of use, not by 110 requests at startup; see the commit for why |
| E4-2 | Per-block error boundaries | 1d | One dead feed never blanks the page | **done** — `runBlock` catches both sync throws and async rejections, without awaiting |
| E4-3 | Retry with backoff in `fetchJsonThroughProxy` | 1d | Transient 5xx recovers | **done** — transient only, bounded by wall clock |
| E4-4 | Structured client error logging (opt-in, no PII) | 2d | Errors visible without a user report | **done** — `src/diagnostics.js` + Diagnostics panel |
| E4-5 | Worker: rate-limit per IP, structured logs | 1d | Abuse contained | **written, NOT DEPLOYED** — needs `npm run worker:deploy`, an explicit-approval action |

EPIC-4 added 51 offline tests and 7 E2E specs. The per-isolate limitation of the E4-5 rate
limiter is documented in `worker/worker.js` itself: a true global limit needs Durable Objects
or KV.

---

## EPIC-5 — Probability lab (P1)
Source exists and passes `node --check` (`src/probability-lab.NOT-DEPLOYED.js`).

| ID | Story | Est | Acceptance |
|---|---|---|---|
| E5-1 | Port GBM Monte Carlo + GARCH(1,1) into `models/` | 2d | Unit-tested against known series |
| E5-2 | Port HMM (Baum-Welch) + walk-forward logistic | 3d | Logistic reports out-of-sample edge vs base rate |
| E5-3 | DCF Monte Carlo + Bayesian ensemble | 2d | P(undervalued) with P10/P90 |
| E5-4 | UI block with per-model assumptions and limitations | 2d | Each model states its failure mode |
| E5-5 | Remove duplicate `olsMulti` (already live in index.html) | 0.5d | Single definition |

---

## EPIC-6 — Native app (P2)

| ID | Story | Est | Acceptance |
|---|---|---|---|
| E6-1 | Capacitor init, Android + iOS projects | 2d | Builds locally |
| E6-2 | Native splash, icons, status bar theming | 1d | Matches design tokens |
| E6-3 | Android release signing + Play Console internal track | 2d | Internal testers install |
| E6-4 | iOS TestFlight | 2d | Requires Apple Developer account (₹8k/yr) |
| E6-5 | CI build pipeline for both stores | 2d | Tagged release → store artefact |

---

## Sprint plan

| Sprint | Weeks | Focus | Exit criteria |
|---|---|---|---|
| S1 | 1–2 | EPIC-1 (E1-1..E1-5) + E3-1 | Data/indicators/valuation modular, CI green |
| S2 | 3–4 | EPIC-1 (E1-6..E1-8) + EPIC-2 (E2-1..E2-3) | Full refactor live, unit tests passing |
| S3 | 5–6 | EPIC-2 (E2-4..E2-7) + EPIC-3 | Coverage gate, staging, Worker in CI, health checks |
| S4 | 7–8 | EPIC-4 + EPIC-5 | Hardened; probability lab shipped |
| S5 | 9–10 | EPIC-6 | Android internal track live |

**Sprint 1 must ship the scaffolding before any refactor lands** — without tests, the
refactor has no safety net, and behavioural parity cannot be proven.

## Risks to delivery

| Risk | Mitigation |
|---|---|
| Refactor breaks behaviour silently | Golden fixtures + screenshot diff **before** refactor starts |
| Upstream API changes mid-sprint | Daily health check; fixtures keep tests offline |
| Scope creep from new analysis ideas | New analysis blocks go to backlog until EPIC-1 and 2 are done |
| Apple account cost/approval | Android first; iOS is a separate decision |
