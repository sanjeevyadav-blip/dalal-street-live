// Which tickers actually resolve — EPIC-4 story E4-1.
//
// THE PROBLEM
//
// Ticker universes rot. TATAMOTORS became TMPV, ZOMATO became ETERNAL, LTIM has no working
// variant at all, and Yahoo does not announce any of it: a renamed symbol just stops
// returning data. Until now every one of those failures was swallowed by a catch that logged
// to the console, so the screener quietly rendered 52 rows out of 55 and the ranking scored
// 52 stocks while calling itself a ranking of the universe. Nothing on screen said which
// three were missing, or that any were.
//
// A silently shorter table is the worst version of this: it looks complete.
//
// WHEN VALIDATION HAPPENS, AND WHY NOT AT STARTUP
//
// The story is titled "startup symbol validation", and a literal reading would fetch all 110
// universe symbols when the page loads. That would be worse than the problem — a hundred
// requests before the reader has asked for anything, on a page whose whole design is to
// fetch only what is being looked at.
//
// So validation is a by-product of use instead. Every fetchHistory call reports its outcome
// here, which means a universe is fully validated exactly when it is fully loaded, at no
// extra cost. deadSymbols() is then rendered under the table that used it, by name.
// validateSymbols() below exists for an explicit on-demand sweep.

const health = new Map();   // symbol -> { ok, reason, at }

/** Normalise RELIANCE / RELIANCE.NS / RELIANCE.BO to one key, so a ticker is tracked once. */
function keyOf(symbol){
  return String(symbol).replace(/\.(NS|BO)$/, '').toUpperCase();
}

export function recordSymbolOk(symbol){
  health.set(keyOf(symbol), { ok: true, reason: null, at: Date.now() });
}

export function recordSymbolDead(symbol, reason){
  const key = keyOf(symbol);
  // A symbol that has worked this session is not marked dead by one transient blip; the
  // proxy layer has already retried by the time this is reached, but a feed-wide outage
  // would otherwise condemn every ticker at once and the warning would be noise.
  const prev = health.get(key);
  if (prev && prev.ok) return;
  health.set(key, { ok: false, reason: reason ? String(reason) : 'no data', at: Date.now() });
}

export function symbolHealth(symbol){
  return health.get(keyOf(symbol)) || null;
}

/** Dead tickers, optionally narrowed to one universe. Sorted, so the warning is stable. */
export function deadSymbols(universe){
  const out = [];
  for (const [key, state] of health){
    if (state.ok) continue;
    if (universe && !universe.some((t) => keyOf(t) === key)) continue;
    out.push(key);
  }
  return out.sort();
}

export function resetSymbolHealth(){
  health.clear();
}

/**
 * Sentence naming the dead tickers, or null when there are none.
 *
 * Deliberately names every one rather than counting them: "3 symbols failed" tells the
 * reader nothing they can act on, and the action here is to fix the universe list.
 */
export function deadSymbolWarning(universe){
  const dead = deadSymbols(universe);
  if (!dead.length) return null;
  const list = dead.join(', ');
  return dead.length === 1
    ? 'One symbol did not resolve and is missing from this table: ' + list +
      '. That is a dead or renamed ticker, not a company with no data.'
    : dead.length + ' symbols did not resolve and are missing from this table: ' + list +
      '. Those are dead or renamed tickers, not companies with no data.';
}

/**
 * Explicit sweep: check a list of symbols and report the dead ones.
 *
 * Not called at startup — see the note at the top. It exists so the universes can be audited
 * on demand when one of them is suspected of having rotted.
 *
 * @param {string[]} symbols
 * @param {(sym: string) => Promise<any>} fetchFn  usually fetchHistory bound to a short range
 * @param {(items: any[], worker: Function, n: number) => Promise<void>} pool
 */
export async function validateSymbols(symbols, fetchFn, pool, concurrency = 5){
  await pool(symbols, async (sym) => {
    try {
      await fetchFn(sym);
      recordSymbolOk(sym);
    } catch (err){
      recordSymbolDead(sym, err && err.message ? err.message : err);
    }
  }, concurrency);
  return deadSymbols(symbols);
}
