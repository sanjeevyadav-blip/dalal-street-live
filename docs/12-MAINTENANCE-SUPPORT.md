# 12. Maintenance & Support

This app depends on **unofficial APIs that can change without notice**. Maintenance is not
optional; it is the main ongoing cost (in time, not money).

## 12.1 Routine schedule

| Cadence | Task |
|---|---|
| Weekly | Run the integration checks (doc 10 §10.4) — catches API drift early |
| Monthly | Validate every universe ticker still returns bars |
| Monthly | Check Cloudflare usage (should be far under 100k/day) |
| Quarterly | Review hardcoded assumptions: 7% risk-free, 6% ERP, 4% terminal growth |
| Quarterly | Re-check the "dead ends" list — some may have come back |
| On failure | Failure playbook, doc 11 §5.7 |

## 12.2 Monitoring

There is no alerting. For a personal tool that is a reasonable trade; the honest
consequence is **you find out it is broken when you open it**.

If you want alerting, the cheapest path is a scheduled GitHub Action:
```yaml
on:
  schedule: [{ cron: '30 3 * * *' }]     # 09:00 IST
jobs:
  healthcheck:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sf "$WORKER?url=$(...chart/RELIANCE.NS...)" | grep -q '"close"' \
            || { echo "price feed down"; exit 1; }
```
A failing run emails you automatically.

## 12.3 Symptoms → causes

| Symptom | First check |
|---|---|
| Everything blank | Worker up? `wrangler tail` |
| Prices work, fundamentals don't | Crumb handshake — expect 401 in logs |
| Options say "no contracts" on an F&O name | NSE session; verify contract-info first |
| One screener row fails | Dead ticker (doc 06 §3.4) |
| Numbers look wrong but load fine | **Units** — fraction vs percent (doc 05 §5.2) |
| Site shows old version after deploy | Pages didn't rebuild (doc 11, Trap 2) |
| Slow load | `runPool` concurrency, or upstream latency |

## 12.4 Known fragilities, ranked

1. **Yahoo crumb** — Yahoo has tightened this repeatedly. If it breaks permanently,
   fundamentals, DCF and earnings quality all go dark. Charts survive.
2. **NSE session** — Akamai protection changes; `quote-equity` is already 403.
   Options block would go dark; everything else survives.
3. **Ticker rot** — continuous, low severity, easily fixed.
4. **Bing RSS shape** — low risk, isolated to the news block.
5. **Free-tier policy change** — Cloudflare or GitHub could change terms.

Each block already fails independently with an explanatory message. Keep it that way:
**never let one dead feed blank the whole page.**

## 12.5 If a data source dies permanently

| Lost | Fallback |
|---|---|
| Yahoo prices | Broker API (Upstox, Angel One, Fyers, Dhan) — free with an account, officially supported |
| Yahoo fundamentals | Screener.in scrape, or a paid feed |
| NSE options | Broker API option chain |
| Bing news | Any RSS source; parser is already generic |

The broker-API route is the strategic answer: officially supported, real-time, and removes
the proxy entirely. It needs an account and an API key, which then must live in Worker
secrets — never in the client bundle.

## 12.6 Support model

Single maintainer, best-effort, no SLA. The app is public but unsupported; the footer says
so. There is no issue tracker in use — GitHub Issues on the repo is the natural place if
that changes.

## 12.7 Cost review

| Item | Current | Limit | Action if exceeded |
|---|---|---|---|
| Cloudflare Workers | <500 req/day | 100,000/day | Raise cache TTL; still free |
| GitHub Pages | ~264 KB/visit | 100 GB/month soft | Not a realistic concern |
| Domain | none | — | Optional ₹800/yr for a custom domain |
