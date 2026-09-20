# Contributing

## Setup
```bash
npm install && npm run dev      # → http://localhost:5173
npm run verify                  # lint + tests + invariants + build
```

## Before your first PR
Read `CLAUDE.md`, then `docs/09-SDLC-PROCESS.md` §9.6 and `docs/08-SECURITY-COMPLIANCE.md` §8.8.

## Branch and commit
```
feature/<name> · fix/<name> · chore/<name>
feat(scope): what          fix(scope): what          docs(scope): what
```
Commit body explains **why**.

## The three rules that are not style preferences

1. **No recommendation output.** No BUY/SELL/HOLD/AVOID, no target prices, no "probability
   of reaching X by date Y". SEBI restricts published buy/sell calls to registered Research
   Analysts, and the DCF swings 40%+ across defensible assumptions so a derived verdict
   would overstate confidence. See `docs/14-ADR.md` ADR-003. CI enforces this.

2. **Never fabricate a value.** Missing data renders `—`. A plausible-looking guess is
   indistinguishable from real data on screen, and someone will act on it. ADR-009.

3. **Every number states its source and failure mode.** That is the product.

## Definition of done
`docs/09-SDLC-PROCESS.md` §9.5.

## Adding a data source
1. Test the endpoint live and paste the response into the issue.
2. Check it is not already on the dead-ends list (`docs/06` §3.2).
3. Add the host — and only that host — to `ALLOWED_HOSTS` in `worker/worker.js`.
4. Add an integration check to `healthcheck.yml`.
5. Document it in `docs/06`.

## Fixing a bug
Every bug fix ships with a regression test (`docs/10` §10.3) and a changelog entry.
This is how the 1D%=1Y% class of failure stops recurring.
