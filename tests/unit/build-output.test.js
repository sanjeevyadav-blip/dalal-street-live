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
    // .github/workflows/deploy.yml greps the live page for both of these.
    expect(html).toContain('Dalal Street');
    expect(html).toContain('manifest.json');
  });

  it('stays under the CI bundle guard of 400 KB', () => {
    // .github/workflows/ci.yml fails the build over this. Catch it locally instead.
    expect(statSync(DIST).size).toBeLessThan(409600);
  });

  it('contains no superseded generation', () => {
    for (const needle of ['function runRanking(', 'function loadScreener2(', 'SCREENER_LARGE']) {
      expect(html, `dist still contains ${needle}`).not.toContain(needle);
    }
  });
});
