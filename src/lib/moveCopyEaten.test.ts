import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { entriesOn } from './dietLog.js';
import { copyEaten, copyError, eatenTargets } from './moveCopyEaten.js';

const today = '2026-11-12', yday = '2026-11-11';
const rice: DietEntry = { id: 'a', d: today, n: 'Rice', kcal: 200, p: 4, c: 44, f: 0.5, from: 'r1', t: 8, micro: { calcium: 120 } };
const eggs: DietEntry = { id: 'b', d: yday, n: 'Eggs', kcal: 150, p: 12 };
const sorted = (l: readonly DietEntry[]) => l.map(e => e.id).sort();

describe('copyEaten', () => {
  it('copies the same food, numbers, micronutrients, recipe link and hour to the day; the original stays', () => {
    const r = copyEaten([rice, eggs], 'a', yday, today, 'n1', false);
    expect(r.error).toBeNull();
    expect(r.id).toBe('n1');
    const copy = r.list.find(e => e.id === 'n1')!;
    expect(copy).toEqual({ ...rice, id: 'n1', d: yday });
    expect(r.list.find(e => e.id === 'a')).toEqual(rice);
    expect(r.list).toHaveLength(3);
  });
  it('a move removes the original: one entry out, one in, nothing else touched', () => {
    const r = copyEaten([rice, eggs], 'a', yday, today, 'n1', true);
    expect(r.error).toBeNull();
    expect(sorted(r.list)).toEqual(['b', 'n1']);
    expect(r.list.find(e => e.id === 'n1')).toEqual({ ...rice, id: 'n1', d: yday });
    expect(r.list.find(e => e.id === 'b')).toEqual(eggs);
  });
  it('keeps an entry with no hour without one', () => {
    const r = copyEaten([eggs], 'b', today, today, 'n1', false);
    expect(r.list.find(e => e.id === 'n1')).toEqual({ ...eggs, id: 'n1', d: today });
  });
  it('a copy to today keeps the original hour so it lands in the same meal', () => {
    const r = copyEaten([{ ...eggs, t: 7 }], 'b', today, today, 'n1', false);
    expect(r.list.find(e => e.id === 'n1')!.t).toBe(7);
  });
  it('never loses or duplicates: every id is unique, every food accounted for, over many moves and copies', () => {
    let l: DietEntry[] = [rice, eggs];
    let n = 0;
    for (const [id, to, move] of [['a', yday, true], ['b', today, false], ['a', today, true], ['b', '2026-11-05', true]] as const) {
      const before = l.length;
      const r = copyEaten(l, id, to, today, `n${++n}`, move);
      if (r.error) { expect(r.list).toEqual(l); continue; }
      expect(r.list).toHaveLength(before + (move ? 0 : 1));
      l = r.list;
      expect(new Set(l.map(e => e.id)).size).toBe(l.length);
    }
    // Rice and Eggs (one moved twice, one copied then moved) still add up: 2 Rice-or-Eggs foods plus the one copy
    expect(l.map(e => e.n).sort()).toEqual(['Eggs', 'Eggs', 'Rice']);
  });
});

describe('refusals leave the list as it was', () => {
  const same = (r: { list: DietEntry[] }, l: DietEntry[]) => expect(r.list).toEqual(l);
  it('the same day', () => {
    const r = copyEaten([rice], 'a', today, today, 'n1', true);
    expect(r.error).toBe('Pick another day.'); expect(r.id).toBeNull(); same(r, [rice]);
  });
  it('a day ahead (target)', () => {
    const r = copyEaten([rice], 'a', '2026-11-13', today, 'n1', false);
    expect(r.error).toBe('Pick today or an earlier day.'); same(r, [rice]);
  });
  it('a source on a future day', () => {
    const f = { ...rice, d: '2026-11-14' };
    expect(copyError(f, today, today)).toBe('Only food you ate can move or copy.');
    same(copyEaten([f], 'a', today, today, 'n1', true), [f]);
  });
  it('a day too far back, and a bad date', () => {
    expect(copyEaten([rice], 'a', '2020-01-01', today, 'n1', false).error).toMatch(/too far back/);
    expect(copyEaten([rice], 'a', 'nope', today, 'n1', false).error).toBe('Pick a day.');
  });
  it('a full target day: the store sentence, nothing moves', () => {
    const full = Array.from({ length: 20 }, (_, i): DietEntry => ({ id: `f${i}`, d: yday, n: 'X', kcal: 100, p: 1 }));
    const l = [rice, ...full];
    const r = copyEaten(l, 'a', yday, today, 'n1', true);
    expect(r.error).toBe('You can log 20 things a day.'); same(r, l);
    expect(entriesOn(r.list, today)).toHaveLength(1);
  });
  it('a missing entry', () => {
    expect(copyEaten([rice], 'zz', yday, today, 'n1', false).error).toBe('That entry is gone.');
  });
});

describe('eatenTargets', () => {
  const days = ['2026-11-10', yday, today, '2026-11-13'].map(id => ({ id, label: id }));
  it('past days and today, not its own day, not a day ahead', () => {
    expect(eatenTargets(rice, today, days).map(d => d.id)).toEqual(['2026-11-10', yday]);
    expect(eatenTargets(eggs, today, days).map(d => d.id)).toEqual(['2026-11-10', today]);
  });
  it('none for a source on a future day', () => {
    expect(eatenTargets({ d: '2026-11-13' }, today, days)).toEqual([]);
  });
});
