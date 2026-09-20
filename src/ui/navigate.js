// "Open this stock's detail panel", as a seam.
//
// Several UI modules need to trigger it — a screener row, a ranking row, a watchlist row,
// a peer chip, an IPO card — but the function that does it is the app's own orchestration
// and lives in app.js. Importing app.js back from those modules would make the graph
// circular: app.js imports ui/tables, ui/tables imports app.js. ES modules tolerate cycles,
// but the binding is only defined once evaluation reaches it, so a cycle turns a wiring
// mistake into an intermittent runtime failure rather than a build error.
//
// Registering a handler keeps the dependency one-way: app.js knows about the UI modules,
// and the UI modules know only about this seam.

let handler = null;

/** Called once from app.js during startup. */
export function setStockDetailHandler(fn) {
  handler = fn;
}

/**
 * Open a stock's detail panel. A no-op before the handler is registered, which can only
 * happen if a UI module fires during module evaluation rather than from a user action.
 */
export function openStock(symbol) {
  if (handler) handler(symbol);
}
