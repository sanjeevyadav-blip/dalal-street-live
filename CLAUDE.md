# CLAUDE.md — project context

Claude Code reads this file automatically. It is the standing brief for this repo.

## What this is

**Dalal Street Live** — a single-page NSE/BSE equity research dashboard.
Static site on GitHub Pages + one Cloudflare Worker as a CORS proxy. No backend, no DB, no auth.

- Live: https://sanjeevyadav-blip.github.io/dalal-street-live/
- Repo: https://github.com/sanjeevyadav-blip/dalal-street-live (branch `main`)
- Proxy: https://dalal-proxy.sanjeev-yadav.workers.dev

## Read these before changing anything

| Doc | When you need it |
|---|---|
| `docs/00-DOCUMENT-INDEX.md` | Map of all 18 docs + reading order by role — **start here** |
| `docs/01-BRD.md` | Business case, constraints, out of scope |
| `docs/02-PRD.md` | What it is for, and the **non-goals** (decisions, not gaps) |
| `docs/03-SRS-FUNCTIONAL-SPEC.md` | FR-1..FR-17 with acceptance criteria — the spec to build against |
| `docs/04-ARCHITECTURE.md` | How the single file is organised; module map; target structure |
| `docs/05-DATA-MODEL.md` | Object shapes and **units** (fraction vs percent is the recurring bug) |
| `docs/06-API-SPEC.md` | Every endpoint, auth handshakes, **confirmed dead ends**, traps |
| `docs/07-DESIGN-SYSTEM-UX.md` | Tokens, components, mobile spec, PWA, native app routes |
| `docs/08-SECURITY-COMPLIANCE.md` | Worker allowlist, privacy, SEBI position |
| `docs/09-SDLC-PROCESS.md` | Branching, commits, definition of done, review checklist |
| `docs/10-TEST-PLAN.md` | Test plan. All of §10.2–§10.5 **done**: 271 offline, 10 live-API, 34 E2E (68 runs) |
| `docs/11-DEPLOYMENT-RUNBOOK.md` | Deploy, verify, health checks, failure playbook |
| `docs/12-MAINTENANCE-SUPPORT.md` | Fragilities ranked, fallbacks if a feed dies |
| `docs/13-RISK-REGISTER.md` | 15 risks; top three to act on |
| `docs/14-ADR.md` | **Why** key decisions were made — read before "fixing" one |
| `docs/15-ROADMAP-BACKLOG.md` | Prioritised backlog |
| `docs/16-USER-MANUAL.md` | End-user guide |
| `docs/17-CHANGELOG.md` | Version history |
| `engineering/18-DELIVERY-PLAN.md` | **Epics, stories, estimates, sprints — start work here** |
| `engineering/22-REFACTOR-PLAN.md` | How EPIC-1 was done, every deviation, and what it surfaced |
| `engineering/19-TEAM-ONBOARDING-RACI.md` | Day-1 setup, who owns what, escalation |
| `engineering/20-CICD-PIPELINE.md` | Pipeline, gates, environments, secrets |
| `engineering/21-SRE-OBSERVABILITY.md` | SLOs, data-quality assertions, incidents |

## Files

**EPIC-1 is complete.** The single 3,888-line IIFE is now 39 ES modules built by Vite into
one `dist/index.html` for GitHub Pages. `engineering/22-REFACTOR-PLAN.md` records how, and
why each boundary is where it is.

```
src/index.html                          markup shell only (141 lines)
src/styles.css                          extracted verbatim from the old <style> block
src/app.js                              bootstrap, loadStockDetail, and the mount sequence
src/diagnostics.js                      PII-free ring buffer of suppressed failures (E4-4)
src/suppressed.js                       thin alias over diagnostics, 21 call sites
src/data/       proxy nse news yahoo universes symbol-health
src/indicators/ trend momentum volatility patterns intraday util
src/valuation/  dcf reverse-dcf earnings-quality dcf-monte-carlo
src/options/    chain
src/models/     normal ols gbm random stats monte-carlo garch hmm logistic ensemble
src/ui/         detail detail-state charts snapshot thesis deep-analysis options-block
                factors-block fundamentals news-block intraday-desk peers watchlist
                glossary ipo format errors navigate symbol diagnostics-block
                probability-lab tables/{screener,ranking}
src/public/     manifest.json sw.js    PWA — COPIED to dist, not inlined (see vite.config.js)
worker/worker.js  worker/wrangler.toml  the CORS proxy
tests/          342 offline tests against 31 committed API fixtures
tests/integration/  10 live-API checks (§10.4) — opt-in, hits the real Worker
tests/e2e/      46 Playwright specs, desktop + mobile (92 runs), fixture-routed
scripts/        capture-fixtures.mjs, check-invariants.sh
```

Run `npm run verify:full` — lint, invariants, build, 220 offline tests, then 54 Playwright
runs — before and after any change. `npm run verify` alone skips the browser and is the
faster inner loop.
Regenerate fixtures with `node scripts/capture-fixtures.mjs` (read-only; hits the Worker).

