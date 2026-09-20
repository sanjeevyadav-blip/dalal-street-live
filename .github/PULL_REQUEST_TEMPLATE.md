## What and why

<!-- What changed, and the reason. The diff already says what; explain why. -->

Requirement: <!-- FR-n from docs/03, or issue # -->

## Checklist

**Correctness**
- [ ] Units checked (fraction vs percent — docs/05 §5.2)
- [ ] Insufficient-data path returns `—`, not a partial or fabricated value
- [ ] No empty `catch {}` swallowing a real upstream failure

**Honesty** (docs/14 ADR-003, ADR-009)
- [ ] Any new number carries a source label and stated failure mode
- [ ] No recommendation-shaped output added
- [ ] No target price or "probability of reaching X by date Y"

**Testing**
- [ ] Unit tests for new pure functions
- [ ] Regression test if this fixes a bug
- [ ] `npm run verify` passes locally

**Ops**
- [ ] New outbound host added to Worker allowlist if needed (and only that host)
- [ ] Docs updated if behaviour, API or architecture changed
- [ ] Changelog entry added
