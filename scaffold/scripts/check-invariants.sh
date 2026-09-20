#!/usr/bin/env bash
# Product invariants. These are NOT style rules — they encode legal (SEBI) and
# epistemic constraints recorded in docs/14-ADR.md. See ADR-003 and ADR-009.
set -uo pipefail
FAIL=0
fail(){ echo "INVARIANT VIOLATED: $1"; FAIL=1; }

grep -rnE "(BUY|SELL|HOLD|AVOID)[[:space:]]*(recommendation|verdict|signal|call)" src/ \
  && fail "recommendation-shaped output (ADR-003)"

grep -rnE "targetPrice[[:space:]]*=" src/ \
  && fail "target price generation (ADR-003)"

grep -rnE "probabilityOfReaching|probOfTarget" src/ \
  && fail "probability of reaching a price by a date (ADR-003)"

grep -rnE "\|\|[[:space:]]*0[[:space:]]*;.*(price|ratio|value|margin)" src/ \
  && fail "numeric fallback to 0 — missing data must render as em dash (ADR-009)"

if [ "$FAIL" -eq 0 ]; then echo "All product invariants hold."; fi
exit $FAIL
