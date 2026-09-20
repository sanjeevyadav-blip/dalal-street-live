# 22. EPIC-1 Refactor Plan — module boundaries for review

Status: **EPIC-1 complete — PR-0 through PR-9 all landed.** Committed to a branch; `main` is
untouched and still matches the live site exactly.

`src/index.html` went from 3,888 lines in one IIFE to 39 ES modules, the largest of which is
`app.js` at 650 lines. No wrap-by-reassignment remains. 217 tests run offline against 31
committed fixtures. All 33 golden snapshots, written at PR-1 against the original monolith,
still pass unchanged — that is the parity proof for the whole epic.

Scope: `engineering/18-DELIVERY-PLAN.md` EPIC-1 (E1-1..E1-8), refining the target tree in
`docs/04-ARCHITECTURE.md` §2.8 with a function-by-function assignment.

---

## 1. What the harness already proves (E1-1, done)

| Step | At PR-0 | After PR-9 |
|---|---|---|
| `npm run lint` | clean (nothing to lint) | clean — `src/app.js`, `src/data/`, `src/indicators/` all linted |
| `npm run test` | 6 tests | **217 tests**, 9 files |
| `src/` modules | 1 file | **39 files**, largest 650 lines |
| `npm run invariants` | holds | holds |
| `npm run build` | 263,813 bytes | **235,900 bytes** (−10.6%) |

`verify` runs lint → invariants → **build** → test, because
`tests/unit/build-output.test.js` asserts on `dist/` and skipped itself under the old order.

Three scaffold gaps were fixed to get there, all noted in the configs themselves:

| Gap | Fix |
|---|---|
| `vite.config.js` had no `root`, so the build could not find `src/index.html` | `root: 'src'`, `outDir: '../dist'`, `emptyOutDir: true` — keeps the path `deploy.yml` and the CI size guard expect |
| `npm run lint` failed: `src/` contains no lintable `.js` yet | `--no-error-on-unmatched-pattern`; `sw.js` and `probability-lab.NOT-DEPLOYED.js` ignored until EPIC-5 ports them |
| `happy-dom` required by `vitest.config.js`, absent from `package.json` | added as a devDependency |

**The parity method changed at PR-4, and it had to.** Through PR-3 the build was close enough
to a passthrough that diffing it against the deployed file was the proof — PR-3's entire diff
was the `<style>` tag boundary, with all 312 CSS lines byte-identical. From PR-4 the source is
a module graph that no browser ever sees: esbuild parses and re-emits it, normalising quotes,
indentation and spacing throughout, so a byte diff is thousands of lines of noise with any
real change buried inside.

What replaces it:

| Gate | What it pins |
|---|---|
| 33 golden snapshots | Every pure function's output on every fixture, to 6 decimal places |
| `tests/unit/boot.test.js` | The **built artefact** boots, wires its sections and survives a dead network |
| `tests/unit/build-output.test.js` | The artefact is self-contained — no local refs, CSS and script inlined |

The boot test was moved onto `dist/index.html` in this PR specifically because the byte diff
stopped being usable. If the bundle is wired up wrongly or a module fails to resolve, that is
now where it surfaces.

---

## 2. What the monolith actually contains

Read before agreeing boundaries — two findings change the shape of the work.

### 2.1 Roughly 7% of the file is unreachable

The screener and ranking features were each rewritten three or four times. Every generation
is still in the file, and every generation still calls `addEventListener` on the same
element IDs. They do not all fire: each later generation begins with a
`rebuildScreener*` / `rebuildRanking*` IIFE that does `sec.innerHTML = ...`, which destroys
the previous generation's buttons and their listeners along with them. Only the last
generation is reachable.

| Feature | Generations present | Live one | Dead |
|---|---|---|---|
| Screener | `loadScreenerGroup` → `loadScreener2` → `loadScreener3` | `loadScreener3` | first two |
| Ranking | `runRanking` → `runRanking20` → `runRankingFull` → `runRanking3` | `runRanking3` | first three |
| Row fetch | `fetchScreenerRow` → `fetchScreenerRow2` | `fetchScreenerRow2` | first |
| Scoring | `scoreStock` → `scoreStock20` | `scoreStock20` | first |

