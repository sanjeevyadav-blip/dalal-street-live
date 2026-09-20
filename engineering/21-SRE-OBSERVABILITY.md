# 21. SRE, Observability & Incident Response

## Service level indicators and objectives

| SLI | Definition | SLO |
|---|---|---|
| Availability | Page loads and renders the shell | 99.5% monthly |
| Data freshness | Index prices render within 5s of load | 99% of loads |
| Correctness | No displayed value is wrong | **100% — no error budget** |
| Latency | Cold load to first price | p95 < 2s |
| Detail render | Core blocks complete | p95 < 4s |

**Correctness has no error budget.** Availability failures are visible and self-correcting;
a confidently wrong number is invisible and gets acted upon. That asymmetry drives the whole
monitoring approach: prefer a block that says "unavailable" over one that guesses.

## What to monitor

| Layer | Signal | Method |
|---|---|---|
| Upstream APIs | Each endpoint returns expected shape | Scheduled GH Action, daily |
| Worker | Request count, error rate, CPU | Cloudflare dashboard; `wrangler tail` live |
| Site | Page loads, JS errors | Optional opt-in client logging (no PII) |
| Data quality | Sanity assertions on rendered values | Client-side invariant checks |
| Cost | Worker requests vs 100k/day free tier | Monthly review |

## Data-quality assertions — the most valuable monitoring here

Because the real risk is *wrong*, not *down*, assert plausibility at render time:

```js
assert(price > 0 && price < 1e7,            'price out of range');
assert(Math.abs(change1d) < 25,             '1D move implausible — check previousClose');
assert(change1d !== change1y,               '1D equals 1Y — the known previousClose bug');
assert(rsi === null || (rsi >= 0 && rsi <= 100), 'RSI out of bounds');
assert(pUp === null || (pUp > 5 && pUp < 95),    'probability implausibly confident');
assert(!(dcfIntrinsic > price * 10),        'DCF 10x price — likely unit error');
```
On failure: render `—` with a warning, log it, **never display the value**.

## Alerting

Minimum viable: the daily health-check Action emails on failure.

Better, if it grows: route Worker errors to a webhook (Slack/Telegram) via
`event.waitUntil(fetch(WEBHOOK, ...))` on 5xx.

| Alert | Severity | Action |
|---|---|---|
| Price feed down | S1 | Check Worker, then Yahoo directly |
| Crumb auth failing | S1 | All fundamentals dark; inspect handshake |
| NSE session failing | S2 | Options block only |
| Data-quality assertion fires | **S1** | Roll back immediately |
| Worker > 50k req/day | S3 | Investigate abuse; raise cache TTL |

## Incident response

```
1. DETECT    alert, health check, or user report
2. TRIAGE    scope — one block or everything? wrong data or no data?
3. MITIGATE  wrong data → roll back NOW, diagnose after
             no data  → degrade gracefully, diagnose live
4. DIAGNOSE  doc 11 §5.7 failure playbook
5. FIX       with a regression test (doc 10 §10.3)
6. VERIFY    deploy checklist, doc 11 §5.5
7. LEARN     changelog entry; ADR if structural; risk register update
```

**Mitigate before diagnose when data is wrong.** Every minute a wrong number is displayed
is a minute someone might act on it.

## Post-incident template

```markdown
## Incident: <title>            Date: <date>   Severity: S<n>
**Impact:** who saw what, for how long
**Timeline:** detection → mitigation → resolution
**Root cause:** the actual cause, not the proximate symptom
**Why it wasn't caught:** the missing test or check
**Actions:** [ ] regression test  [ ] doc update  [ ] monitoring gap closed
```

## Capacity

| Resource | Current | Limit | Headroom |
|---|---|---|---|
| Worker requests | <500/day | 100,000/day | 200× |
| Worker CPU | ~5ms/req | 10ms free tier | comfortable |
| Pages bandwidth | ~264 KB/visit | 100 GB/mo soft | ~380k visits |

At ~1000 daily users the Worker free tier is still sufficient. Beyond that, raise the edge
cache TTL before paying for anything.
