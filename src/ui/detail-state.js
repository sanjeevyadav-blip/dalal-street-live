// The state the stock detail panel renders from.
//
// A single mutable object rather than three module-level `let`s, because more than one
// module needs it: app.js writes it when a stock loads, and ui/charts.js reads it on every
// redraw and on window resize. Exported bindings cannot be reassigned across modules, but
// properties of an exported object can, so this is the shape that survives the split.
//
//   symbol     the stock currently open, or null. Every async continuation in
//              loadStockDetail checks this before touching the DOM — without it, a slow
//              response for a stock the user has already navigated away from would render
//              its numbers under the new stock's heading.
//   chartData  the full 2-year series plus precomputed overlays, kept at full length so
//              changing the visible range re-slices instead of re-fetching.
//   range      the visible window: one of the keys of RANGE_DAYS in ui/charts.js.
export const detailState = {
  symbol: null,
  chartData: null,
  range: '1y'
};
