// Regenerates src/data/nse-equities.js from NSE's own list of listed equities.
//
//   node scripts/build-equity-list.mjs
//
// WHY A BUILD-TIME FILE AND NOT A LIVE REQUEST
//
// Search suggestions run on every keystroke. Fetching them over the network would put a
// proxy round trip — hundreds of milliseconds on a phone — between each letter and its
// result. NSE publishes the complete list as one small CSV (about 2,600 rows), so it ships
// as a 75 KB file beside the page and filtering it is instant.
//
// Beside the page, not inside it. Bundled, it pushed index.html past the 400 KB budget in
// tests/unit/build-output.test.js, and it is only needed once someone starts typing — so
// data/nse-equities.js fetches it on first focus of a search box instead, and the first
// paint is not made to carry it. Same origin, so the service worker caches it for offline
// use, and inside the Android app it is a local file. Live search (Yahoo) remains the
// fallback for BSE-only companies and anything listed since the file was generated.
//
// Read-only: one GET against nsearchives.nseindia.com, which is NSE's public archive host.
// It is fetched directly rather than through the Worker because this runs on a developer
// machine at build time, not in anyone's browser.
//
// RE-RUN IT periodically. Companies list, delist and rename — TATAMOTORS became TMPV,
// ZOMATO became ETERNAL — and a stale list is the same universe-rot trap the screener hit.
// A name the list does not know can still be opened by typing its exact ticker.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
// src/public/, not src/data/: this is fetched on the first keystroke rather than bundled.
// Vite copies public/ into dist beside index.html (vite.config.js publicDir).
const OUT = resolve(process.cwd(), 'src/public/nse-equities.json');

// Mainboard series only. EQ is the normal rolling segment; BE and BZ are trade-for-trade
// segments for surveillance or non-compliance, which are still real, quoted companies.
const SERIES = new Set(['EQ', 'BE', 'BZ']);

/** Minimal RFC 4180 line parser: company names can contain commas inside quotes. */
function parseLine(line){
  const out = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++){
    const c = line[i];
    if (quoted){
      if (c === '"' && line[i + 1] === '"'){ cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// "Zydus Lifesciences Limited" -> "Zydus Lifesciences". The suffix is on every row, so it
// adds bytes to the bundle and nothing to a suggestion. Matches the curated directory's
// style in universes.js, which never carried it.
function tidyName(name){
  return name
    .replace(/\s+/g, ' ')
    .replace(/\s*\b(Limited|Ltd\.?)\s*$/i, '')
    .trim();
}

async function main(){
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('NSE returned HTTP ' + res.status + ' for ' + SOURCE);
  const csv = await res.text();

  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = parseLine(lines[0]).map(h => h.toUpperCase());
  const iSym = header.indexOf('SYMBOL');
  const iName = header.indexOf('NAME OF COMPANY');
  const iSeries = header.indexOf('SERIES');
  if (iSym < 0 || iName < 0 || iSeries < 0){
    // NSE has changed column names before. Fail rather than ship an empty or scrambled
    // list — a search box that silently knows nothing is worse than a stale one.
    throw new Error('Unexpected EQUITY_L.csv header: ' + lines[0]);
  }

  const seen = new Set();
  const rows = [];
  for (const line of lines.slice(1)){
    const f = parseLine(line);
    const sym = f[iSym], name = tidyName(f[iName] || ''), series = f[iSeries];
    if (!sym || !name || !SERIES.has(series) || seen.has(sym)) continue;
    // A tab or newline in either field would corrupt the packed format below.
    if (/[\t\n]/.test(sym + name)) continue;
    seen.add(sym);
    rows.push([sym, name]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));

  if (rows.length < 1500){
    throw new Error('Only ' + rows.length + ' equities parsed; expected about 2,500. Not writing.');
  }

  // Packed as one string, "SYMBOL\tName" per line, rather than an array of arrays: about a
  // third smaller, for one split() on first use.
  const packed = rows.map(([s, n]) => s + '\t' + n).join('\n');
  const asOf = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify({
    source: 'NSE EQUITY_L.csv, mainboard series EQ/BE/BZ, via scripts/build-equity-list.mjs',
    asOf, count: rows.length, packed
  });
  await writeFile(OUT, json);
  console.log('wrote ' + rows.length + ' equities to src/public/nse-equities.json (' +
    (Buffer.byteLength(json) / 1024).toFixed(0) + ' KB, as of ' + asOf + ')');
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
