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
| `docs/10-TEST-PLAN.md` | Test plan. All of §10.2–§10.5 **done**: 379 offline, 10 live-API, 57 E2E (114 runs) |
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
src/ui/native.js                        Capacitor shell behaviour; a no-op on the web
src/ui/mobile-shell.js                  the phone app: 5 tabs, sticky summary, per-tab load
src/ui/top20.js  src/ui/market-news.js   the two sections the phone shell added
worker/worker.js  worker/wrangler.toml  the CORS proxy
capacitor.config.json  android/          the native Android shell (EPIC-6)
tests/          379 offline tests against 31 committed API fixtures
tests/integration/  10 live-API checks (§10.4) — opt-in, hits the real Worker
tests/e2e/      57 Playwright specs, desktop + mobile (114 runs), fixture-routed
scripts/        capture-fixtures.mjs, check-invariants.sh
```

Run `npm run verify:full` — lint, invariants, build, 379 offline tests, then 114 Playwright
runs — before and after any change. `npm run verify` alone skips the browser and is the
faster inner loop.
Regenerate fixtures with `node scripts/capture-fixtures.mjs` (read-only; hits the Worker).

## The phone layout is a different shape from the desktop one

At 760px and below the page is an app: five tabs (Top 20, IPO, Top perf, Screener, News), a
summary strip of the three indices above all of them, and the stock detail as its own view
with a Back button. Above 760px it is the same single document it always was.

`src/ui/mobile-shell.js` does this, and two things about it are load-bearing:

- **The switching is CSS, not JavaScript.** Sections are moved into five `.tabpanel`
  wrappers once, at the end of `bootstrap()`, and a media query decides whether panels
  stack or switch. So there is no resize handler, no viewport branch in JS and no teardown
  path — rotating a phone or dragging a window narrow just works. Do not "improve" this by
  making it conditional on `window.innerWidth`.
- **Panels are filled in document order**, not in the order the selector list is written.
  The list is grouped by meaning and appending in that order silently reordered the page:
  `mountManual` places the manual above the glossary with `insertBefore`, and naming the
  glossary first moved the manual below it. A desktop spec caught it.

A section that no panel's selector list claims is **invisible on a phone and fine on a
desktop** — the panels are the only thing displayed. `tests/unit/boot.test.js` asserts every
section lands in exactly one panel, because nothing else would catch it.

Each tab loads itself on first view, not at boot: the ranking alone scores a 55-name
universe. The Load and Re-run buttons stay, because "fetch again with fresh prices" is a
real thing to want.

**E2E specs must switch tabs.** `showTab(page, id)` in `tests/e2e/helpers/fixture-routes.js`
clicks the nav on mobile and is a no-op on desktop, so one spec body serves both projects.
A spec that reaches straight for `#rankLargeBtn` finds a hidden element under the mobile
project only.

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
- **`android-actions/setup-android@v3` cannot install its own default packages.** Its
  default is `packages: 'tools platform-tools'`, and `tools` is the obsolete SDK Tools
  package Google removed, so sdkmanager exits 1 on it. Use `@v4`. The log misdirects
  badly: it prints pages of licence text ending in `Accept? (y/N):` right before the
  error, which reads as an interactive prompt hanging in CI. It is not — the next line is
  `All SDK package licenses accepted`. Read past the licence dump to
  `Warning: Failed to find package 'tools'`.
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
trigger the Pages deploy.** Pages builds from `main`, so that — and only that — is what
changes what users see.

**Pushing the feature branch to `origin` is allowed when the owner asks.** This reversed on
2026-09-21. The position had been "no GitHub at all, everything local", and it changed
because the Android build cannot run on this machine at all (see EPIC-6 below); offered the
choice, the owner picked building the APK on GitHub's runners. Keep the two ideas apart:
a branch push is routine, `main` is not.

`wrangler deploy` is no longer forbidden outright either — E4-5 was deployed on the same
day — but each deploy needs its own approval. Do not treat the last yes as a standing one.

**`npm run verify:full` is still the gate** — lint, invariants, build, 379 offline tests,
then 114 Playwright runs. Run it before and after any change. CI builds the APK and nothing
else; it is not a substitute for verifying locally, and there is no test job to watch.
`npm run test:integration` is the weekly live-feed check, run by hand.

## Findings surfaced by EPIC-1 — all four now closed

1. ~~Thirteen glossary terms missing from the Glossary section.~~ **Fixed.** The recorded
   remedy — "move `mountGlossary()` to the end of `bootstrap()`" — would have broken the
   layout: `mountManual()` positions itself with `insertBefore(#glossarySection)`. The
   section is still created where it was; only its list is re-rendered at the end of
   `bootstrap()` by `renderGlossaryList()`.
2. ~~`reverseDcf` cannot resolve implied growth at or below 4%.~~ **Fixed.** It was
   reporting `-20%`, the bottom of a bracket it never searched, which read as "the market
   expects a 20% annual decline". It now returns `implied: null` with `belowFloor: true`
   and `floorGrowth`, and the UI says the price implies growth below the terminal rate and
   that the model cannot say how far below. Three outcomes now, all distinct: solved,
   capped at the top, below the floor.
3. ~~A bank still gets a DCF.~~ **Fixed.** `computeDcf` takes an optional `{sector,
   industry}` and declines for banks, insurers and other lenders with an explanation — for
   them OCF-minus-capex tracks loan-book growth, not free cash flow. The HDFCBANK golden
   snapshot was re-baselined for this in its own commit; the other four fixtures are
   unchanged, which is what shows the guard is narrow.
