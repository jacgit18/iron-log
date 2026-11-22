import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { entriesOn } from './dietLog.js';
import { copyEaten, copyEatenMany, copyError, eatenTargets } from './moveCopyEaten.js';

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
  it('the meal s travels with a copy and a move', () => {
    const placed = { ...rice, s: 'dinner' as const };
    const r = copyEaten([placed, eggs], 'a', yday, today, 'n1', false);
    expect(r.list.find(e => e.id === 'n1')).toMatchObject({ s: 'dinner' });
    const m = copyEaten([placed, eggs], 'a', yday, today, 'n2', true);
    expect(m.list.find(e => e.id === 'n2')).toMatchObject({ s: 'dinner' });
  });
  it('the stored portion x travels with a copy and a move', () => {
    const eaten = { ...rice, x: 2.5 };
    expect(copyEaten([eaten], 'a', yday, today, 'n1', false).list.find(e => e.id === 'n1')?.x).toBe(2.5);
    expect(copyEaten([eaten], 'a', yday, today, 'n1', true).list.find(e => e.id === 'n1')?.x).toBe(2.5);
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

describe('copyEatenMany', () => {
  const ids = () => { let n = 0; return (_taken: DietEntry[]) => `n${++n}`; };
  const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
  it('copies one entry to several earlier days: one per day, the original stays, hour and micronutrients carried', () => {
    const r = copyEatenMany([rice, eggs], 'a', [day(11), day(10), day(9)], today, ids(), false);
    expect(r.error).toBeNull();
    expect(r.copied.map(c => c.day)).toEqual([day(11), day(10), day(9)]);
    for (const c of r.copied) expect(r.list.find(e => e.id === c.id)).toEqual({ ...rice, id: c.id, d: c.day });
    expect(r.list.find(e => e.id === 'a')).toEqual(rice);
    expect(r.list).toHaveLength(5);
    expect(new Set(r.list.map(e => e.id)).size).toBe(5);
  });
  it('skips a full day and the own day, names them, and still copies the rest', () => {
    const full = Array.from({ length: 20 }, (_, i): DietEntry => ({ id: `f${i}`, d: day(10), n: 'X', kcal: 1, p: 1 }));
    const r = copyEatenMany([rice, ...full], 'a', [day(10), day(12), day(9)], today, ids(), false);
    expect(r.copied.map(c => c.day)).toEqual([day(9)]);
    expect(r.skipped).toEqual([{ day: day(10), reason: 'full' }, { day: day(12), reason: 'its own day' }]);
    expect(entriesOn(r.list, day(10))).toHaveLength(20);
  });
  const recipes = [{ id: 'r1', kcal: 200 }];
  it('a day ahead becomes a plan card for the recipe, with no meal guessed from the logged hour, and adds no log entry', () => {
    const r = copyEatenMany([rice], 'a', [day(13), day(14)], today, ids(), false, recipes);
    expect(r.planAdds).toEqual([{ day: day(13), item: { k: 'r', id: 'r1' } }, { day: day(14), item: { k: 'r', id: 'r1' } }]);
    expect(r.copied).toEqual([]);
    expect(r.list).toEqual([rice]);
    expect(r.error).toBeNull();
  });
  it('keeps the portion the calories suggest, and skips a recipe that is gone', () => {
    const two = { ...rice, kcal: 400 };
    expect(copyEatenMany([two], 'a', [day(13)], today, ids(), false, recipes).planAdds[0]!.item).toEqual({ k: 'r', id: 'r1', x: 2 });
    const stored = { ...rice, kcal: 400, x: 1.5 }; // calories would say 2; the stored portion wins
    expect(copyEatenMany([stored], 'a', [day(13)], today, ids(), false, recipes).planAdds[0]!.item).toEqual({ k: 'r', id: 'r1', x: 1.5 });
    expect(copyEatenMany([{ ...rice, x: 1 }], 'a', [day(13)], today, ids(), false, recipes).planAdds[0]!.item).toEqual({ k: 'r', id: 'r1' });
    const gone = copyEatenMany([rice], 'a', [day(13)], today, ids(), true, []);
    expect(gone.skipped).toEqual([{ day: day(13), reason: 'recipe is gone' }]);
    expect(gone.list).toEqual([rice]); // a move that plans nothing keeps the original
    expect(gone.error).toBe('Nothing moved. Skipped Fri 13: recipe is gone.');
  });
  it('names why an old or malformed day is skipped', () => {
    const r = copyEatenMany([rice, { ...eggs, d: today }], 'a', ['2020-01-01', '2026-02-30', day(10)], today, ids(), false);
    expect(r.skipped).toEqual([{ day: '2020-01-01', reason: 'too far back' }, { day: '2026-02-30', reason: 'not a day' }]);
    expect(r.copied).toHaveLength(1);
  });
  it('a one-off food or a day beyond today + 364 is skipped, not planned', () => {
    const oneOff: DietEntry = { id: 'o', d: today, n: 'Bar', kcal: 100, p: 3 };
    const a = copyEatenMany([oneOff], 'o', [day(13)], today, ids(), false);
    expect(a.skipped).toEqual([{ day: day(13), reason: 'one-off food' }]);
    expect(a.error).toBe('Nothing copied. Skipped Fri 13: one-off food.');
    const b = copyEatenMany([rice], 'a', ['2027-11-11', '2027-11-12'], today, ids(), false, recipes);
    expect(b.skipped).toEqual([{ day: '2027-11-12', reason: 'out of reach' }]);
    expect(b.planAdds.map(p => p.day)).toEqual(['2027-11-11']);
  });
  it('a fully refused batch returns the list unchanged with an error', () => {
    const list = [rice, eggs];
    for (const r of [copyEatenMany(list, 'zz', [day(10)], today, ids(), false), copyEatenMany(list, 'a', [], today, ids(), false), copyEatenMany(list, 'a', [today], today, ids(), false), copyEatenMany(list, 'a', ['2020-01-01'], today, ids(), false)]) {
      expect(r.error).toBeTruthy();
      expect(r.list).toEqual(list);
      expect(r.copied).toEqual([]);
    }
    expect(copyEatenMany([{ ...rice, d: day(20) }], 'a', [day(10)], today, ids(), false).error).toBe('Only food you ate can move or copy.');
  });
  it('a move takes exactly one day and drops the original once', () => {
    expect(copyEatenMany([rice], 'a', [day(10), day(9)], today, ids(), true).error).toBe('Move takes one day.');
    const r = copyEatenMany([rice, eggs], 'a', [day(10)], today, ids(), true);
    expect(sorted(r.list)).toEqual(['b', 'n1']);
  });
  it('a move to a day ahead removes the original and returns the plan card', () => {
    const r = copyEatenMany([rice], 'a', [day(15)], today, ids(), true, recipes);
    expect(r.list).toEqual([]);
    expect(r.planAdds).toHaveLength(1);
  });
  it('repeated days are copied once', () => {
    expect(copyEatenMany([rice], 'a', [day(10), day(10)], today, ids(), false).copied).toHaveLength(1);
  });
});
