# 14. Architecture Decision Records

Why things are the way they are. Read before "fixing" something that looks wrong.

---
## ADR-001 — Single static file, no backend
**Status:** Accepted · **Context:** Zero budget, single user, must run forever.
**Decision:** Static HTML on GitHub Pages; all computation client-side.
**Consequences:** ₹0 cost, no ops, no auth. But no persistence (watchlist resets), no
scheduled jobs, no server-side secrets. Accepted deliberately.
**Revisit if:** multi-user, alerts, or persistence is needed.

---
## ADR-002 — Cloudflare Worker as CORS proxy
**Status:** Accepted · **Context:** Yahoo and NSE send no CORS headers; public relays
(allorigins, codetabs, corsproxy.io) proved unreliable and corsproxy.io now requires payment.
**Decision:** Own Worker with a strict host allowlist.
**Consequences:** Reliable, free, and the only place cross-origin cookie handshakes can live.
Adds one deployable component.
**Rejected:** public relays (unreliable); server-side rendering (needs a backend).

---
## ADR-003 — No BUY / HOLD / AVOID verdict
**Status:** Accepted, non-negotiable · **Context:** The obvious product instinct is a single
verdict, and it was explicitly requested.
**Decision:** A five-pillar panel (valuation, earnings quality, momentum, risk, street view)
that reports each separately and explains why it stops.
**Rationale:** (a) DCF output swings 40%+ across defensible assumptions, so a derived verdict
would carry far more confidence than the inputs support; (b) synthesis depends on horizon,
existing exposure and tax position, none of which the page knows; (c) SEBI restricts
published buy/sell calls to registered Research Analysts; (d) where pillars agree no label is
needed, and where they conflict **the conflict is the finding** — one word would hide it.
**Consequences:** Less immediately satisfying; more useful.

---
## ADR-004 — Raw canvas charts, no charting library
**Status:** Accepted · **Context:** Single-file constraint; Chart.js/ECharts add 200 KB+.
**Decision:** Hand-rolled canvas rendering with devicePixelRatio handling.
**Consequences:** Small, fast, fully controllable, matches the design system exactly.
Costs more code and no free interactivity.

---
## ADR-005 — `option-chain-v3` with explicit expiry
**Status:** Accepted · **Context:** Options were **initially declared impossible**; the old
`option-chain-equities` endpoint returns `{}` regardless of headers.
**Decision:** Two-step — `option-chain-contract-info` for expiries, then `option-chain-v3`
with `expiry=`, behind an NSE cookie handshake.
**Consequences:** Live options-implied probability works. **Lesson recorded:** the
"impossible" verdict was wrong, and re-testing found the path. Re-test before concluding a
source is dead.

---
## ADR-006 — Closed-form probabilities, not Monte Carlo, in the ranking table
**Status:** Accepted · **Context:** Needed P(up) for 40–55 stocks quickly.
**Decision:** Analytic GBM: `P = N( μN / (σ√N) )`, plus a technical tilt capped at ±6 points.
**Consequences:** Exact (no simulation noise), instant, and honest — values cluster near
50% because short-horizon movement genuinely is near a coin flip. Monte Carlo is retained in
the probability lab where distribution shape matters.

---
## ADR-007 — Self-constructed size/momentum factors
**Status:** Accepted with caveat · **Context:** Canonical Fama-French factors for India are
not freely published.
**Decision:** Build SMB from a mid-cap minus large-cap basket and WML from 12-1 momentum
within a 24-stock universe. No HML (needs book-to-market at scale).
**Consequences:** Directionally useful, not academically comparable — and the UI says so.

---
## ADR-008 — Service worker never caches market data
**Status:** Accepted · **Context:** PWAs usually cache aggressively for offline use.
**Decision:** Network-first for the shell; skip caching entirely for the Worker and Yahoo.
**Rationale:** A stock dashboard silently serving yesterday's prices offline is worse than
one that says it cannot reach the network.

---
## ADR-009 — Blank cells over estimated values
**Status:** Accepted · **Context:** Yahoo intermittently omits fields (e.g. ROE for some
symbols), leaving visible gaps.
**Decision:** Render `—` and, where useful, say why. Never substitute a computed proxy that
would look identical to real data.
**Consequences:** Tables look less complete; every filled cell can be trusted.

---
## ADR-010 — Append-only module growth (acknowledged debt)
**Status:** Accepted at the time, **now to be reversed** · **Context:** Each feature was
added by appending a module inside the existing IIFE and wrapping earlier functions by
reassignment, because deploys ran through a browser-based transfer with no file editing.
**Consequences:** It worked and every layer was verified — but `renderDetailCore` is now
wrapped four times, render order depends on wrap order and timeouts, and the file is 264 KB.
**Decision now:** refactor to ES modules with an explicit render pipeline. See doc 15 P0.