4. ~~`drawChart` does not guard `getContext` returning null.~~ **Fixed.** All three call
   sites in `ui/charts.js` return early instead of dereferencing null.

## First tasks

P0 ~~refactor the monolith~~ done · P0 ~~unit + regression tests~~ done ·
P0 ~~E2E (`docs/10` §10.5)~~ done · P0 ~~live-API integration checks (§10.4)~~ done ·
P0 ~~CI/CD (EPIC-3)~~ dropped as a pipeline — gates are local; CI now builds the APK only ·
P1 ~~reliability hardening (EPIC-4)~~ done — E4-1..E4-5, **all deployed** ·
P1 ~~ship the probability lab (EPIC-5)~~ done — E5-1..E5-5 ·
P2 Capacitor wrapper (EPIC-6) — E6-1 scaffold and E6-2 assets done; **the APK builds in CI,
not locally**.

### EPIC-6 state

`capacitor.config.json` + `android/` are committed and `src/ui/native.js` handles the
WebView-specific behaviour (external links to a Chrome Custom Tab, status-bar theming, no
service worker in the shell) while staying a complete no-op on the website. Icons and
splashes are generated from the design tokens by `npm run app:assets`.

**The toolchain is now installed**: JDK 17 (Microsoft OpenJDK, via winget) and the Android
SDK (cmdline-tools, platform-tools, `platforms;android-34`, `build-tools;34.0.0` — 422 MB at
`%LOCALAPPDATA%\Android\Sdk`, licences accepted, `android/local.properties` written and
gitignored). Gradle 8.2.1 downloaded.

**`npm run app:build` still fails, and it is not a code problem.** Gradle dies with
`java.io.IOException: Unable to establish loopback connection`. Diagnosed — run
`java scripts/diagnose-gradle-loopback.java`:

```
ok    plain loopback socket (bind + connect on 127.0.0.1)
FAIL  java.nio Pipe.open()
FAIL  java.nio Selector.open()      <- what Gradle's daemon needs
```

Java NIO on Windows implements `Pipe` and `Selector` as a TCP socket pair on 127.0.0.1 — the
JVM connects to itself and exchanges a secret. Endpoint protection on this machine blocks
that handshake. Ordinary loopback is fine, so it is not a blanket firewall rule.

**Consequence: no Java build tool works on this machine.** Gradle, Maven's daemon and Android
Studio all fail identically. No Gradle flag, JDK swap or Capacitor change helps — it needs an
endpoint-protection exclusion for `java.exe`, which on a managed machine is an IT request.
Do not spend time re-attempting the build locally; re-run the diagnostic instead.

**The APK is built on GitHub's runners instead** — `.github/workflows/android-build.yml`,
on push to `refactor/**` or by manual dispatch. Linux has no such restriction. The workflow
is read-only, builds `assembleDebug` and uploads the APK as an artifact; download it from
the Actions run page. It has nothing to do with Pages and cannot deploy anything.

**This works.** Run #2 (commit `476ee87`) produced a 4.42 MB debug-signed APK containing
`dev.dalalstreet.live` and the 284,097-byte `assets/public/index.html`, byte-identical in
size to the local `dist/index.html`, which is what shows the sync packaged the real bundle.
Artifacts expire after 90 days, so re-run the workflow rather than hunting for an old one.

Two things about that workflow are load-bearing and easy to undo by accident:

- **`npm run app:sync` must run before Gradle.** Three things Gradle requires are gitignored
  and absent from a clean checkout — `android/capacitor-cordova-android-plugins/` (which
  `settings.gradle` includes as a project), the copied `dist` under
  `app/src/main/assets/public`, and the generated `capacitor.*.json`. The sync regenerates
  all three. Verified by running the whole sequence in a clean worktree.
- **`android/gradlew` is committed mode 100755.** It was generated on Windows as 100644,
  which fails on a Linux runner with permission denied. Fixed with
  `git update-index --chmod=+x`; do not let it revert.

`assembleRelease` is not an option yet: there is no keystore, and `*.keystore` / `*.jks` are
gitignored on purpose. iOS is not possible on Windows at all. E6-3 (Play Console signing)
and E6-4 (TestFlight) still need store accounts.

Native workflow: `npm run app:assets` · `npm run app:sync` · `npm run app:build` (local
build fails here — push instead, and collect the APK from Actions).

### The Worker deploy — done

**EPIC-4 E4-5 is live.** The owner ran `wrangler login` and approved the upload on
2026-09-21, so the deployed Worker now carries the per-IP rate limit and the structured
logs, and `npm run worker:preflight` passes **10/10 against the live URL**.

- deployed version `d454fc15-21c6-4f4a-8dd8-ea553a7f6707`
- previous version, the rollback target, `1c1371c3-7eb0-4558-b7fe-8c458cab07e8`
- procedure and rollback: `docs/11` §5.0

This does not loosen the standing rule above. The Worker was deployed because the owner
asked for that specific upload in that specific message. GitHub Pages, `main` and the
dashboard itself are still untouched, and the next deploy needs its own approval.

Two traps it surfaced, both worth knowing before the next one:

- `npm run worker:deploy` used to run from the repo root. Wrangler searches **upward** for
  `wrangler.toml` and never downward, so it never found `worker/wrangler.toml` and failed
  with an unrelated complaint about an assets directory. The script now `cd`s into `worker/`.
- The live preflight is flaky in a way the `wrangler dev` one is not. NSE intermittently
  403s the Cloudflare edge — the documented trap, not a regression. **Retry before
  concluding a deploy broke something:** the run straight after this deploy reported an NSE
  403 and a `fetch failed`, and both passed a minute later with the Worker unchanged.
