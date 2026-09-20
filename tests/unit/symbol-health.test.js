// EPIC-4 story E4-1 — dead tickers are surfaced, not dropped.
//
// The failure this replaces: a renamed ticker stops resolving, the catch around it logs to
// the console, and the screener renders 52 rows out of 55. The table looks complete. Nothing
// says which three are gone, and a reader has no way to tell a dead symbol from a company
// that publishes nothing.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSymbolOk, recordSymbolDead, symbolHealth, deadSymbols,
  deadSymbolWarning, resetSymbolHealth, validateSymbols
} from '../../src/data/symbol-health.js';
import { runPool } from '../../src/data/proxy.js';

beforeEach(() => {
  resetSymbolHealth();
});

describe('symbol health registry', () => {
  it('tracks a ticker once, whatever suffix it arrives with', () => {
    // The screener works in bare tickers, fetchHistory in RELIANCE.NS, the watchlist can
    // hold RELIANCE.BO. All three are the same company as far as "did this resolve" goes.
    recordSymbolDead('LTIM.NS', 'no chart result');
    expect(symbolHealth('LTIM')).toMatchObject({ ok: false });
    expect(symbolHealth('LTIM.BO')).toMatchObject({ ok: false });
    expect(deadSymbols()).toEqual(['LTIM']);
  });

  it('does not condemn a symbol that has already worked this session', () => {
    // A feed-wide outage would otherwise mark all 55 tickers dead at once, and the warning
    // would name the whole universe — noise, not a finding.
    recordSymbolOk('RELIANCE.NS');
    recordSymbolDead('RELIANCE.NS', 'timeout');
    expect(symbolHealth('RELIANCE').ok).toBe(true);
    expect(deadSymbols()).toEqual([]);
  });

  it('records a later success over an earlier failure', () => {
    recordSymbolDead('TCS.NS', 'HTTP 502');
    expect(deadSymbols()).toEqual(['TCS']);
    recordSymbolOk('TCS.NS');
    expect(deadSymbols()).toEqual([]);
  });

  it('narrows to one universe when asked', () => {
    recordSymbolDead('LTIM.NS');
    recordSymbolDead('SOMEMIDCAP.NS');
    expect(deadSymbols(['RELIANCE', 'LTIM', 'TCS'])).toEqual(['LTIM']);
  });

  it('returns dead symbols sorted, so the warning does not reshuffle between runs', () => {
    ['ZOMATO', 'LTIM', 'ALPHA'].forEach((t) => recordSymbolDead(t + '.NS'));
    expect(deadSymbols()).toEqual(['ALPHA', 'LTIM', 'ZOMATO']);
  });
});

describe('the warning a reader actually sees', () => {
  it('is null when every symbol resolved', () => {
    recordSymbolOk('RELIANCE.NS');
    expect(deadSymbolWarning(['RELIANCE'])).toBeNull();
  });

  it('names every dead ticker rather than counting them', () => {
    // "3 symbols failed" gives the reader nothing to act on. The action is to fix the
    // universe list, which needs the names.
    ['LTIM', 'ZOMATO', 'TATAMOTORS'].forEach((t) => recordSymbolDead(t + '.NS'));
    const msg = deadSymbolWarning();
    expect(msg).toContain('LTIM');
    expect(msg).toContain('ZOMATO');
    expect(msg).toContain('TATAMOTORS');
    expect(msg).toMatch(/^3 symbols/);
  });

  it('reads correctly for a single dead ticker', () => {
    recordSymbolDead('LTIM.NS');
    expect(deadSymbolWarning()).toMatch(/^One symbol/);
  });

  it('says a dead ticker is not a company without data', () => {
    // CLAUDE.md invariant 3, restated for the one case where an absent ROW, not an absent
    // cell, is the thing being explained.
    recordSymbolDead('LTIM.NS');
    expect(deadSymbolWarning()).toContain('not a company with no data');
  });
});

describe('explicit validation sweep', () => {
  it('reports exactly the symbols that failed', async () => {
    const dead = await validateSymbols(
      ['RELIANCE', 'LTIM', 'TCS'],
      async (sym) => {
        if (sym === 'LTIM') throw new Error('No data for LTIM');
        return { ok: true };
      },
      runPool,
      2
    );
    expect(dead).toEqual(['LTIM']);
    expect(symbolHealth('RELIANCE').ok).toBe(true);
    expect(symbolHealth('LTIM').reason).toContain('No data');
  });

  it('checks every symbol even when several fail', async () => {
    const seen = [];
    await validateSymbols(
      ['A', 'B', 'C', 'D'],
      async (sym) => { seen.push(sym); throw new Error('dead'); },
      runPool,
      2
    );
    expect(seen.sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(deadSymbols()).toEqual(['A', 'B', 'C', 'D']);
  });
});
