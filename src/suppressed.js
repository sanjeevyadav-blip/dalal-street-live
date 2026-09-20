// Records an upstream failure that the UI deliberately rides out.
//
// These call sites used to be empty catch blocks, which made "the feed failed" look exactly
// like "this company does not publish that number" — the one confusion CLAUDE.md invariant 3
// exists to prevent.
//
// As of EPIC-4 story E4-4 this is a thin alias over src/diagnostics.js, so every suppressed
// failure lands in the structured log as well as the console. The 21 call sites keep their
// existing shape; only where the record ends up has changed.

import { recordFailure } from './diagnostics.js';

export function suppressed(context, err, meta){
  recordFailure(context, err, meta);
}
