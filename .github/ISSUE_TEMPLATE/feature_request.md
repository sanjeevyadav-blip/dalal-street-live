---
name: Feature request
about: New analysis block or capability
labels: enhancement
---

**What and why:**
**Which requirement does it serve?** (BR-n in docs/01, or a new one)

**Data source** — required before work starts
- [ ] Endpoint identified and **tested live** (paste the response)
- [ ] Not on the dead-ends list (docs/06 §3.2)
- [ ] Host added to Worker allowlist if new

**Honesty check**
- [ ] It does not produce a buy/sell recommendation or target price
- [ ] Its assumptions and failure modes can be stated next to the output
- [ ] If the data is missing, the block degrades to `—` rather than guessing
