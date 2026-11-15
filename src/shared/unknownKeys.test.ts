import { describe, expect, it } from 'vitest';
import { normConfig, normConfigDoc } from './config.js';
import { DIET_KEYS, normDietCfg } from './diet.js';
import { MAX_UNKNOWN_BREADTH, MAX_UNKNOWN_BYTES, MAX_UNKNOWN_DEPTH, MAX_UNKNOWN_KEYS, MAX_UNKNOWN_TEXT, keepUnknownKeys } from './unknownKeys.js';

const nest = (n: number): unknown => (n === 0 ? 1 : { a: nest(n - 1) });

describe('keys this build does not know in cfg.diet (ADR 122)', () => {
  const future = { tags: ['a', 'b'], mode: { on: true, n: 3 }, label: 'x' };
  it('survive a save through normDietCfg: the failure an older build had with snacks', () => {
    const saved = normDietCfg({ kcal: 3000, ...future });
    expect(saved).toEqual({ kcal: 3000, ...future });
    expect(normDietCfg(saved)).toEqual(saved); // a second save changes nothing
  });
  it('survive the client read and the server write of the config', () => {
    expect(normConfig({ diet: { pace: 'steady', ...future } }).diet).toEqual({ pace: 'steady', ...future });
    expect(normConfigDoc({ diet: { pace: 'steady', ...future } })?.diet).toEqual({ pace: 'steady', ...future });
  });
  it('keep a diet that holds only an unknown key', () => {
    expect(normDietCfg({ label: 'x' })).toEqual({ label: 'x' });
  });
  it('never revive a known key that is bad', () => {
    expect(normDietCfg({ kcal: 100, snacks: 'no', label: 'x' })).toEqual({ label: 'x' });
  });
});

describe('keepUnknownKeys refuses what is hostile', () => {
  it('drops __proto__, constructor and prototype without touching Object.prototype', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1},"prototype":1,"ok":1}');
    const out = keepUnknownKeys(hostile, []);
    expect(out).toEqual({ ok: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    const d = normDietCfg(JSON.parse('{"kcal":3000,"__proto__":{"polluted":true}}'));
    expect(d).toEqual({ kcal: 3000 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('drops a value with a hostile key at any depth, whole', () => {
    expect(keepUnknownKeys(JSON.parse('{"a":{"b":{"__proto__":{"p":1}}}}'), [])).toEqual({});
    expect(keepUnknownKeys({ a: { 'bad key': 1 } }, [])).toEqual({});
  });
  it('drops keys with unsafe names', () => {
    expect(keepUnknownKeys({ '1a': 1, 'a-b': 1, '': 1, ['a'.repeat(33)]: 1, a: 1 }, [])).toEqual({ a: 1 });
  });
  it('drops values that are not plain JSON', () => {
    expect(keepUnknownKeys({ f: () => 1, u: undefined, n: NaN, i: Infinity, d: new Date(), m: new Map(), c: new (class X { a = 1 })() }, [])).toEqual({});
  });
  it('bounds depth, breadth, text, size and the number of keys', () => {
    expect(keepUnknownKeys({ ok: nest(MAX_UNKNOWN_DEPTH - 1) }, [])).toHaveProperty('ok');
    expect(keepUnknownKeys({ deep: nest(MAX_UNKNOWN_DEPTH + 1) }, [])).toEqual({});
    expect(keepUnknownKeys({ wide: new Array(MAX_UNKNOWN_BREADTH + 1).fill(1) }, [])).toEqual({});
    expect(keepUnknownKeys({ long: 'x'.repeat(MAX_UNKNOWN_TEXT + 1) }, [])).toEqual({});
    expect(keepUnknownKeys({ big: new Array(MAX_UNKNOWN_BREADTH).fill('x'.repeat(MAX_UNKNOWN_TEXT)) }, [])).toEqual({});
    expect(MAX_UNKNOWN_BYTES).toBeLessThan(MAX_UNKNOWN_BREADTH * MAX_UNKNOWN_TEXT);
    const many = Object.fromEntries(Array.from({ length: MAX_UNKNOWN_KEYS + 5 }, (_, i) => [`k${String(i).padStart(2, '0')}`, i]));
    expect(Object.keys(keepUnknownKeys(many, []))).toHaveLength(MAX_UNKNOWN_KEYS);
  });
  it('does not return a known key', () => {
    expect(keepUnknownKeys({ kcal: 5, x: 1 }, ['kcal'])).toEqual({ x: 1 });
  });
});

describe('DIET_KEYS', () => {
  it('lists every key normDietCfg produces on its own', () => {
    const full = normDietCfg({ kcal: 3000, protein: 180, carbs: 300, fat: 80, pace: 'custom', rate: 1, meals: [{ id: 'a', n: 'A', items: [{ n: 'x', kcal: 1, p: 1 }] }], mealsMoved: { a: 'b' }, plan: { '2026-10-30': [{ k: 'm', id: 'm1' }] }, snacks: [{ id: 's' }], snackSkips: { '2026-10-30': ['s'] } });
    expect(Object.keys(full ?? {}).every(k => (DIET_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(Object.keys(full ?? {}).length).toBe(DIET_KEYS.length);
  });
});
