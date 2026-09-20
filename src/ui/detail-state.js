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
//   dcfInputs  what the DCF was built from, stashed by ui/deep-analysis.js so the
//              probability lab can re-run it under uncertainty without a second round of
//              fetchAnnuals and fetchFundamentals. Null until the DCF succeeds, and reset
//              on every stock load so the lab can never draw on the previous company's
//              cash flows.
export const detailState = {
  symbol: null,
  chartData: null,
  range: '1y',
  dcfInputs: null
};