| Dead region | Lines |
|---|---|
| `fetchScreenerRow`, `screenerRowHtml`, `loadScreenerGroup` | 1831–1878 (46) |
| `scoreStock`, `runRanking` | 2224–2289 (66) |
| `runRanking20` | 3258–3294 (37) |
| `runRankingFull` | 3394–3434 (41) |
| `loadScreener2`, `rebuildScreener` | 3515–3564 (50) |
| Superseded universe constants + their wiring | 32 |
| **Estimated total** | **~272 of 3,888 lines (7.0%)** |
| **Actually removed in PR-2** | **315 lines** |

The estimate was conservative: it excluded the superseded `rebuildRanking*` / `upgradeRanking`
IIFEs and `mountRanking`'s stale placeholder markup, which came out too.

This matters for sequencing: **porting dead code into new modules would triple the work of
EPIC-1 for zero behavioural gain.** Deletion should come first, as its own reviewable PR.

### 2.2 The render order is four reassignments plus two timers

```
renderDetailCore                       (base: price hero, ranges, charts, technicals)
  ← wrapped at L2212  → renderDeepAnalysis()                immediate
  ← wrapped at L2763  → renderOptions(), renderFactors()    setTimeout 400ms
  ← wrapped at L2919  → renderSnapshot()                    setTimeout 200ms
```

So the visible order is: core → deep analysis → *snapshot at 200ms* → *options + factors at
400ms*. The snapshot renders **third in code and second on screen**, purely because 200 < 400.
That ordering is an accident of the delays, not a decision — and it is the single riskiest
thing to change, because it is what the eye has been calibrated against.

Also in the file: **14 empty `catch(e){}` blocks**, which the scaffold's ESLint config bans
outright (`'no-empty': { allowEmptyCatch: false }` — the comment there says empty catches
hide the upstream failures this app must not hide). They cannot survive the move into
`src/**/*.js` untouched. See §7, open question 4.

---

## 3. Proposed module boundaries

Every named function in `docs/04` §2.5 is assigned exactly one home. Nothing is left unplaced.

### `src/data/` — everything that touches the network

| Module | Contents |
|---|---|
| `proxy.js` | `WORKER_URL`, `PROXIES`, `fetchJsonThroughProxy`, `fetchTextThroughProxy`, `withTimeout`, `sleep`, `runPool` |
| `yahoo.js` | `fetchQuote`, `fetchHistory`, `fetchFundamentals`, `fetchAnnuals`, `fetchCatalysts`, `val`, `historyCache`, **`resolvePrevClose`** |
| `nse.js` | `fetchOptionChain`, `fetchIpos` |
| `news.js` | `fetchNews` |
| `universes.js` | `INDICES`, `NIFTY_SYMBOL`, `STOCK_DIRECTORY`, `PEER_GROUPS`, `UNIV_LARGE`, `UNIV_MID`, `FACTOR_LARGE`, `FACTOR_SMALL`, `COUNTS` |

`resolvePrevClose` is **new** — the 1D%/1Y% fix (`closes[len-2]` plus the 25% plausibility
guard) is currently inline inside `fetchScreenerRow2`, which is why `docs/10` §10.3 has to
describe it rather than test it. Lifting it into a named pure function is what makes that
regression case directly assertable.

`universes.js` is one module, not five. The five near-duplicate arrays collapse into
`UNIV_LARGE` / `UNIV_MID`, with the factor subsets derived as slices.

### `src/indicators/` — pure, no DOM

| Module | Contents |
|---|---|
| `trend.js` | `smaSeries`, `emaSeries`, `macdLast`, `macdSeriesFull`, `obvTrend` |
| `momentum.js` | `rsiLast`, `rsiSeriesFull`, `stochasticLast`, `cagrPct` |
| `volatility.js` | `bollingerLast`, `bollingerSeriesFull`, `atrLast`, `annualizedVolPct`, `maxDrawdownPct`, `sharpeStyleApprox`, `betaAndCorrelation`, `dailyReturnsByDate` |
| `patterns.js` | `detectPatterns`, `priceAction`, `pivotPoints` |
| `intraday.js` | `openingRange`, `vwapSeries`, `gapPct`, `relativeVolume` |

### `src/valuation/`, `src/options/`, `src/models/` — pure

