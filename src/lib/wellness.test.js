import { describe, it, expect } from 'vitest';
import { DEFAULT_STRETCHES, normStretches, normStretchWeek, groupsOf, dayTally, weekDaysDone, weekDaysCounted, withoutStretch, newStretchId } from './stretches.js';
import { goalFor, boostOz, normSupplements, sumOz, cupsOf, validOz, lastDays } from './water.js';
import { ymd } from '../shared/dates.js';

describe('stretch routine', () => {
  it('starts as the default routine and groups it by tier', () => {
    const d = normStretches(null);
    expect(d.items).toEqual(DEFAULT_STRETCHES);
    expect(groupsOf(d.items, 'primary').map(g => g.name)).toEqual(['Bands', 'Back', 'Squatting', 'Standing']);
    expect(groupsOf(d.items, 'secondary').map(g => g.name)).toEqual(['On stomach', 'Squatting', 'Standing']);
    expect(d.items.filter(i => i.tier === '').length).toBeGreaterThan(0);
  });
  it('an emptied library stays empty, and bad rows are dropped', () => {
    expect(normStretches({ items: [] }).items).toEqual([]);
    const d = normStretches({ items: [{ id: 'a', n: 'A', tier: 'primary', url: 'javascript:x' }, { id: 'a', n: 'dup' }, { n: 'no id' }, null] });
    expect(d.items).toEqual([{ id: 'a', n: 'A', group: 'Other', tier: 'primary' }]);
  });
  it('counts a day done when every daily stretch and added one is ticked', () => {
    const items = [{ id: 'a', n: 'A', group: 'G', tier: 'primary' }, { id: 'b', n: 'B', group: 'G', tier: 'primary' }, { id: 'c', n: 'C', group: 'G', tier: 'secondary' }];
    const w = normStretchWeek({ done: { '0:a': true, '0:b': true, '1:a': true }, extra: [{ id: 'x', day: 1, n: 'X' }] });
    expect(dayTally(items, w, 0)).toEqual({ done: 2, total: 2, full: true });
    expect(dayTally(items, w, 1)).toEqual({ done: 1, total: 3, full: false });
    expect(weekDaysDone(items, w)).toBe(1);
    expect(withoutStretch(w, 'a').done).toEqual({ '0:b': true });
    // A skipped day has nothing to do and isn't counted against the week.
    const sk = { ...w, skipped: { 1: true } };
    expect(dayTally(items, sk, 1)).toMatchObject({ total: 0, full: false, skipped: true });
    expect(weekDaysCounted(sk)).toBe(6);
  });
  it('makes unique ids and drops junk check-offs', () => {
    expect(newStretchId([{ id: 'wall-angels' }], 'Wall Angels')).toBe('wall-angels-2');
    expect(normStretchWeek({ done: { '9:a': true, '2:a': false, '3:a': true }, skipped: { 8: true, 2: true }, extra: [{ id: 'x', day: 7, n: 'X' }] })).toEqual({ done: { '3:a': true }, skipped: { 2: true }, extra: [] });
  });
});

describe('water goal', () => {
  const body = [{ wk: '2026-09-27', d: '2026-09-30', w: 180 }, { wk: '2026-10-04', d: '2026-10-05', w: 176 }];
  it('is half the body weight logged on or before the day, and falls back when none', () => {
    const s = normSupplements(null);
    expect(goalFor(s, body, '2026-10-01')).toMatchObject({ oz: 90, source: 'weight', lb: 180 });
    expect(goalFor(s, body, '2026-10-06')).toMatchObject({ oz: 88 });
    expect(goalFor(s, body, '2026-09-01').oz).toBe(90); // before any weigh-in: the earliest one
    expect(goalFor(s, [], '2026-10-01')).toMatchObject({ oz: 64, source: 'default' });
    expect(goalFor({ ...s, waterMode: 'fixed', waterGoal: 100 }, body, '2026-10-01')).toMatchObject({ oz: 100, source: 'fixed' });
  });
});

describe('water goal boosts', () => {
  const body = [{ wk: '2026-09-27', d: '2026-09-30', w: 180 }];
  it('adds 16 oz for a hot day and 12 oz per 30 minutes of training', () => {
    expect(boostOz({ hot: true, mins: 90 })).toEqual({ hot: 16, train: 36, oz: 52 });
    expect(boostOz(undefined).oz).toBe(0);
    const s = normSupplements({ boost: { '2026-10-01': { hot: true, mins: 60 } } });
    expect(goalFor(s, body, '2026-10-01')).toMatchObject({ baseOz: 90, oz: 130 });
    expect(goalFor(s, body, '2026-10-02').oz).toBe(90); // other days are untouched
  });
  it('drops bad boost entries when cleaning a doc', () => {
    expect(normSupplements({ boost: { '2026-10-01': { hot: 'yes', mins: 9999 }, '2026-10-02': { mins: 45.4 }, bad: { hot: true } } }).boost).toEqual({ '2026-10-02': { mins: 45 } });
  });
});

describe('water', () => {
  it('sums ounces and converts to cups', () => {
    expect(sumOz([16.9, 8, 32])).toBe(56.9);
    expect(cupsOf(20)).toBe(2.5);
    expect(validOz(0)).toBe(false); expect(validOz(500)).toBe(false); expect(validOz(16.9)).toBe(true);
  });
  it('cleans a saved doc and defaults the goal to 64 oz', () => {
    expect(normSupplements(null)).toEqual({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, items: [], taken: {} });
    expect(normSupplements({ waterGoal: 1, water: { '2026-10-01': [8, -2, 'x', 12], bad: [8], '2026-10-02': [] } })).toEqual({ waterGoal: 64, waterMode: 'weight', water: { '2026-10-01': [8, 12] }, boost: {}, items: [], taken: {} });
  });
  it('lists the last days oldest first', () => {
    const r = lastDays({ '2026-10-04': [8, 8] }, new Date(2026, 9, 4), 3, ymd);
    expect(r.map(x => x.d)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04']);
    expect(r[2].oz).toBe(16);
  });
});

describe('supplement library', () => {
  it('keeps items with a section or library-only, drops junk, and reads the older schedule shape', async () => {
    const { normItems, scheduleOf, normTaken, slotTally } = await import('./supplements.js');
    const items = normItems({ items: [{ id: 'a', n: 'Vitamin D', dose: '2000 IU', slot: 'morning' }, { id: 'a', n: 'dup' }, { n: 'no id' }, { id: 'b', n: 'Creatine', slot: 'lunch' }, { id: 'c', n: 'Zinc', slot: 'night', note: 'with food' }] });
    expect(items).toEqual([{ id: 'a', n: 'Vitamin D', slot: 'morning', dose: '2000 IU' }, { id: 'b', n: 'Creatine', slot: '' }, { id: 'c', n: 'Zinc', slot: 'night', note: 'with food' }]);
    expect(Object.keys(scheduleOf(items))).toEqual(['morning', 'noon', 'night']);
    expect(normItems({ schedule: { morning: [{ id: 'a', n: 'D' }], night: [{ id: 'z', n: 'Z' }] } }).map(i => [i.id, i.slot])).toEqual([['a', 'morning'], ['z', 'night']]);
    const taken = normTaken({ '2026-10-04': { a: true, b: false }, bad: { a: true }, '2026-10-05': {} });
    expect(taken).toEqual({ '2026-10-04': { a: true } });
    expect(slotTally(items, taken, '2026-10-04', 'morning')).toEqual({ done: 1, total: 1, full: true });
    expect(slotTally(items, taken, '2026-10-05', 'noon')).toEqual({ done: 0, total: 0, full: false });
  });
});
