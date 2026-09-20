# 08. Security, Privacy & Compliance

## 8.1 Attack surface

No backend, no database, no accounts, no user input persisted server-side. The surface is
small by construction:

| Component | Exposure | Control |
|---|---|---|
| Static site | Public read | Nothing secret is in the bundle |
| Cloudflare Worker | Public, unauthenticated | **Host allowlist** — see below |
| Browser storage | localStorage unused for data | Nothing sensitive stored |
| Third-party APIs | Outbound only | Read-only GET, no credentials sent |

## 8.2 The single most important control — Worker host allowlist

Without it, the Worker is an **open relay**: anyone finding the URL could proxy arbitrary
traffic through your Cloudflare account, burn the free quota, and attach your account to
their traffic.

```js
const ALLOWED_HOSTS = new Set([
  'query1.finance.yahoo.com','query2.finance.yahoo.com',
  'news.google.com','feeds.finance.yahoo.com',
  'www.bing.com','www.nseindia.com'
]);
if (p.protocol !== 'https:' || !ALLOWED_HOSTS.has(p.hostname))
  return new Response('Host not allowed', { status: 403, headers: CORS });
```
Also enforced: HTTPS only, GET only, no request-body forwarding.

**If you add a data source, add its host here — and only that host.**

## 8.3 Known accepted risks

| Risk | Severity | Why accepted |
|---|---|---|
| Worker is unauthenticated | Low | Allowlist limits it to read-only public market data |
| `Access-Control-Allow-Origin: *` | Low | Response data is already public |
| Someone else uses your Worker | Low | Caps at 100k/day; only returns public data |
| Upstream serves bad data | Medium | Sanity checks (e.g. previousClose within 25% of spot) |
| Dependency on unofficial APIs | Medium | No contract; must degrade gracefully — see doc 12 |

**Not accepted / must never be added:** forwarding Authorization headers, proxying POST,
accepting a target host from user input outside the allowlist, or storing API keys in the
client bundle.

## 8.4 Privacy

- **No personal data is collected.** No accounts, no email, no analytics, no cookies set by
  the app, no third-party trackers.
- Position-sizing inputs (capital, risk %) stay in the page and are never transmitted.
- The Worker logs nothing beyond Cloudflare's standard request metrics.
- DPDP Act 2023 (India): no personal data is processed, so obligations do not attach.

## 8.5 Regulatory — SEBI

Publishing stock recommendations with buy/sell calls or target prices in India is
restricted to **SEBI-registered Research Analysts** (SEBI (Research Analysts)
Regulations, 2014) and Investment Advisers (IA Regulations, 2013).

**This application is not registered and therefore must not:**
- issue BUY / SELL / HOLD / AVOID recommendations
- publish target prices
- state a probability of reaching a given price by a given date
- present model output as advice

**What it does instead:** publishes measurable, objective metrics with their sources and
assumptions, and a multi-pillar verdict panel that deliberately stops short of a single
recommendation. The disclaimer appears in the screener, the manual and the footer.

> This is a product constraint, not a limitation to be engineered around. Anyone extending
> the app should treat FR-12 AC-12.2 as non-negotiable.

## 8.6 Third-party terms

Yahoo Finance endpoints used here are **unofficial and unsupported**. NSE's public APIs are
intended for its own site. Usage is low-volume, non-commercial, read-only and personal,
with a browser-like User-Agent and no scraping of authenticated areas. Anyone
commercialising this must move to licensed feeds (NSE data vendor, Refinitiv, or a broker
API such as Upstox/Angel One/Fyers/Dhan).

## 8.7 Secrets

There are currently **no secrets** — every endpoint is public and unauthenticated.
If that changes (broker API keys, paid data), they must live in Cloudflare Worker
environment variables (`wrangler secret put`), never in `index.html`, which is public.

## 8.8 Security checklist for any change

```
[ ] New outbound host added to ALLOWED_HOSTS — and nothing broader
[ ] No credential or key added to client-side code
[ ] No user-supplied string interpolated into HTML without escaping
[ ] No new personal data collected or stored
[ ] No buy/sell/target output introduced
[ ] Worker still rejects non-GET and non-HTTPS
```
