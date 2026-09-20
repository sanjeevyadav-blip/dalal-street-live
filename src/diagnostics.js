// Structured client-side failure log — EPIC-4 story E4-4.
//
// THE PROBLEM THIS SOLVES
//
// Every suppressed failure in this app used to end at a console.warn. That is fine while
// you are looking at the console and useless otherwise: the owner notices "the factor block
// is empty" hours later, and by then there is nothing to read. Worse, a reader who is not
// the owner has no way to report anything beyond "it looked broken".
//
// So failures are also kept here, structured, in a bounded ring buffer, and rendered on
// demand by src/ui/diagnostics-block.js.
//
// OPT-IN, AND WHY IT STILL RECORDS WHEN OFF
//
// The UI panel is opt-in: it appears only when diagnostics are switched on, either by the
// toggle in the page or by `?diag=1`. The BUFFER, though, is always filling. That is
// deliberate — a log you have to enable before the bug happens is a log you never have when
// it matters. Nothing leaves the browser either way: there is no endpoint, no beacon, no
// network call anywhere in this file. "Opt-in" governs what is shown, not what is kept.
//
// NO PII, ENFORCED BY WHAT IS RECORDABLE
//
// A record carries a context label, an error message, a timestamp, and a small bag of
// scalar metadata. It deliberately cannot carry:
//
//   - full URLs      a query string holds the symbols someone looked up. Callers pass the
//                    HOST instead; see failed() in src/data/proxy.js.
//   - the watchlist  what a person holds is the most sensitive thing this app touches.
//   - free objects   sanitiseMeta below keeps scalars and drops everything else, so a
//                    caller cannot accidentally spill a response body or a fixture.
//
// The point is that the log can be read aloud, pasted into a message, or screenshotted
// without anyone having to check what is in it first.

const MAX_RECORDS = 100;
const STORAGE_KEY = 'dsl.diagnostics';

const records = [];
let enabled = false;
let listener = null;

/** Scalars only, and short ones. Anything else is dropped rather than stringified. */
function sanitiseMeta(meta){
  const out = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const [k, v] of Object.entries(meta)){
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.length > 120 ? v.slice(0, 120) + '…' : v;
    // objects, arrays, functions, symbols: deliberately dropped
  }
  return out;
}

function messageOf(err){
  if (err == null) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return String(err.message);
  return String(err);
}

/**
 * Record a failure the UI rode out.
 *
 * @param {string} context  where it happened, e.g. 'factors: history fetch'
 * @param {unknown} err     the thrown value
 * @param {object} [meta]   scalar metadata only — host, status, retries, symbol
 */
export function recordFailure(context, err, meta){
  const record = {
    at: new Date().toISOString(),
    context: String(context),
    message: messageOf(err),
    meta: sanitiseMeta(meta)
  };
  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);

  // The console line stays: it is what makes a failure visible while someone IS watching.
  console.warn('[dalal] ' + record.context + ': ' + record.message);

  if (listener) { try { listener(record); } catch { /* a broken listener must not break the app */ } }
  return record;
}

export function getFailures(){
  return records.slice();
}

export function failureCount(){
  return records.length;
}

export function clearFailures(){
  records.length = 0;
  if (listener) { try { listener(null); } catch { /* as above */ } }
}

/** One listener, called after every record. Used by the diagnostics panel to re-render. */
export function onFailure(fn){
  listener = typeof fn === 'function' ? fn : null;
}

export function isEnabled(){
  return enabled;
}

export function setEnabled(on){
  enabled = Boolean(on);
  try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch { /* private mode */ }
  return enabled;
}

/**
 * Work out whether the panel should be showing, from `?diag=1` or the stored preference.
 * Called once at startup. Failures here are swallowed: diagnostics must never be the reason
 * the page does not load.
 */
export function initDiagnostics(){
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('diag') === '1') { enabled = true; return enabled; }
    if (params.get('diag') === '0') { enabled = false; return enabled; }
  } catch { /* no location in some test environments */ }
  try { enabled = localStorage.getItem(STORAGE_KEY) === '1'; } catch { enabled = false; }
  return enabled;
}

/** A plain-text dump, for pasting into a message. Same no-PII guarantee as the records. */
export function formatFailures(){
  if (!records.length) return 'No failures recorded this session.';
  return records.map((r) => {
    const meta = Object.entries(r.meta).map(([k, v]) => k + '=' + v).join(' ');
    return r.at + '  ' + r.context + ' — ' + r.message + (meta ? '  [' + meta + ']' : '');
  }).join('\n');
}
