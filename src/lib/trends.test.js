import { describe, it, expect, afterEach, vi } from 'vitest';
import { DEFAULT_CFG } from './logic.js';
import { weekSummary, trendWeeks, setsByWeek, muscleWeeks, weightChanges, niceStep, mdLabel, entryWeek } from './trends.js';

const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });
// A small program so every number can be checked by hand:
// Day 1: a (single), b (superset of 2)   Day 2: c (single)   Day 3: d (either/or)   Days 4–6: empty
const prog = key => ({ key, days: [
  { slots: [{ id: 'a', items: [{ ex: 'hack' }] }, { id: 'b', type: 'superset', items: [{ ex: 'hipthrust' }, { ex: 'chestpress' }] }] },
  { slots: [{ id: 'c', items: [{ ex: 'legext' }] }] },
  { slots: [{ id: 'd', type: 'either', items: [{ ex: 'farmers' }, { ex: 'dblunge' }] }] },
  { slots: [] }, { slots: [] }, { slots: [] },
] });
const programs = { A: prog('A'), B: prog('B') };

describe('weekSummary: the weekly history row', () => {
  const w = { done: { a: true, 'b#0': true, d: true }, skipped: { c: true }, moved: {} };

  it('counts experiment cards added to the week', () => {
    const x = { done: { 'X-1': true }, skipped: {}, moved: {}, extra: [{ id: 'X-1', day: 2, ex: 'legext', ph: null }] };
    const r = weekSummary(cfg(), programs, '2026-09-20', x);
    expect(r).toMatchObject({ ex: 1, total: 6 });
    expect(r.days[1]).toBe(1); // Day 2: c open, X-1 done
  });

  it('follows a swapped day order', () => {
    // Workouts 1 and 2 swapped: the day-1 cards (a, b) sit in column 2, the day-2 card (c) in column 1.
    const r = weekSummary(cfg(), programs, '2026-09-20', { done: { a: true, 'b#0': true, 'b#1': true }, skipped: {}, moved: {}, order: [2, 1, 3, 4, 5, 6, 7] });
    expect(r.days).toEqual([0, 2, 0, 0, 0, 0, 0]);
    expect(r.full).toBe(1);
  });
  it('marks each day complete, partly done or not started, and counts exercises', () => {
    const r = weekSummary(cfg(), programs, '2026-09-20', w);
    expect(r.days).toEqual([1, 0, 2, 0, 0, 0, 0]); // day 1 half done, day 2 only a skipped card, day 3 complete
    expect(r).toMatchObject({ key: '2026-09-20', pk: 'A', full: 1, ex: 3, total: 4, skipped: 1 });
  });
  it('counts a moved card on the day it was moved to', () => {
    const r = weekSummary(cfg(), programs, '2026-09-20', { ...w, moved: { d: 1 } });
    expect(r.days).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(r.full).toBe(0);
  });
  it('uses the program that week ran', () => {
    expect(weekSummary(cfg({ mode: 2, m2Even: 'A' }), programs, '2026-09-20', w).pk).toBe('B'); // September: odd month
    expect(weekSummary(cfg({ mode: 2, m2Even: 'A' }), programs, '2026-09-20', { ...w, prog: 'A' }).pk).toBe('A'); // switched that week
    expect(weekSummary(cfg({ mode: 1 }), programs, '2026-09-20', { ...w, prog: 'B' }).pk).toBe('A'); // mode 1 is always A
  });
  it('leaves the rest day as not started and shifts later workouts one day', () => {
    // Rest on day 2: a, b stay on day 1; c (planned day 2) shows on day 3; d (planned day 3) on day 4.
    const r = weekSummary(cfg(), programs, '2026-09-20', { done: { a: true, 'b#0': true, 'b#1': true, c: true }, skipped: {}, moved: {}, rest: 2 });
    expect(r.days).toEqual([2, 0, 2, 0, 0, 0, 0]);
    expect(r.full).toBe(2);
    expect(r).toMatchObject({ ex: 4, total: 5 }); // the rest day adds no exercises
  });
  it('does not count a rest Day 7 as complete', () => {
    const w7 = { done: {}, skipped: {}, moved: { c: 7 }, rest: 7 };
    expect(weekSummary(cfg(), programs, '2026-09-20', { ...w7, moved: {} }).days[6]).toBe(0);
  });
  it('reads 6 days with an empty, non-rest Day 7', () => {
    const all = { done: { a: true, 'b#0': true, 'b#1': true, c: true, d: true }, skipped: {}, moved: {} };
    expect(weekSummary(cfg(), programs, '2026-09-20', all).days).toEqual([2, 2, 2, 0, 0, 0, 0]);
  });
  it('an empty week has nothing done', () => {
    expect(weekSummary(cfg(), programs, '2026-09-20', { done: {}, moved: {} })).toMatchObject({ days: [0, 0, 0, 0, 0, 0, 0], full: 0, ex: 0, total: 5, skipped: 0 });
  });
});

