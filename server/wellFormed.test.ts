import { describe, expect, it } from 'vitest';
import { jsonDepthExceeds, MAX_JSON_DEPTH, repairBody } from './wellFormed.ts';

// An object nested `levels` deep (the root is level 1).
const nest = (levels: number): unknown => {
  let v: unknown = {};
  for (let i = 1; i < levels; i++) v = { a: v };
  return v;
};

describe('jsonDepthExceeds', () => {
  it('counts the root as level 1 and refuses only what is deeper than the limit', () => {
    expect(jsonDepthExceeds(nest(MAX_JSON_DEPTH))).toBe(false);
    expect(jsonDepthExceeds(nest(MAX_JSON_DEPTH + 1))).toBe(true);
    expect(jsonDepthExceeds({}, 1)).toBe(false);
    expect(jsonDepthExceeds({ a: {} }, 1)).toBe(true);
  });

  it('counts arrays as levels too, and looks at every branch, not only the first', () => {
    expect(jsonDepthExceeds([[[1]]], 2)).toBe(true);
    expect(jsonDepthExceeds({ wide: [{ a: 1 }, { b: 2 }], deep: { c: { d: { e: 1 } } } }, 3)).toBe(true);
    expect(jsonDepthExceeds({ wide: [{ a: 1 }, { b: 2 }], flat: { c: 1 } }, 3)).toBe(false);
  });

  it('leaves values that are not objects alone', () => {
    for (const v of [undefined, null, 1, 'text', true]) expect(jsonDepthExceeds(v)).toBe(false);
  });

  it('walks a million levels without overflowing its own stack', () => {
    expect(jsonDepthExceeds(nest(1_000_000))).toBe(true);
  });

  it('allows the deepest data the app itself produces with room to spare', () => {
    // The v1 data fixture is 10 levels deep and a command wraps its input in about 3 more.
    expect(MAX_JSON_DEPTH).toBeGreaterThanOrEqual(40);
  });
});

describe('repairBody', () => {
  const run = (body: unknown) => {
    let result: unknown = 'not called';
    repairBody({ body } as never, {} as never, ((err?: unknown) => { result = err ?? 'next'; }) as never);
    return result;
  };

  it('passes a body within the limit on', () => {
    expect(run({ note: 'ok', list: [{ a: 1 }] })).toBe('next');
  });

  it('passes a body over the limit to the error handler as a database data error (54001), so it answers 422', () => {
    const err = run(nest(MAX_JSON_DEPTH + 1)) as { code?: string; message?: string };
    expect(err.code).toBe('54001');
    expect(err.message).toBe('JSON nested too deep');
  });
});
