# 19. Team Onboarding & RACI

## Day 1 — get running in 15 minutes

```bash
git clone https://github.com/sanjeevyadav-blip/dalal-street-live.git
cd dalal-street-live
npm install
npm run dev          # → http://localhost:5173
npm test             # unit + regression
npm run test:e2e     # Playwright
npm run lint
```

**Then read, in this order:** `CLAUDE.md` → `docs/00-DOCUMENT-INDEX.md` →
`docs/02-PRD.md` (non-goals) → `docs/04-ARCHITECTURE.md` → `docs/14-ADR.md`.

**Before your first PR, read `docs/09-SDLC-PROCESS.md` §9.6 (review checklist) and
`docs/08-SECURITY-COMPLIANCE.md` §8.8.**

## First task suggestions by role

| Role | Good first task |
|---|---|
| Frontend | E2-2: unit tests for indicators — teaches the maths and the codebase at once |
| DevOps | E3-5: scheduled health check — small, isolated, immediately useful |
| Full-stack | E4-1: symbol validation — touches data layer, UI and error handling |

## The five things that will trip you up

1. **Units.** `growth` is 0.08 not 8. Yahoo's `dividendYield` is a fraction; `debtToEquity`
   is already a percent. NSE's `impliedVolatility` is a percent and must be ÷100 before
   Black-Scholes. See `docs/05-DATA-MODEL.md` §5.2.
2. **`raw.githubusercontent.com` is stale** for minutes after a commit. Verify with the
   Contents API.
3. **A commit does not guarantee a Pages rebuild.** Always check `/actions/runs`.
4. **`renderDetailCore` is wrapped four times** (pre-refactor). Render order depends on
   wrap order and `setTimeout` delays. Do not add a fifth wrap — extend the pipeline.
5. **Never fill a missing value.** `—` is correct. A plausible-looking fabricated number is
   the worst possible output for this product.

## RACI

**R** responsible · **A** accountable · **C** consulted · **I** informed

| Activity | Tech Lead | Mid FE | DevOps | PO | QA |
|---|---|---|---|---|---|
| Architecture decisions (ADR) | A/R | C | C | I | I |
| Module refactor | A | R | I | I | C |
| Feature implementation | C | A/R | I | C | C |
| Test suite | C | R | I | I | A |
| CI/CD pipeline | C | I | A/R | I | C |
| Cloudflare Worker | A | C | R | I | I |
| Data source changes | A/R | C | C | I | C |
| Release to production | C | I | R | A | C |
| Store submission | I | C | R | A | C |
| **Product non-negotiables** (no verdict, no targets, no fabricated data) | C | I | I | **A/R** | C |
| Risk register review | R | I | C | A | I |
| Incident response | A/R | C | R | I | I |

> The last-but-two row matters most. The constraints in `docs/14-ADR.md` ADR-003 and ADR-009
> are **product decisions with legal and epistemic reasoning**, owned by the PO. An engineer
> should not relax them to make a table look more complete, and an AI assistant should not
> "helpfully" add a verdict column.

## Communication

| Ceremony | Cadence | Purpose |
|---|---|---|
| Standup | Daily 15m | Blockers only |
| Sprint planning | Fortnightly | Pull from doc 18 backlog |
| Review + demo | Fortnightly | Demo against acceptance criteria in doc 03 |
| Retro | Fortnightly | Process changes land in doc 09 |
| Risk review | Monthly | Update doc 13 |
| API health review | Weekly | Integration results, doc 10 §10.4 |

## Escalation

| Severity | Example | Response | Owner |
|---|---|---|---|
| S1 | Site down, or wrong numbers displayed | Same day, roll back first | Tech Lead |
| S2 | One analysis block broken | Next working day | Mid FE |
| S3 | Dead ticker, cosmetic issue | Next sprint | Backlog |

**A wrong number is S1, not S2.** A blank block is honest; a confident wrong figure is worse
than an outage because the user acts on it.

## Knowledge continuity

- Every architectural decision → an ADR entry in `docs/14`.
- Every dead end found → `docs/06` §3.2, with the evidence.
- Every shipped bug → a regression test in `docs/10` §10.3 **and** a changelog entry.

That last rule is how this project stays maintainable by a small team plus AI assistants.