| Module | Contents |
|---|---|
| `valuation/dcf.js` | `computeDcf` |
| `valuation/reverse-dcf.js` | `reverseDcf` |
| `valuation/earnings-quality.js` | `earningsQuality` |
| `models/normal.js` | `nCdf` — **moved here from `options/`**: `models/gbm.js` needs it too, and models importing from options is the wrong direction |
| `options/chain.js` | `analyseOptions` (keeps `probITM` and `ivNear` as closures — they capture spot, rate and time, so lifting them would change signatures for no gain) |
| `models/ols.js` | `olsMulti` — **one definition only** (story E5-5) |
| `models/gbm.js` | `gbmProbUp` |
| ~~`models/factors.js`~~ `buildFactors` | **deferred to PR-7** — it calls `fetchHistory`, so it is an orchestrator, not a model. Putting it under the coverage gate would mean mocking the network to satisfy a threshold. |
| ~~`models/scoring.js`~~ `scoreStock20` | **deferred to PR-7** — same reason; it fetches per ticker. |

These four directories are exactly what `vitest.config.js` points its 80% coverage gate at.
They are also the only modules that must import nothing from `ui/`.

EPIC-5 later adds `models/garch.js`, `hmm.js`, `logistic.js`, `dcf-monte-carlo.js`,
`ensemble.js` from `probability-lab.NOT-DEPLOYED.js`.

### `src/ui/` — rendering

| Module | Contents |
|---|---|
| `format.js` | `fmtNum`, `fmtCr`, `fmtPct`, `fmtDate`, `ageLabel`, `istParts`, `updateClock` |
| `charts.js` | `drawChart`, `drawSubplot`, `drawVolumeSubplot`, `drawRsiSubplot`, `drawMacdSubplot`, `RANGE_DAYS` |
| `detail.js` | `renderDetailCore` + the `DETAIL_BLOCKS` pipeline (§4) |
| `snapshot.js` | `renderSnapshot`, `buildSnapTable` |
| `deep-analysis.js` | `renderDeepAnalysis` |
| `thesis.js` | `renderThesis` |
| `options-block.js` | `renderOptions` |
| `factors-block.js` | `renderFactors` |
| `fundamentals.js` | `renderFundamentals`, `renderFundamentalsUnavailable` |
| `intraday-desk.js` | `renderIntradayDesk`, `renderIntradayVWAP` |
| `peers.js` | `renderPeers`, `peersFor` |
| `news-block.js` | `renderNews`, `renderNewsUnavailable` |
| `tables/screener.js` | `fetchScreenerRow2`, `screenerRow2Html`, `loadScreener3`, `countSelectHtml` |
| `tables/ranking.js` | `runRanking3`, `renderRankRows` |
| `ipo.js` | `loadIpos`, `showIpoDetail`, `renderIpoExtras`, `ipoStatus`, `parseBand`, `parseIpoDate`, `ipoSearchLinks` |
| `glossary.js` | `GLOSSARY`, `glossaryLookup`, `annotateGlossary`, `showGloss`, `hideGloss`, `injectGlossaryStyles` |
| `watchlist.js` | `renderIndices`, `renderWatchlist`, `renderTicker`, `addSymbolToWatchlist`, `wireSearch` |
| `errors.js` | `showError`, `clearError` |
| `mobile.js` | `mobileLayer` |

### Shell

| File | Contents |
|---|---|
| `src/app.js` | bootstrap, `refreshAll`, `loadStockDetail`, `setAutoRefresh`, all top-level wiring, the caches (`historyCache`, `scrCache`, `rankCache`, `factorCache`) |
| `src/styles.css` | the 314-line inline `<style>` block, verbatim |
| `src/index.html` | markup shell only — 9 lines of head, 126 lines of body, one `<script type="module">` |

`vite-plugin-singlefile` re-inlines the CSS and JS at build time, so the deployed artefact
stays one file. Nothing about the GitHub Pages deploy changes.

---

## 4. Replacing wrap-by-reassignment (story E1-7)

The four wraps and two timers become one declarative list:

