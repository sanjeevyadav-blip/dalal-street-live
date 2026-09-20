// Symbol normalisation.
//
// Yahoo wants an exchange suffix: RELIANCE.NS for NSE, RELIANCE.BO for BSE. Users type the
// bare ticker, and a symbol that already carries a suffix must not get a second one — hence
// the strip-then-append rather than a plain concatenation.
export function fullSymbol(raw, exch){
  return raw.toUpperCase().replace(/\.(NS|BO)$/, '') + '.' + exch;
}