## Hard rules — these are deliberate, do not "fix" them

1. **No BUY / HOLD / AVOID verdict.** The verdict panel reports five pillars separately and
   explains why it stops there. Reasons: DCF swings 40%+ across defensible assumptions; the
   synthesis depends on the user's horizon, holdings and tax position; and publishing
   buy/sell calls in India is restricted to SEBI-registered Research Analysts.
2. **No target prices**, no "probability of reaching price X by date Y".
3. **Never fabricate a metric.** Missing data renders as `—` or an explicit message.
   A filled cell must be real. This matters more than a complete-looking table.
4. **Every number carries its provenance and failure mode.** Probabilities are labelled
   model output; risk-neutral probabilities are flagged as not real-world; the self-built
   size/momentum factors are flagged as not canonical Fama-French; the 7% risk-free rate is
   labelled an assumption, not data.
5. **Glossary entries warn about misreadings**, not just define terms.

## Traps that already cost real time

- `raw.githubusercontent.com` is **stale** for minutes after a commit. Verify with the
  GitHub Contents API.
- A successful commit does **not** guarantee a Pages rebuild. Check `/actions/runs`.
- With `range=1y` Yahoo omits `meta.previousClose`; falling through to `chartPreviousClose`
  gives a year-old price. This shipped as 1D% == 1Y%.
- `option-chain-equities` is dead. Use `option-chain-v3` **with an explicit expiry**.
- Ticker universes rot (TATAMOTORS→TMPV, ZOMATO→ETERNAL, LTIM dead).
- **A green build does not mean a complete `dist/`.** Vite emitted only `index.html` while
  the page went on referencing `manifest.json` and `sw.js`, silently killing the PWA. All 217
  offline tests passed — none of them looked past `index.html`. `publicDir: 'public'` fixes
  it; `tests/unit/build-output.test.js` and `tests/e2e/pwa.spec.js` now hold it down.

## Working style

The owner is an analytics manager (SQL/Python/BigQuery), not a front-end developer — he
relies on AI for the code. Be direct and high-output, minimal clarifying questions, prefer
tables over thin bullets, explain the underlying concept rather than only shipping code.

He pushes back accurately when something is declared impossible — and has been right:
the NSE options integration was initially called impossible and worked once the cookie
handshake and correct endpoint were found. **Re-test before concluding a source is dead.**

## Deployment — read before any git operation

The dashboard is live and in use. **Do not push to `main`, do not merge to `main`, do not
trigger the Pages deploy, do not `wrangler deploy`.** Work on a branch, and keep it local.

The owner does not use GitHub, so there is no CI to watch and nothing runs on push. The
`.github/workflows/` files were deleted for that reason. **`npm run verify:full` is the gate**
— lint, invariants, build, 220 offline tests, then 54 Playwright runs. Run it before and
after any change. `npm run test:integration` is the weekly live-feed check, run by hand.

## Findings that are still open (surfaced by EPIC-1, deliberately not fixed)

1. **Thirteen glossary terms are missing from the Glossary section.** `mountGlossary()` reads
   `GLOSSARY` once to build the list, and the three `extendGlossaryFor*()` calls run after it.
   They work as tooltips but never appear in the section. One-line fix: move `mountGlossary()`
   to the end of `bootstrap()` in `src/app.js`. It is a behavioural change, hence untouched.
2. **`reverseDcf` cannot resolve implied growth at or below 4%.** Growth is floored at the
   terminal rate, so every value ≤ 4% is indistinguishable and reports the −20% bound. An
   implied-growth reading of −20% does not mean a 20% decline is expected. See `docs/10` §10.2.
3. **A bank still gets a DCF.** HDFCBANK computes one with growth pinned at the +20% cap;
   OCF-minus-capex is not meaningful for a bank. Product question, not an engineering one.
4. **`drawChart` does not guard `getContext` returning null.** Harmless in a browser.

## First tasks

P0 ~~refactor the monolith~~ done · P0 ~~unit + regression tests~~ done ·
P0 ~~E2E (`docs/10` §10.5)~~ done · P0 ~~live-API integration checks (§10.4)~~ done ·
P0 ~~CI/CD (EPIC-3)~~ dropped — no GitHub; gates are local ·
P1 ~~reliability hardening (EPIC-4)~~ done — E4-1..E4-5, though E4-5 is **not deployed** ·
P1 ~~ship the probability lab (EPIC-5)~~ done — E5-1..E5-5 ·
**P2 Capacitor wrapper (EPIC-6) — next.** Detail in `engineering/18-DELIVERY-PLAN.md`.

The one remaining EPIC-4 caveat: the Worker rate limit and structured logs exist in
`worker/worker.js` but the deployed Worker is unchanged. Shipping them needs
`npm run worker:deploy`, which is an explicit-approval action.
