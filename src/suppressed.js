// Records an upstream failure that the UI deliberately rides out.
//
// These call sites used to be empty catch blocks, which made "the feed failed" look exactly
// like "this company does not publish that number" — the one confusion CLAUDE.md invariant 3
// exists to prevent. This does not change what renders; it makes the failure findable.
// EPIC-4 story E4-2 upgrades the individual blocks to render their own error state.

export function suppressed(context, err){
  console.warn('[dalal] suppressed failure in ' + context + ':', err && err.message ? err.message : err);
}
