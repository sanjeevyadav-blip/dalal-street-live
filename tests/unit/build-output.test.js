// Asserts the thing that actually gets deployed.
//
// From PR-3 onward src/index.html is no longer the artefact — it references ./styles.css,
// and later PRs add ./app.js and the module tree. vite-plugin-singlefile is what collapses
// all of it back into one file for GitHub Pages. If that inlining ever silently stops
// working, the build still succeeds and still produces an index.html; it just ships a page
// that references files Pages will 404 on. The page would render unstyled and dead, and
// every other test in this suite would still pass, because they all read src/.
//
// So this suite reads dist/ and nothing else.

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist/index.html');
const SRC = resolve(process.cwd(), 'src/index.html');

const built = existsSync(DIST);
const suite = built ? describe : describe.skip;

if (!built) {
  console.warn('dist/index.html not found — run `npm run build` first. Skipping build-output checks.');
}

suite('built artefact is self-contained', () => {
  let html;

  beforeAll(() => {
    html = readFileSync(DIST, 'utf8');
  });

  it('is newer than the source it was built from', () => {
    // A stale dist would make every assertion below meaningless.
    expect(statSync(DIST).mtimeMs).toBeGreaterThanOrEqual(statSync(SRC).mtimeMs - 1000);
  });

  it('references no local files', () => {
    // Script bodies are excluded: they are full of href=" inside HTML-building string
    // concatenation (news links, IPO filings), and those are runtime values, not build
    // references. Only markup outside <script> can 404 on Pages.
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, '');

    // Remote references (Google Fonts) are expected and fine; local ones are not, because
    // nothing but index.html, manifest.json and sw.js is deployed.
    const localRefs = [...markup.matchAll(/(?:src|href)="(?!https?:|data:|#|\/\/)([^"]+)"/g)]
      .map((m) => m[1])
      .filter((ref) => !['manifest.json', 'sw.js', './manifest.json', './sw.js'].includes(ref));
    expect(localRefs).toEqual([]);
  });

  it('carries the stylesheet inline', () => {
    expect(html).toContain('<style');
    expect(html).toContain('--gold:#C9A24B');
    expect(html).not.toContain('styles.css');
  });

  it('carries the script inline', () => {
    expect(html).toContain('<script');
    expect(html).toContain('dalal-proxy.sanjeev-yadav.workers.dev');
  });

  it('keeps the PWA hooks the deploy smoke test checks for', () => {
    // These two strings were the deploy smoke test's grep targets. The workflow is gone,
    // but the assertions outlived it: a build that loses the title or the manifest link is
    // broken whether or not anything is watching.
    expect(html).toContain('Dalal Street');
    expect(html).toContain('manifest.json');
  });

  it('actually emits the two PWA files it references', () => {
    // The page links manifest.json and registers sw.js by URL, so "the reference is in the
    // HTML" is only half the contract — the files have to be in dist/ too.
    //
    // They were not. `publicDir: false` meant the build emitted index.html alone, while the
    // page went on asking for both. On Pages the manifest would 404 and sw.js would receive
    // the HTML fallback, failing registration with "unsupported MIME type ('text/html')".
    // Every offline test still passed, because none of them looked past index.html. A
    // browser found it on the first E2E run. This is that check, made cheap.
    expect(existsSync(resolve(process.cwd(), 'dist/manifest.json')), 'dist/manifest.json missing').toBe(true);
    expect(existsSync(resolve(process.cwd(), 'dist/sw.js')), 'dist/sw.js missing').toBe(true);
  });

  it('ships a service worker that never caches market data', () => {
    // A cached quote is a wrong quote. The worker must bail out of any request bound for
    // the proxy or Yahoo, and of anything cross-origin, before it reaches its cache-put.
    const sw = readFileSync(resolve(process.cwd(), 'dist/sw.js'), 'utf8');
    expect(sw).toContain('workers.dev');
    expect(sw).toContain('yahoo');
    expect(sw).toContain('self.location.origin');
  });

  it('ships a manifest that declares a standalone PWA', () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'dist/manifest.json'), 'utf8'));
    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
  });

  it('stays under the CI bundle guard of 400 KB', () => {
    // Inherited from the deleted CI size guard, and kept: the whole point of a single-file
    // artefact is that it stays small enough to serve in one request.
    expect(statSync(DIST).size).toBeLessThan(409600);
  });

  it('contains no superseded generation', () => {
    for (const needle of ['function runRanking(', 'function loadScreener2(', 'SCREENER_LARGE']) {
      expect(html, `dist still contains ${needle}`).not.toContain(needle);
    }
  });
});
