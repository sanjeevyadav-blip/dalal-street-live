// The detail panel's render pipeline — PR-8 of engineering/22-REFACTOR-PLAN.md.
//
// PR-8 replaced three renderDetailCore wraps and two bare setTimeout values with a declared
// block list. That is a restructuring of the one thing in this codebase with no test
// coverage at all and a visible failure mode: get the order or the timing wrong and the
// panel still renders, just differently, and nothing fails.
//
// So these tests pin the two things the wrap chain actually encoded:
//   1. WHICH blocks run, in WHAT order, at WHAT delay.
//   2. That nothing is awaited — the four async blocks fetch concurrently, and serialising
//      them would be a real regression that no snapshot would catch.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { DETAIL_BLOCKS, detailContext, runBlocks } from '../../src/ui/detail.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('DETAIL_BLOCKS', () => {
  // Exactly what the three wraps produced, read in execution order:
  //   base render            synchronous
  //   renderDeepAnalysis     synchronous, immediately after the base
  //   renderSnapshot         setTimeout 200
  //   renderOptions          setTimeout 400  (shared one timer callback...)
  //   renderFactors          setTimeout 400  (...with options, called second)
  // The PR-8 parity contract covers the FIVE blocks the wrap chain produced. It is stated
  // as a prefix rather than as the whole list so a genuinely new feature can be appended
  // without weakening it: the original five must keep their order and their delays, and
  // anything added must come after them. EPIC-5 E5-4 appended 'probability-lab' at 700ms.
  const WRAP_CHAIN = ['core', 'deep-analysis', 'snapshot', 'options', 'factors'];
  const WRAP_CHAIN_DELAYS = [0, 0, 200, 400, 400];

  it('still declares the wrap chain blocks first, in the order they ran', () => {
    expect(DETAIL_BLOCKS.slice(0, WRAP_CHAIN.length).map((b) => b.id)).toEqual(WRAP_CHAIN);
  });

  it('still keeps the delays the wrap chain used', () => {
    expect(DETAIL_BLOCKS.slice(0, WRAP_CHAIN.length).map((b) => b.delayMs)).toEqual(WRAP_CHAIN_DELAYS);
  });

  it('runs any later block after all of them', () => {
    // A new block scheduled earlier than 400ms would reorder what is on screen, which is the
    // thing the parity contract exists to prevent.
    const later = DETAIL_BLOCKS.slice(WRAP_CHAIN.length);
    for (const b of later){
      expect(b.delayMs, b.id + ' would render before the original blocks').toBeGreaterThanOrEqual(400);
    }
  });

  it('gives every block an id and a render function', () => {
    for (const b of DETAIL_BLOCKS) {
      expect(typeof b.id, `${b.id} has no id`).toBe('string');
      expect(typeof b.render, `${b.id} has no render`).toBe('function');
      expect(Number.isInteger(b.delayMs), `${b.id} has a non-integer delay`).toBe(true);
    }
  });

  it('has unique ids, so a per-block error state can key off them', () => {
    const ids = DETAIL_BLOCKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('runBlocks', () => {
  const spyBlocks = () => {
    const order = [];
    const at = (id, delayMs) => ({
      id,
      delayMs,
      render: () => {
        order.push(id);
      }
    });
    return { order, at };
  };

  it('runs zero-delay blocks synchronously, in list order', () => {
    vi.useFakeTimers();
    const { order, at } = spyBlocks();
    runBlocks([at('a', 0), at('b', 0)], {});
    // No timer has been advanced yet.
    expect(order).toEqual(['a', 'b']);
  });

  it('defers delayed blocks until their delay elapses', () => {
    vi.useFakeTimers();
    const { order, at } = spyBlocks();
    runBlocks([at('core', 0), at('snapshot', 200), at('options', 400)], {});

    expect(order).toEqual(['core']);
    vi.advanceTimersByTime(199);
    expect(order).toEqual(['core']);
    vi.advanceTimersByTime(1);
    expect(order).toEqual(['core', 'snapshot']);
    vi.advanceTimersByTime(200);
    expect(order).toEqual(['core', 'snapshot', 'options']);
  });

  it('runs blocks sharing a delay in list order, in the same tick', () => {
    // options and factors shared a single setTimeout(400) callback and were called in that
    // order. Two separate timers registered in the same order behave identically.
    vi.useFakeTimers();
    const { order, at } = spyBlocks();
    runBlocks([at('options', 400), at('factors', 400)], {});
    vi.advanceTimersByTime(400);
    expect(order).toEqual(['options', 'factors']);
  });

  // The one that matters. Nothing is awaited, so a block whose fetch never settles must not
  // hold up the blocks behind it. Awaiting in a loop would serialise four independent
  // network round trips and make the panel slower without changing a single rendered number
  // — invisible to every other test in this suite.
  it('does not wait for one block before starting the next', () => {
    vi.useFakeTimers();
    const order = [];
    const blocks = [
      { id: 'slow', delayMs: 0, render: () => new Promise(() => order.push('slow-started')) },
      { id: 'fast', delayMs: 0, render: () => order.push('fast') }
    ];
    runBlocks(blocks, {});
    expect(order).toEqual(['slow-started', 'fast']);
  });

  it('passes the same context object to every block', () => {
    vi.useFakeTimers();
    const seen = [];
    const ctx = { symbol: 'RELIANCE.NS' };
    runBlocks(
      [
        { id: 'a', delayMs: 0, render: (c) => seen.push(c) },
        { id: 'b', delayMs: 100, render: (c) => seen.push(c) }
      ],
      ctx
    );
    vi.advanceTimersByTime(100);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(ctx);
    expect(seen[1]).toBe(ctx);
  });
});

describe('detailContext', () => {
  const hist = (meta, closes) => ({ meta, closes, highs: closes, lows: closes, opens: closes });

  it('prefers the live quote for price', () => {
    const ctx = detailContext('RELIANCE.NS', hist({ regularMarketPrice: 1234.5 }, [1000, 1100]), null);
    expect(ctx.price).toBe(1234.5);
  });

  // The fallback the three wraps each spelled out separately. Computing it once is the only
  // behavioural difference PR-8 introduced, and it is a difference of arithmetic count, not
  // of result.
  it('falls back to the last close when there is no live quote', () => {
    const ctx = detailContext('RELIANCE.NS', hist({}, [1000, 1100]), null);
    expect(ctx.price).toBe(1100);
  });

  it('treats a null price as absent rather than as zero', () => {
    const ctx = detailContext('RELIANCE.NS', hist({ regularMarketPrice: null }, [1000, 1100]), null);
    expect(ctx.price).toBe(1100);
  });

  it('strips the exchange suffix for the ticker the options chain needs', () => {
    expect(detailContext('RELIANCE.NS', hist({}, [1]), null).ticker).toBe('RELIANCE');
    expect(detailContext('RELIANCE.BO', hist({}, [1]), null).ticker).toBe('RELIANCE');
    expect(detailContext('^NSEI', hist({}, [1]), null).ticker).toBe('^NSEI');
  });

  it('carries both histories through unchanged', () => {
    const h = hist({}, [1, 2]);
    const n = hist({}, [3, 4]);
    const ctx = detailContext('TCS.NS', h, n);
    expect(ctx.hist).toBe(h);
    expect(ctx.niftyHist).toBe(n);
    expect(ctx.symbol).toBe('TCS.NS');
  });
});
