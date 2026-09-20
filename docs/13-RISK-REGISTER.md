# 13. Risk Register

Probability × Impact → Severity. Owner is the single maintainer throughout.

| ID | Risk | Prob | Impact | Sev | Mitigation | Status |
|---|---|---|---|---|---|---|
| R-1 | Yahoo blocks the crumb flow permanently | Med | High | **High** | Blocks fail independently; broker-API migration path documented (doc 12 §12.5) | Open, monitored |
| R-2 | NSE tightens Akamai further, killing the option chain | Med | Med | Med | Options block degrades alone; broker API is the fallback | Open, monitored |
| R-3 | User treats model output as advice and loses money | Med | High | **High** | No verdict, no targets; caveats beside every number; manual + disclaimer; SEBI note | Mitigated by design |
| R-4 | A wrong number displays confidently (silent bug) | Med | High | **High** | Already occurred (1D = 1Y). Test suite is the fix — doc 10 | **Open — top priority** |
| R-5 | Monolithic `index.html` becomes unmaintainable | High | Med | **High** | Refactor to modules is P0 — doc 15 | Open |
| R-6 | Ticker universe rots silently | High | Low | Med | Documented replacements; startup validation planned | Partially mitigated |
| R-7 | Deploy appears to succeed but Pages never rebuilds | Med | Med | Med | Verified via `/actions/runs` in the checklist | Mitigated by process |
| R-8 | Stale CDN misleads verification, reverting a good deploy | Med | High | **High** | Never verify against `raw.githubusercontent.com`; use Contents API | Mitigated by process |
| R-9 | Worker abused as an open relay | Low | Med | Low | Host allowlist, HTTPS-only, GET-only | Mitigated |
| R-10 | Free-tier terms change | Low | Med | Low | Both providers have stable free tiers; cost would remain small | Accepted |
| R-11 | Regulatory attention over published analysis | Low | High | Med | No recommendations or targets published; SEBI position documented in doc 08 | Mitigated by design |
| R-12 | Single maintainer unavailable | Med | Med | Med | This document set exists precisely for that | Mitigated |
| R-13 | Transfer/corruption during deploy | Med | High | Med | Checksum + length verification before every commit; parse-check before upload | Mitigated by process |
| R-14 | Assumptions (7% RF, 6% ERP) drift from reality | Med | Med | Med | Labelled as assumptions in-product; quarterly review | Mitigated |
| R-15 | Over-reliance on backward-looking models | High | Med | Med | Every model states its failure mode; probabilities cluster near 50% honestly | Mitigated by design |

## Top three to act on

1. **R-4 — silent wrong numbers.** The one that has actually bitten. Tests, doc 10.
2. **R-5 — monolith.** Every further feature raises the cost of the eventual refactor.
3. **R-1 — Yahoo dependency.** Not urgent, but the broker-API migration is the durable fix.

## Risks explicitly accepted

- No alerting; breakage is discovered on use.
- Single environment (production only).
- Unofficial APIs with no contract or uptime guarantee.
- No user accounts, so watchlists reset on reload.
