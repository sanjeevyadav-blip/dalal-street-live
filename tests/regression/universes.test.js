// Regression cases from docs/10-TEST-PLAN.md §10.3.
//
// Until PR-4 these arrays were parsed out of the monolith with a regex. They now import
// directly from src/data/universes.js — the regex parsing is gone, which was the point.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  UNIV_LARGE,
  UNIV_MID,
  FACTOR_LARGE,
  FACTOR_SMALL,
  STOCK_DIRECTORY,
  INDICES,
  COUNTS
} from '../../src/data/universes.js';

const APP = readFileSync(resolve(process.cwd(), 'src/app.js'), 'utf8');

describe('ticker universes', () => {
  it('UNIV_LARGE is a non-trivial list', () => {
    expect(UNIV_LARGE.length).toBeGreaterThanOrEqual(50);
  });

  it('UNIV_MID is a non-trivial list', () => {
    expect(UNIV_MID.length).toBeGreaterThanOrEqual(50);
  });

  // A duplicate NMDC in the mid-cap universe shipped and had to be replaced with POLYCAB.
  it('universes contain no duplicates', () => {
    expect(new Set(UNIV_LARGE).size).toBe(UNIV_LARGE.length);
    expect(new Set(UNIV_MID).size).toBe(UNIV_MID.length);
  });

  it('universes do not overlap each other', () => {
    expect(UNIV_LARGE.filter((t) => UNIV_MID.includes(t))).toEqual([]);
  });

  // Yahoo stopped resolving these. Symbol rot is the single most likely silent failure.
  it('contains no known-dead tickers', () => {
    const dead = ['TATAMOTORS', 'ZOMATO', 'LTIM'];
    const found = [...UNIV_LARGE, ...UNIV_MID].filter((t) => dead.includes(t));
    expect(found).toEqual([]);
  });

  it('the factor universes are drawn from the screener universes', () => {
    // The factor model builds size and momentum from these. If a name here is not in the
    // main universes it is not being validated by any of the checks above.
    const all = new Set([...UNIV_LARGE, ...UNIV_MID]);
    expect(FACTOR_LARGE.filter((t) => !all.has(t))).toEqual([]);
    expect(FACTOR_SMALL.filter((t) => !all.has(t))).toEqual([]);
  });

  it('the searchable directory has no duplicate symbols', () => {
    const symbols = STOCK_DIRECTORY.map((row) => row[0]);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('every directory entry has a symbol and a name', () => {
    const bad = STOCK_DIRECTORY.filter((row) => !row[0] || !row[1]);
    expect(bad).toEqual([]);
  });

  it('the index cards are the three the board renders', () => {
    expect(INDICES.map((i) => i.symbol)).toEqual(['^NSEI', '^BSESN', '^NSEBANK']);
  });

  it('row counts are ascending and start at 10', () => {
    expect(COUNTS[0]).toBe(10);
    expect([...COUNTS].sort((a, b) => a - b)).toEqual(COUNTS);
  });
});

describe('module boundaries', () => {
  // Every .js under src/ that actually ships, i.e. everything the module graph can reach.
  // probability-lab.NOT-DEPLOYED.js is excluded because nothing imports it — it carries its
  // own copy of olsMulti, and EPIC-5 story E5-5 is specifically about not shipping both.
  const shipped = readdirSync(resolve(process.cwd(), 'src'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.js') && !f.includes('NOT-DEPLOYED') && !f.endsWith('sw.js'))
    .map((f) => readFileSync(resolve(process.cwd(), 'src', f), 'utf8'))
    .join('\n');

  // The factor block once hung permanently on "Building..." because olsMulti was missing
  // from the bundle. Two definitions is the other way to break it.
  it('olsMulti is defined exactly once across the shipped source', () => {
    expect((shipped.match(/function\s+olsMulti\s*\(/g) || []).length).toBe(1);
  });

  it('it is defined exactly once in the built artefact too', () => {
    const dist = resolve(process.cwd(), 'dist/index.html');
    if (!existsSync(dist)) return;
    const html = readFileSync(dist, 'utf8');
    expect((html.match(/function\s+olsMulti\s*\(/g) || []).length).toBe(1);
  });

  it('app.js no longer declares anything that moved into a module', () => {
    // Catches a merge that reintroduces a local copy shadowing the import — which would
    // compile, pass every other test, and silently diverge from the module.
    for (const name of ['UNIV_LARGE', 'STOCK_DIRECTORY', 'PROXIES', 'WORKER_URL']) {
      expect(APP, `app.js redeclares ${name}`).not.toMatch(
        new RegExp('(?:const|let)\\s+' + name + '\\s*=')
      );
    }
    for (const name of ['computeDcf', 'reverseDcf', 'earningsQuality', 'nCdf', 'olsMulti',
      'gbmProbUp', 'analyseOptions', 'rsiLast', 'smaSeries', 'detectPatterns']) {
      expect(APP, `app.js redeclares ${name}`).not.toMatch(
        new RegExp('function\\s+' + name + '\\s*\\(')
      );
    }
  });
});
