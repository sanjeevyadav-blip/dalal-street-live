# 09. Development Process (SDLC)

Lightweight process for a one-developer-plus-AI project. Scales to a small team.

## 9.1 Lifecycle

```
Idea → BRD/PRD entry → SRS requirement with acceptance criteria
     → design (ADR if architectural) → implement → test → review
     → deploy → verify → changelog
```

## 9.2 Branching

```
main            always deployable; GitHub Pages builds from here
feature/<name>  new work
fix/<name>      bug fixes
chore/<name>    tooling, docs, dependencies
```
Short-lived branches, squash-merge into `main`.

## 9.3 Commits — Conventional Commits

```
feat(options): add max pain and IV skew
fix(screener): use closes[len-2] for previous close, 1D no longer equals 1Y
docs(api): record option-chain-equities as a dead end
refactor(charts): extract canvas helpers
test(indicators): add Wilder RSI reference case
chore(worker): move deploy to wrangler
```
The body should say **why**, not what — the diff already says what.

## 9.4 Definition of Ready

A task may start when it has: a requirement ID, acceptance criteria, a named data source
(with evidence it works), and a rollback path.

## 9.5 Definition of Done

```
[ ] Acceptance criteria in doc 03 all met
[ ] Unit tests for new pure functions
[ ] Regression test if this fixes a bug
[ ] `node --check` / build passes
[ ] Deployed and verified live (doc 11 checklist)
[ ] Pages rebuild confirmed via /actions/runs
[ ] Docs updated if behaviour, API or architecture changed
[ ] Changelog entry added
[ ] No new fabricated values; missing data still renders as —
```

## 9.6 Code review checklist

**Correctness** — units (see doc 05 §5.2: fractions vs percent is the recurring trap);
insufficient-data paths return `—` not a partial result; no silent `catch {}` that hides a
real failure.
**Honesty** — every new number has a source label and a stated failure mode; no new
recommendation-shaped output; caveats are next to the number, not buried.
**Performance** — fetches go through `runPool` (5–6 concurrency), never a sequential loop;
cached data is re-sliced rather than re-fetched.
**Security** — doc 08 §8.8.

## 9.7 Testing gates

| Stage | Gate |
|---|---|
| Pre-commit | `node --check`, lint |
| Pre-merge | Unit + regression suites green |
| Post-deploy | Smoke checks from doc 11 §5.5 |
| Weekly | Integration checks against live APIs (they change without notice) |

## 9.8 Release

1. Merge to `main` → Pages builds automatically.
2. **Verify the build actually ran** — a commit does not guarantee it (doc 11, Trap 2).
3. Hard-refresh the live URL with a cache-buster.
4. Run the smoke checklist.
5. Add a changelog entry.

Rollback: `git revert <sha> && git push`, then confirm a new build ran.

## 9.9 Environments

There is only production. For a project this size that is a reasonable trade, but it means
**local verification before push is the only safety net**:

```bash
cd src && python3 -m http.server 8000     # → http://localhost:8000
```
A staging branch with a second Pages site is the natural next step if a second person joins.

## 9.10 Working with AI on this codebase

- Point it at `CLAUDE.md` first — it encodes the hard rules and the traps.
- Ask for the plan before the diff on anything architectural.
- Never accept a generated number without asking where the data came from.
- When the AI says a data source is impossible, ask it to show the failing response. That
  claim has been wrong here before: the NSE option chain was called impossible and worked
  once the cookie handshake and correct endpoint were found.
