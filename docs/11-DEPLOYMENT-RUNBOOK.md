# 5. Deployment & Operations Runbook

## 5.0 Worker deploy — the current procedure

The Worker in `worker/worker.js` is **ahead of what is deployed**: it carries the EPIC-4
E4-5 per-IP rate limit and structured logs, and the live Worker does not. Shipping it is a
deliberate, explicit-approval action.

**Deploying requires `wrangler login` first.** It is an interactive browser OAuth flow and
cannot be run from an automated session, so the owner has to do it.

```
cd worker
npx wrangler login                 # interactive, once
npx wrangler dev --local --port 8787       # terminal 1: run the NEW Worker locally
npm run worker:preflight:local             # terminal 2: gate it against real upstreams
npx wrangler deploy                        # only if the gate passed 10/10
npm run worker:preflight                   # confirm what actually shipped
```

### Why the preflight matters more than the unit tests here

`tests/unit/worker.test.js` covers only the paths that return BEFORE any upstream fetch:
the method guard, the rate limiter, the allowlist, the URL validation. That is where every
security decision is made, but it is not where a deploy is most likely to break something.

The risk is the proxy path — the Yahoo cookie+crumb handshake and the NSE two-step session
handshake. Neither can be unit tested without hitting the real internet from the offline
suite. `scripts/worker-preflight.mjs` checks them against a running Worker instead, which
is why it is run against `wrangler dev` BEFORE the deploy: it exercises the new code against
the real Yahoo and NSE without putting it in front of anyone.

As of the last run, the new Worker passes 10/10 locally and the live Worker fails the two
E4-5 checks — which is the expected difference and confirms the gate discriminates.

### Rollback

```
cd worker
npx wrangler rollback              # reverts to the previous deployed version
npm run worker:preflight           # confirm the revert
```

If the crumb or NSE checks fail after a deploy, roll back first and diagnose afterwards —
those two failing takes fundamentals, the DCF, the factor block and the option chain down
together.

## 5.1 Accounts

| Thing | Value |
|---|---|
| GitHub repo | `sanjeevyadav-blip/dalal-street-live` (public, branch `main`) |
| GitHub Pages | Deploy from branch `main`, folder `/` (root) |
| Live URL | https://sanjeevyadav-blip.github.io/dalal-street-live/ |
| Cloudflare account ID | `72c873a84fcd130082ce94b1fca2a6a3` |
| Worker | `dalal-proxy` → `https://dalal-proxy.sanjeev-yadav.workers.dev` |
| Cost | ₹0. Pages free; Workers free tier 100k req/day (typical use <500) |

## 5.2 Deploying the site (from Claude Code — use git)

```bash
git clone https://github.com/sanjeevyadav-blip/dalal-street-live.git
cd dalal-street-live
# edit
git add -A && git commit -m "..." && git push
```

## 5.3 Deploying the Worker

```bash
cd worker
npx wrangler login
npx wrangler deploy
```
(The original deploys were done by POSTing to Cloudflare's dashboard API from a logged-in
browser tab, because no CLI was available. Wrangler is strictly better — use it.)

## 5.4 Two traps that cost real time. Read before trusting a deploy.

### Trap 1 — `raw.githubusercontent.com` serves stale content
It is CDN-cached for minutes after a commit. Verifying a deploy against it once returned the
*previous* version and nearly caused a good deploy to be reverted.

**Verify with the Contents API instead:**
```bash
curl -s "https://api.github.com/repos/sanjeevyadav-blip/dalal-street-live/contents/index.html?ref=main" | jq .size
```

### Trap 2 — a successful commit does not guarantee a Pages rebuild
GitHub once returned its "Unicorn" timeout page. The commit landed, but the build webhook
never fired, and the live site silently served the old file for 20 minutes.

**Always check the workflow after deploying:**
```bash
curl -s "https://api.github.com/repos/sanjeevyadav-blip/dalal-street-live/actions/runs?per_page=1" \
  | jq '.workflow_runs[0] | {status, conclusion, created_at}'
```
If no run appeared for your commit, push a trivial follow-up commit to force one.

## 5.5 Post-deploy checklist

```
[ ] Contents API size matches what you pushed
[ ] A new Actions run exists, status=completed conclusion=success
[ ] Live page loads with cache-buster: ?v=<timestamp>
[ ] Indices show prices (proxy + Yahoo alive)
[ ] Open a stock: snapshot, chart, DCF, options all render
[ ] Console free of page errors (extension noise is fine)
[ ] Mobile: DevTools device mode, check bottom nav + table scroll
```

## 5.6 Health checks

```bash
W=https://dalal-proxy.sanjeev-yadav.workers.dev/?url=

# price feed
curl -s "$W$(python3 -c "import urllib.parse;print(urllib.parse.quote('https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=5d'))")" | head -c 120

# crumb-gated fundamentals — should NOT return 401
curl -s "$W$(python3 -c "import urllib.parse;print(urllib.parse.quote('https://query2.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS?modules=summaryDetail'))")" | head -c 120

# NSE session — should NOT return {}
curl -s "$W$(python3 -c "import urllib.parse;print(urllib.parse.quote('https://www.nseindia.com/api/option-chain-contract-info?symbol=RELIANCE'))")" | head -c 120
```

## 5.7 Failure playbook

| Symptom | Likely cause | Fix |
|---|---|---|
| All prices blank | Worker down or Yahoo blocking | Hit health checks; `wrangler tail` |
| Fundamentals show "unavailable" | Crumb expired / rejected | Worker auto-retries once; check `getYahoo()` |
| Options show "no contracts" on an F&O name | NSE session stale | 10-min cache; retry. Verify contract-info first |
| Option chain returns `{}` | Wrong endpoint | Must be `option-chain-v3` **with** explicit `expiry` |
| News empty | Bing RSS shape changed | Check `<item>` parsing |
| One screener row fails | Dead ticker | See doc 3 §3.4 |
| Site shows old version | Pages did not rebuild | See Trap 2 |
| 1D% equals 1Y% | `previousClose` regression | See doc 3 §3.1 trap |

## 5.8 Rollback

```bash
git log --oneline -10
git revert <sha> && git push      # preferred, keeps history
```
Then confirm a new Actions run fired.
