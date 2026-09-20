# 20. CI/CD Pipeline

> **Superseded — kept as a record of intent.** The owner does not use GitHub, so the
> `.github/workflows/` files this document describes were deleted. Nothing runs on push and
> there is no pipeline to watch.
>
> What replaced it is local and manual, which for a one-person project is the same set of
> gates without the machinery:
>
> | This document's gate | What actually runs it now |
> |---|---|
> | lint / invariants / build / unit | `npm run verify` |
> | E2E | `npm run test:e2e` (or `npm run verify:full` for both) |
> | bundle-size guard (400 KB) | an assertion in `tests/unit/build-output.test.js` |
> | deploy smoke test | assertions in `tests/unit/build-output.test.js` |
> | weekly upstream health check | `npm run test:integration`, run by hand |
>
> Read the rest for the reasoning behind each gate; ignore the YAML.

The workflow files described below no longer exist in the repo. Recover them from git history
(`git show 1ffa52e:.github/workflows/ci.yml`) if GitHub ever becomes part of the setup.

## Pipeline overview

```
PR opened ─► ci.yml       lint → unit → build → E2E → invariants
                          (all must pass before merge)

merge main ─► deploy.yml  build → deploy Pages → VERIFY REBUILD → smoke test
                          (fails loudly if Pages did not rebuild)

daily 09:00 ─► healthcheck.yml   probe every upstream API
                                 (failure emails the team)

tag v* ─► release.yml     changelog → GitHub release → optional store build
```

## Environments

| Env | Branch | URL | Purpose |
|---|---|---|---|
| Production | `main` | sanjeevyadav-blip.github.io/dalal-street-live/ | Live |
| Staging | `staging` | second Pages site | Verify before prod |
| Local | any | localhost:5173 | Development |

Worker environments via `wrangler.toml`:
```toml
[env.staging]
name = "dalal-proxy-staging"
[env.production]
name = "dalal-proxy"
```

## Required secrets (GitHub → Settings → Secrets)

| Secret | Used by | Note |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | deploy Worker | Scope: Workers Scripts:Edit only |
| `CLOUDFLARE_ACCOUNT_ID` | deploy Worker | `72c873a84fcd130082ce94b1fca2a6a3` |
| `ANDROID_KEYSTORE_B64` | release (P2) | Base64 keystore |
| `ANDROID_KEYSTORE_PASSWORD` | release (P2) | |

There are currently **no application secrets** — every data endpoint is public. If a broker
API is added later, its key goes in Worker secrets (`wrangler secret put`), never in the
client bundle, which is public.

## Quality gates

| Gate | Threshold | Blocks merge |
|---|---|---|
| ESLint | 0 errors | Yes |
| Unit tests | 100% pass | Yes |
| Coverage — `indicators/`, `valuation/`, `models/` | ≥ 80% | Yes |
| Build | succeeds | Yes |
| E2E | 100% pass | Yes |
| Product invariants | 0 violations | Yes |
| Bundle size | < 400 KB | Warns |

## The invariant gate — the unusual one

A grep-based check that fails the build if the product's non-negotiables are violated:

```bash
# no recommendation output
grep -rnE "(BUY|SELL|HOLD|AVOID)\s*(recommendation|verdict|signal)" src/ && exit 1

# no target price generation
grep -rn "targetPrice\s*=" src/ && exit 1

# no fabricated fallback values
grep -rnE "\|\|\s*0\s*;.*(price|value|ratio)" src/ && exit 1
```

This exists because these constraints have legal (SEBI) and epistemic reasons behind them,
and are exactly the sort of thing a well-meaning contributor or AI assistant would
"improve" by adding. See `docs/14-ADR.md` ADR-003.

## Deploy verification — mandatory

Two failures already occurred in this project:

1. **Stale CDN.** `raw.githubusercontent.com` served old content for minutes after a commit,
   which nearly caused a good deploy to be reverted. Verify via the Contents API.
2. **Silent missing rebuild.** GitHub returned a timeout page; the commit landed but the
   Pages webhook never fired, and the old file was served for 20 minutes while everything
   looked green.

`deploy.yml` therefore polls `/actions/runs` after deploying and **fails the job** if no new
run appeared for that SHA.

## Rollback

```bash
git revert <sha> && git push          # preferred; keeps history
# then confirm a new Pages run fired
```
Worker: `npx wrangler rollback` or redeploy the previous commit.

## Metrics worth tracking

| Metric | Target |
|---|---|
| Lead time (commit → prod) | < 30 min |
| Deploy frequency | on demand |
| Change failure rate | < 10% |
| MTTR | < 1 hour (revert is one command) |
| CI duration | < 5 min |
