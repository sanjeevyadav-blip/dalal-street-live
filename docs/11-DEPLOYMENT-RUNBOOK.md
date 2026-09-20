# 5. Deployment & Operations Runbook

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