```js
// src/ui/detail.js
export const DETAIL_BLOCKS = [
  { id: 'core',          render: renderDetailCore },
  { id: 'deep-analysis', render: renderDeepAnalysis },
  { id: 'snapshot',      render: renderSnapshot },       // was setTimeout 200
  { id: 'options',       render: renderOptions },        // was setTimeout 400
  { id: 'factors',       render: renderFactors }         // was setTimeout 400
];

export async function renderDetail(ctx) {
  for (const block of DETAIL_BLOCKS) {
    try {
      await block.render(ctx);
    } catch (err) {
      renderBlockError(block.id, err);   // EPIC-4 E4-2 lands naturally here
    }
    await nextFrame();                   // yield to paint, as the timers did
  }
}
```

Three things this buys, in priority order:

1. **Order becomes readable.** The list above is the on-screen order, stated once. Today you
   recover it by reading three reassignments and comparing two timer values.
2. **Per-block error boundaries get a home.** EPIC-4 story E4-2 ("one dead feed never blanks
   the page") is a four-line change against this loop and a rewrite against the wrap chain.
3. **`ctx` is explicit.** Each wrap currently recomputes `price` from `hist.meta` with the
   identical five-line fallback. That becomes one `ctx` built once.

### What actually shipped, and why it differs from the sketch above

**The `await` in the sketch was wrong and was dropped.** Awaiting each block in a loop would
have serialised four independent network round trips that today run concurrently — nothing in
the wrap chain was ever awaited. The panel would have got materially slower while every
rendered number stayed identical, so no snapshot would have caught it. The shipped `runBlocks`
starts each block and drops the promise, exactly as before, and
`tests/unit/detail-pipeline.test.js` has a test whose only job is to fail if someone adds the
await back.

**The delays are kept, and §2.2's explanation of them was wrong.** That section said the
snapshot renders second on screen "purely because 200 < 400". It does not. Every block appends
its placeholder *synchronously, before its first await*, so DOM position is fixed by the order
blocks are entered, not by how long their fetches take — and the snapshot does not append at
all: it inserts itself before `.chart-block`, so it sits above the chart whatever its delay.
**The delays control when blocks appear, not where.** Anyone retuning them should know that.

**Error boundaries were deliberately not added.** `runBlock` is the single point they belong
at, and it exists now, but wrapping it in try/catch changes the failure path: `deep-analysis`
throwing currently propagates to `loadStockDetail`, and timer-block exceptions currently
surface as uncaught errors. That is EPIC-4 story E4-2, with its own review.

The one behavioural difference is arithmetic count, not result: each of the three wraps
recomputed `price` with the same five-line fallback, and `detailContext` now computes it once.

---

## 5. Sequencing — one reviewable PR per step

| PR | Scope | Risk | Proof |
|---|---|---|---|
| 0 | Scaffolding | none | `npm run verify` green — **done** |
| 1 | Golden fixtures + parity baseline | none | 31 fixtures, 63 tests, 33 snapshots — **done** |
| 2 | **Delete the dead generations** (§2.1) | low | 315 lines gone, every snapshot unchanged — **done** |
| 3 | Extract `styles.css` | low | built output differs only at the `<style>` tag boundary — **done** |
| 4 | Extract `data/` + script to `app.js` | medium | 94 tests, snapshots unchanged — **done** |
| 5 | Extract `indicators/` + `docs/10` §10.2 unit tests | low | 149 tests; coverage gate live at 100%/88.95% — **done** |
| 6 | Extract `valuation/`, `options/`, `models/` + §10.2 tests | low | 197 tests; 100% stmt/fn/line on all four gated dirs — **done** |
| 7 | Extract `ui/` | medium | 37 modules, 197 tests, snapshots unchanged — **done** |
| 8 | `DETAIL_BLOCKS` pipeline (§4) | **high** | 20 new tests incl. real-DOM order; verified to fail on a deliberate reorder — **done** |
| 9 | `app.js` bootstrap; delete the IIFE | medium | 217 tests green; start-up order now explicit — **done** |

PR-1 before PR-2 is not optional. `docs/18` says it outright: without golden fixtures the
refactor has no safety net and parity cannot be proven. Deleting code — even unreachable
code — is the first thing that can be wrong.

---

## 5a. What the harness covers today

81 tests across 4 files, all offline against 31 committed fixtures (5 stocks + `^NSEI` +
a live NSE option chain + a Bing RSS feed). Regenerate with `node scripts/capture-fixtures.mjs`.

| File | Tests | What it holds down |
|---|---|---|
| `tests/regression/golden-output.test.js` | 33 | Every pure function's output on every fixture, snapshotted. The parity gate. |
| `tests/regression/prev-close.test.js` | 24 | The 1D%/1Y% bug, including a test that reproduces the original fallback and proves it *would* have been caught |
| `tests/unit/boot.test.js` | 18 | The page builds its shell with the network dead, and the surviving generation is the one that renders |
| `tests/regression/universes.test.js` | 6 | No duplicate, overlapping or known-dead tickers |

Two things worth knowing about the harness:

- `tests/helpers/monolith.js` slices named functions out of `src/index.html` and evaluates
  only those. The IIFE's top level queries the DOM and starts fetching, so it cannot be
  imported wholesale. This helper is deleted at PR-6, when the tests import real modules.
- `tests/unit/boot.test.js` evaluates the script explicitly rather than letting happy-dom
  run it — happy-dom does not execute scripts that arrive via `document.write`, and relying
  on it to would have left the test silently asserting nothing.

## 6. How parity is proven

| Gate | Mechanism |
|---|---|
| Numerical | Every pure function runs against the same fixture pre- and post-extraction; outputs compared to 10 decimal places |
| Visual | Playwright screenshots, 5 stocks × desktop + mobile, each detail block captured separately so a diff names the block |
| Network | Request log per page load compared before/after — same URLs, same count, same `runPool` concurrency (5–6; `docs/04` §2.6 caps it at 8) |
| Size | CI guard already fails over 400 KB; deleting dead code should take the build *down* from 263 KB |
| Product | `scripts/check-invariants.sh` on every PR — ADR-003 and ADR-009 |

---

## 7. Open questions — I need answers on these before PR-2

**1. ~~Dead-code deletion.~~ Approved and done.** 315 lines removed; `dist/index.html` went
263,813 → 239,280 bytes (−9.3%). All 33 golden snapshots unchanged.

One thing the deletion nearly got wrong, recorded because it will matter again in PR-7:
`mountRanking` looked dead, but it is the only code that *creates* `<section id="rankSection">`
— every later generation merely calls `sec.innerHTML = ...` on it and returns early if it is
absent. Deleting it outright would have made the entire ranking feature vanish with no error.
It was kept and reduced to creating the element; its stale placeholder markup (which claimed
"NSE's option-chain API returns nothing to this proxy", untrue since the cookie handshake
landed) is gone, since `rebuildRanking3` overwrites it synchronously and no user ever saw it.

`tests/unit/boot.test.js` now guards exactly this: it evaluates the real script against the
real markup and asserts `#rankSection` exists and carries the generation-4 row-count
selectors. The golden suite could not have caught it — every function in it is pure.

**2. ~~Git.~~ Resolved.** `github.com/sanjeevyadav-blip/dalal-street-live` is cloned; its 20
commits and the `origin` remote are attached to this directory. `git log -1` is `d56d1da`
(2026-09-20 02:42 IST). All three deployed files — `index.html`, `manifest.json`, `sw.js` —
match the staged `src/` copies byte for byte once line endings are normalised. **Nothing has
been committed or pushed.** `git status` shows the three root files as deleted and everything
else as untracked; that is the `src/` layout move, which lands in PR-3.

One trap found while confirming this: `core.autocrlf` is `true` globally on this machine, so
the checkout rewrote the working tree to CRLF and `index.html` grew 263,813 → 267,700 bytes
(one byte per line, 3,887 lines). That alone would break the byte-for-byte parity gate in §6.
Pinned via a new `.gitattributes` (`* text=auto eol=lf`) plus `core.autocrlf=false` for this
repo, so the fix holds regardless of who clones it next.

**3. The render delays (§4).** Confirm replacing `setTimeout(200/400)` with awaited,
frame-yielded sequencing is acceptable, given that it changes snapshot/options ordering from
"whichever timer fires first" to "the order in the list". I recommend yes, with the order
preserved exactly as it renders today.

**4. ~~The empty `catch(e){}` blocks.~~ Resolved, deliberately taking the smaller half.**
Moving the script into `src/app.js` put it under ESLint for the first time and turned up 52
errors: 12 empty catches, 23 catch bindings nobody read, 14 missing browser globals (a config
gap, fixed in `eslint.config.js`) and 3 genuine findings.

Every empty catch now calls a named `suppressed(context, err)` that warns to the console with
a label — `'options: chain fetch'`, `'factors: build'`, `'snapshot: dcf row'`. **Nothing about
what the page renders changed**, which is what keeps the golden snapshots meaningful. Option
(b) — rendering a "not measurable" state per block — is the right end state but it is a
behavioural change, and it does not belong inside a PR whose job is to prove nothing moved.
It is EPIC-4 story E4-2, with its own review.

The three genuine findings were removed: `sleep` (unused; EPIC-4 story E4-3 can re-add it for
retry backoff), `callDelta` (a dead sibling of `probITM` inside `analyseOptions` — also struck
from the `options/black-scholes.js` plan above), and one `let` that is never reassigned.

**5. ~~The CI coverage gate.~~ Resolved — and it was not what I said it was.** I expected it
to be red until PR-5/6. It is worse than red: it is **inert**. Vitest skips threshold checking
entirely when no file matches the `include` globs, so `npm run test:coverage` reports 0% and
exits 0. A gate that reports success without measuring anything is the failure mode this whole
project exists to avoid, so it is now documented in `vitest.config.js` rather than left to be
rediscovered. The ratchet behaviour is right — the thresholds start biting the moment the first
pure module lands in PR-5 — but "green" there currently means "nothing was measured".

The same class of problem was found in `tests/unit/build-output.test.js`, which skips itself
when `dist/` is absent. `npm run verify` and `.github/workflows/ci.yml` were reordered to
build *before* testing so it always has an artefact to check.

---

## 8. Not in scope

No new analysis blocks, no new data sources, no UI changes. `docs/18` lists scope creep from
new analysis ideas as a delivery risk; EPIC-1 changes structure only. The
`probability-lab.NOT-DEPLOYED.js` port is EPIC-5 and waits for the module tree to exist.


---

## 9. What PR-9 surfaced

Making the start-up sequence explicit exposed a bug the IIFE ordering had hidden.

`mountGlossary()` reads `GLOSSARY` **once** to build the Glossary section. Three groups of
`GLOSSARY[...]` assignments — thirteen terms covering the probability columns, the screener
columns and the row-count selector — sat *between* the later mount IIFEs, so they ran after
the section had already been built. Those thirteen terms work as tooltips and are missing
from the Glossary list.

`bootstrap()` preserves that order exactly and names it, so the bug is now visible in one
place instead of spread across four hundred lines. The fix is to move `mountGlossary()` to
the end of `bootstrap()`. That is a behavioural change and belongs in its own commit.

The other load-bearing dependency, already known from PR-2: `mountRanking()` creates
`<section id="rankSection">` and `rebuildRanking3()` only fills it, returning early if it is
absent. `tests/unit/boot.test.js` guards it.

## 10. Where EPIC-1 ends and what is next

Done: EPIC-1 in full, and EPIC-2 stories E2-1 through E2-5 (fixtures, unit tests for
indicators/valuation/options/models, the shipped-bug regression suite, the CI invariant
check).

Outstanding, in the order `engineering/18-DELIVERY-PLAN.md` puts them:

| Story | What it needs |
|---|---|
| E2-6 | Playwright E2E, the ten flows in `docs/10` §10.5. `playwright.config.js` is already in place; needs `npx playwright install chromium`. |
| E2-7 | Coverage gate is live and passing at 100% stmt/fn/line. Extend `include` to `src/ui/**` if UI coverage is wanted. |
| E3-1..E3-6 | CI/CD. The workflows exist in `.github/`; none has ever run, because nothing has been pushed. |
| E4-1..E4-5 | Reliability. E4-2 (per-block error boundaries) has its seam ready at `runBlock` in `ui/detail.js`. |
| E5-1..E5-5 | The probability lab. `src/probability-lab.NOT-DEPLOYED.js` is unported; note E5-5, the duplicate `olsMulti`. |
| E6-1..E6-5 | Capacitor. |
