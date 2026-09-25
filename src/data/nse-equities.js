// NSE's full list of listed equities, loaded on demand.
//
// The list (src/public/nse-equities.json, 75 KB, from scripts/build-equity-list.mjs) is NOT
// bundled into index.html. It used to be, and that pushed the page past its 400 KB budget
// for something only needed once a person starts typing. It is fetched on the first focus of
// a search box instead, which is long before the second keystroke needs it.
//
// Until it arrives, and if it never does, search still works from the curated directory in
// universes.js plus the live Yahoo fallback. A missing list degrades suggestions; it does
// not break search.

let parsed = null;
let asOf = null;
let loading = null;

/** [[symbol, name], ...] — empty until loadNseEquities() has resolved. */
export function nseEquities(){ return parsed || []; }

/** The date the list was generated, or null before it has loaded. */
export function nseEquitiesAsOf(){ return asOf; }

function unpack(data){
  if (!data || typeof data.packed !== 'string') throw new Error('nse-equities.json has no packed list');
  parsed = data.packed.split('\n').map(line => line.split('\t')).filter(r => r.length === 2 && r[0]);
  asOf = data.asOf || null;
  return parsed;
}

/**
 * Fetch and parse the list once. Concurrent callers share one request; a failure clears the
 * in-flight promise so a later focus can try again rather than being stuck on the failure.
 *
 * Relative URL: the page is served from the site root on GitHub Pages, from a local origin
 * inside the Android app, and from the preview server in tests, and the file sits beside
 * index.html in all three.
 */
export function loadNseEquities(fetchImpl){
  if (parsed) return Promise.resolve(parsed);
  if (loading) return loading;
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return Promise.reject(new Error('no fetch available'));
  loading = f('nse-equities.json')
    .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(unpack)
    .catch(err => { loading = null; throw err; });
  return loading;
}

/** For tests and for the build: install a list directly, from the same JSON shape. */
export function setNseEquities(data){
  loading = null;
  return unpack(data);
}