describe('trendWeeks: which weeks the charts show', () => {
  afterEach(() => vi.useRealTimers());
  const today = () => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 30, 12)); }; // Wednesday; the week began Sunday Sep 27

  it('runs from the first logged week to this week', () => {
    today();
    expect(trendWeeks({ hack: [{ d: '2026-09-08' }] }, 12, 2)).toEqual(['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
  });
  it('shows at least the minimum and at most the maximum', () => {
    today();
    expect(trendWeeks({}, 12, 2)).toEqual(['2026-09-20', '2026-09-27']);
    const long = trendWeeks({ hack: [{ d: '2025-01-06' }] }, 8, 2);
    expect(long).toHaveLength(8);
    expect(long[7]).toBe('2026-09-27');
  });
});

describe('sets and sessions per week', () => {
  it('adds up sets and counts sessions in the chosen weeks only', () => {
    const logs = { hack: [{ d: '2026-09-21', s: 4 }, { d: '2026-09-22', s: '3' }, { d: '2026-09-23', s: 0 }], legext: [{ d: '2026-09-14', s: 4 }] };
    expect(setsByWeek(logs, ['2026-09-20'])).toEqual({ '2026-09-20': { sets: 7, sessions: 3 } });
  });
  it('files a session under its saved week, not only its date', () => {
    expect(entryWeek({ d: '2026-09-27', wk: '2026-09-20' })).toBe('2026-09-20');
    expect(entryWeek({ d: '2026-09-27' })).toBe('2026-09-27');
  });
});

describe('muscleWeeks: the heatmap of what you trained', () => {
  const keys = ['2026-09-20'];
  it('counts primary muscles in full and secondary muscles as half', () => {
    const m = muscleWeeks(cfg(), { hack: [{ d: '2026-09-21', s: 4 }] }, keys); // Hack Squat: quads; glutes and adductors secondary
    expect([m.quads['2026-09-20'], m.glutes['2026-09-20'], m.adductors['2026-09-20'], m.chest['2026-09-20']]).toEqual([4, 2, 2, 0]);
  });
  it('leaves out mobility work and untagged exercises, and follows your own tags', () => {
    const logs = { canoe: [{ d: '2026-09-21', s: 3 }], 'my-lift': [{ d: '2026-09-21', s: 3 }], hack: [{ d: '2026-09-21', s: 4 }] };
    const m = muscleWeeks(cfg({ muscleMap: { hack: { p: ['chest'] } } }), logs, keys);
    const total = Object.values(m).reduce((a, byWeek) => a + byWeek['2026-09-20'], 0);
    expect(total).toBe(4);
    expect(m.chest['2026-09-20']).toBe(4);
  });
});

describe('weightChanges: first vs latest weight per lift and phase', () => {
  const logs = {
    hack: [{ d: '2026-09-07', ph: 'hyp', w: 250 }, { d: '2026-09-14', ph: 'hyp', w: 260 }, { d: '2026-09-21', ph: 'hyp', w: 270 }, { d: '2026-08-03', ph: 'hyp', w: 100 }],
    chestpress: [{ d: '2026-09-08', ph: 'strength', w: 40 }, { d: '2026-09-15', ph: 'strength', w: 36 }],
    legext: [{ d: '2026-09-21', ph: 'iso', w: 50 }], // one session: no change to show
    dip: [{ d: '2026-09-21', w: 0 }, { d: '2026-09-22', w: 0 }], // bodyweight: no weight to compare
    arnold: [{ d: '2026-09-21', ph: 'strength', w: 30 }, { d: '2026-09-21', ph: 'strength', w: 35 }], // same day
  };
  it('compares the first and latest session in the window, biggest gain first', () => {
    expect(weightChanges(cfg(), logs, '2026-09-06')).toEqual([
      { id: 'hack', ph: 'hyp', w0: 250, w1: 270, d0: '2026-09-07', d1: '2026-09-21', n: 3, pct: 8 },
      { id: 'chestpress', ph: 'strength', w0: 40, w1: 36, d0: '2026-09-08', d1: '2026-09-15', n: 2, pct: -10 },
    ]);
  });
  it('keeps each phase of a lift apart', () => {
    const two = { hack: [{ d: '2026-09-07', ph: 'hyp', w: 250 }, { d: '2026-09-14', ph: 'strength', w: 300 }, { d: '2026-09-21', ph: 'hyp', w: 260 }, { d: '2026-09-28', ph: 'strength', w: 310 }] };
    expect(weightChanges(cfg(), two, '2026-09-06').map(r => [r.ph, r.w0, r.w1])).toEqual([['hyp', 250, 260], ['strength', 300, 310]]); // +4% before +3.3%
  });
});

describe('chart helpers', () => {
  it('picks a round axis step and short date labels', () => {
    expect([3, 12, 40, 90, 900, 5000].map(niceStep)).toEqual([1, 5, 10, 25, 250, 1000]);
    expect(mdLabel('2026-09-07')).toBe('9/7');
  });
});
