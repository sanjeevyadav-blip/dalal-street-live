// Loads the real built page in a DOM and asserts it wires itself up.
//
// The golden suite proves the maths is unchanged, but every function in it is pure — none
// of it would notice if the page threw on load. PR-2 deleted three generations of code that
// mounted and re-mounted DOM sections, and the live generations depend on elements the dead
// ones created (mountRanking creates #rankSection; rebuildRanking3 only fills it). That
// dependency is invisible to a unit test and fatal in a browser.
//
// So: run the page's own script against the page's own markup, with the network stubbed,
// and check that the sections the user actually clicks exist and are the current generation.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';

// Reads the BUILT artefact, not src/. From PR-4 the source is a module graph that a browser
// never sees — Vite bundles and re-emits it. Byte-diffing the built script against the
// previous build stopped being a usable parity check at that point, because esbuild
// reformats everything it touches. Booting the real artefact is what replaces it: if the
// bundle is wired up wrongly, or a module fails to resolve, this is where it shows.
const DIST = resolve(process.cwd(), 'dist/index.html');
const HTML = readFileSync(DIST, 'utf8');
// Every .js under src/ that actually ships, concatenated. Assertions about what the source
// does or does not contain have to span the whole module tree now — from PR-7 the screener
// and ranking live under src/ui/tables/, not in app.js, so scanning app.js alone would
// quietly stop checking anything.
const SOURCE = readdirSync(resolve(process.cwd(), 'src'), { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.js') && !f.includes('NOT-DEPLOYED') && !f.endsWith('sw.js'))
  .map((f) => readFileSync(resolve(process.cwd(), 'src', f), 'utf8'))
  .join('\n');

let doc;
let errors;

beforeAll(async () => {
  errors = [];
  const win = new Window({ url: 'https://example.test/' });
  doc = win.document;

  // Every upstream call fails immediately. That is the harsher path: the page must still
  // finish building its shell when no data arrives, which is also invariant 3 in CLAUDE.md
  // — missing data renders as an em dash, it does not blank the page.
  win.fetch = vi.fn(() => Promise.reject(new Error('network disabled in tests')));
  // The page guards registration with `'serviceWorker' in navigator`, so the property has
  // to be absent, not undefined — setting it to undefined leaves the guard true and the
  // call throws. Deleting it is what a non-PWA browser actually looks like.
  try {
    delete win.navigator.serviceWorker;
  } catch {
    Object.defineProperty(win.navigator, 'serviceWorker', { configurable: true, value: undefined });
  }
  win.addEventListener('error', (e) => errors.push(e.message || String(e)));

  // The markup is written first with its <script> removed, then that script is evaluated
  // explicitly. happy-dom does not run scripts that arrive via document.write, and relying
  // on it to would make this test quietly assert nothing — which is worse than not having
  // it. Evaluating the real script against the real markup tests the same thing.
  const m = HTML.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no inline <script> in the built artefact — singlefile inlining broke');
  const script = m[1];

  doc.write(HTML.replace(m[0], ''));
  doc.close();

  try {
    win.eval(script);
  } catch (err) {
    errors.push(`script threw during evaluation: ${err.message}`);
  }

  // The render pipeline uses setTimeout(200) and setTimeout(400), so the wait must
  // outlast both.
  await new Promise((r) => setTimeout(r, 600));
});

describe('page boots', () => {
  it('raises no uncaught error while building the shell', () => {
    expect(errors).toEqual([]);
  });

  it('mounts the ranking section that rebuildRanking3 depends on', () => {
    // If mountRanking were deleted outright, this is null and the whole ranking feature
    // silently disappears — rebuildRanking3 returns early and nothing reports it.
    expect(doc.getElementById('rankSection')).not.toBeNull();
  });

  it('renders the current ranking generation, not an older one', () => {
    // Row-count selectors only exist in generation 4 (runRanking3). Their presence proves
    // rebuildRanking3 ran and won the last write.
    expect(doc.getElementById('rankLargeCount')).not.toBeNull();
    expect(doc.getElementById('rankMidCount')).not.toBeNull();
    expect(doc.getElementById('rankLargeBody')).not.toBeNull();
    expect(doc.getElementById('rankMidBody')).not.toBeNull();
  });

  it('renders the current screener generation, not an older one', () => {
    expect(doc.getElementById('scrLargeCount')).not.toBeNull();
    expect(doc.getElementById('scrMidCount')).not.toBeNull();
    expect(doc.getElementById('largeCapBody')).not.toBeNull();
    expect(doc.getElementById('midCapBody')).not.toBeNull();
  });

  it('keeps the rest of the shell', () => {
    for (const id of ['detailCard', 'glossarySection', 'errorBanner', 'loadIpos']) {
      expect(doc.getElementById(id), `missing #${id}`).not.toBeNull();
    }
  });

  it('places the ranking section directly above the screener', () => {
    const rank = doc.getElementById('rankSection');
    const screener = doc.getElementById('largeCapBody').closest('section');
    expect(rank.nextElementSibling).toBe(screener);
  });
});

describe('no superseded generation survives anywhere in src/', () => {
  // Guards the deletion. If a later change reintroduces one of these by copy-paste, the
  // duplicate-listener problem comes back and the symptom (three fetches per click) is
  // very hard to spot by eye.
  it.each([
    'function fetchScreenerRow(',
    'function screenerRowHtml(',
    'function loadScreenerGroup(',
    'function scoreStock(',
    'function runRanking(',
    'function runRanking20(',
    'function runRankingFull(',
    'function loadScreener2('
  ])('%s is gone', (needle) => {
    expect(SOURCE).not.toContain(needle);
  });

  it.each(['SCREENER_LARGE', 'RANK_LARGE', 'R20_LARGE'])(
    'superseded universe %s is gone',
    (name) => {
      expect(SOURCE).not.toContain(name);
    }
  );

  it('the surviving generation is intact', () => {
    for (const needle of [
      'function fetchScreenerRow2(',
      'function loadScreener3(',
      'function scoreStock20(',
      'function runRanking3(',
      'UNIV_LARGE',
      'UNIV_MID'
    ]) {
      expect(SOURCE, `missing ${needle}`).toContain(needle);
    }
  });
});
