import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseDate } from './dates.js';
import { BUILTIN, slotsFor } from './data.js';
import {
  DEFAULT_CFG, programFor, round, rxOf, progressionOf, stallOf, targetOf, summarizeSets, setsOfEntry, describe as describeEntry,
  isDone, isItemDone, setCardDone, setItemDone, tally, normWeek, defaultLogDate, currentLayout, moveClashes,
  programWeights, bestByPhase, autoLogs, DAYS, shownDay, programDay, dayTitle, restBlocked, overflowSlots, isOrder, orderOf, posOf, colOf, dayAt, altDay, dayDate, todayCol, leftovers, moveTargets, weekSlots, normExperiments,
  dayClash, clashCount, dailyExercises, planOrder, countsForClash, countsForFinish, isFinished, planCard, planFix,
} from './logic.js';

const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });
const single = { id: 's1', day: 1, type: 'single', items: [{ ex: 'hack', ph: 'hyp' }] };
const superset = { id: 's2', day: 1, type: 'superset', items: [{ ex: 'hipthrust', ph: 'strength' }, { ex: 'chestpress', ph: 'hyp' }] };
const either = { id: 's3', day: 2, type: 'either', items: [{ ex: 'farmers', ph: 'strength' }, { ex: 'dblunge', ph: 'strength' }] };

describe('programFor', () => {
  it('mode 1 always runs Program A', () => {
    expect(programFor(cfg({ mode: 1 }), parseDate('2026-07-05'))).toBe('A');
  });
  it('mode 2 alternates by month', () => {
    const c = cfg({ mode: 2, m2Even: 'A' });
    expect(programFor(c, parseDate('2026-02-01'))).toBe('A');
    expect(programFor(c, parseDate('2026-03-01'))).toBe('B');
    expect(programFor(cfg({ mode: 2, m2Even: 'B' }), parseDate('2026-02-01'))).toBe('B');
  });
  it('mode 3 switches every six months from the start month', () => {
    const c = cfg({ mode: 3, m3Start: 4, m3First: 'A' });
    expect(['2026-04-01', '2026-09-30'].map(d => programFor(c, parseDate(d)))).toEqual(['A', 'A']);
    expect(['2026-10-01', '2027-03-31'].map(d => programFor(c, parseDate(d)))).toEqual(['B', 'B']);
  });
});

describe('small helpers', () => {
  it('rounds to 2.5 lb under 50 and 5 lb above', () => {
    expect([21, 22, 48.7, 49, 52, 53].map(round)).toEqual([20, 22.5, 47.5, 50, 50, 55]);
  });
  it('uses the custom prescription only in its own phase', () => {
    const it = { ex: 'zottman', ph: 'hyp', rx: '3 × 15' };
    expect(rxOf(cfg(), it, 'hyp')).toBe('3 × 15');
    expect(rxOf(cfg(), it, 'strength')).toBe('4 × 6');
    expect(rxOf(cfg({ rxOverride: { strength: '5 × 5' } }), it, 'strength')).toBe('5 × 5');
  });
});

describe('sets', () => {
  it('summarizes set by set: heaviest weight, lowest reps', () => {
    const e = summarizeSets([{ w: 100, r: 8 }, { w: 105, r: 6 }, { w: 105, r: 7 }], false);
    expect(e).toMatchObject({ w: 105, s: 3, r: 6 });
    expect(summarizeSets([{ w: null, sec: 30 }, { w: null, sec: 25 }], true)).toMatchObject({ w: null, s: 2, sec: 25 });
  });
  it('expands older summary-only entries into sets', () => {
    expect(setsOfEntry({ w: 50, s: 2, r: 10 })).toEqual([{ w: 50, r: 10 }, { w: 50, r: 10 }]);
    expect(setsOfEntry({ w: '', s: 1, sec: 30 })).toEqual([{ w: null, sec: 30 }]);
  });
  it('describes an entry', () => {
    expect(describeEntry({ w: 270, s: 4, r: 15 })).toBe('270 lb · 4 × 15');
    expect(describeEntry({ w: null, s: 3, sec: 30 })).toBe('bodyweight · 3 × 30s');
  });
});

describe('progression and stalls', () => {
  const item = { ex: 'hack', ph: 'hyp' };
  const e = (d, w, r, wk) => ({ d, ph: 'hyp', w, s: 4, r, wk });

  it('suggests a heavier weight after two full sessions at the target', () => {
    const logs = { hack: [e('2026-09-01', 270, 15), e('2026-09-08', 270, 15)] };
    expect(progressionOf(cfg(), logs, item, 'hyp')).toEqual({ w: 275, from: 270 });
    expect(targetOf(cfg(), logs, item, 'hyp')).toMatchObject({ w: 275, up: true });
    const light = { hack: [e('2026-09-01', 40, 15), e('2026-09-08', 40, 15)] };
    expect(progressionOf(cfg(), light, item, 'hyp').w).toBe(42.5);
  });
  it('does not progress when a set fell short', () => {
    const logs = { hack: [e('2026-09-01', 270, 15), e('2026-09-08', 270, 12)] };
    expect(progressionOf(cfg(), logs, item, 'hyp')).toBeNull();
  });
  it('ignores a 1RM: the target is the last logged weight, else the program weight', () => {
    expect(targetOf(cfg({ rm: { hack: 400 } }), {}, { ...item, w: 270 }, 'hyp')).toEqual({ w: 270, src: 'program' });
    expect(targetOf(cfg({ rm: { hack: 400 } }), { hack: [e('2026-09-01', 255, 12)] }, { ...item, w: 270 }, 'hyp')).toMatchObject({ w: 255, src: 'last session' });
  });
  it('flags a stall over three sessions in two weeks with no gain', () => {
    const logs = { hack: [e('2026-09-01', 270, 12), e('2026-09-03', 270, 12), e('2026-09-08', 270, 12)] };
    expect(stallOf(cfg(), logs, 'hack', 'hyp')).toEqual({ w: 270, since: '2026-09-01', n: 3 });
  });
  it('is not a stall when reps went up or all in one week', () => {
    const more = { hack: [e('2026-09-01', 270, 10), e('2026-09-03', 270, 11), e('2026-09-08', 270, 12)] };
    expect(stallOf(cfg(), more, 'hack', 'hyp')).toBeNull();
    const oneWeek = { hack: [e('2026-09-06', 270, 12), e('2026-09-07', 270, 12), e('2026-09-08', 270, 12)] };
    expect(stallOf(cfg(), oneWeek, 'hack', 'hyp')).toBeNull();
  });
});

describe('done, skipped and totals', () => {
  it('a superset is done when both halves are, and counts each half', () => {
    const w = normWeek(null);
    setItemDone(w, superset, 0, true);
    expect(isDone(superset, w)).toBe(false);
    expect(tally([superset], w)).toMatchObject({ total: 2, done: 1, full: false });
    setItemDone(w, superset, 1, true);
    expect(w.done).toEqual({ s2: true });
    expect(tally([superset], w)).toMatchObject({ total: 2, done: 2, full: true });
    setItemDone(w, superset, 0, false);
    expect(w.done).toEqual({ 's2#1': true });
  });
  it('an either/or card counts once and remembers the pick', () => {
    const w = normWeek(null);
    setItemDone(w, either, 1, true);
    expect(isDone(either, w)).toBe(true);
    expect([isItemDone(either, 0, w), isItemDone(either, 1, w)]).toEqual([false, true]);
    expect(tally([either], w)).toMatchObject({ total: 1, done: 1 });
  });
  it('skipped cards leave the totals, and checking one off un-skips it', () => {
    const w = normWeek({ skipped: { s1: true } });
    expect(tally([single, superset], w)).toMatchObject({ total: 2, done: 0, skipped: 1 });
    setCardDone(w, single, true);
    expect(w.skipped).toEqual({});
    expect(tally([single, superset], w)).toMatchObject({ total: 3, done: 1, skipped: 0 });
  });
});

describe('moving cards', () => {
  it('lays cards out by their moved day', () => {
    const cols = currentLayout(normWeek({ moved: { s1: 5 } }), [single, either]);
    expect(cols[5].map(s => s.id)).toEqual(['s1']);
    expect(cols[2].map(s => s.id)).toEqual(['s3']);
  });
  it('warns when the same exercise lands on the same or a neighboring day', () => {
    const other = { id: 's9', day: 3, type: 'single', items: [{ ex: 'hack', ph: 'hyp' }] };
    const lines = moveClashes(cfg(), normWeek(null), [single, other], single, 2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Hack Squat is also on Day 3.*the day after/);
    expect(moveClashes(cfg(), normWeek({ skipped: { s9: true } }), [single, other], single, 2)).toEqual([]);
  });
});

describe('defaultLogDate', () => {
  afterEach(() => vi.useRealTimers());
  const week = parseDate('2026-09-20'); // Sunday; the week ends Saturday the 26th
  const at = (...t) => { vi.useFakeTimers(); vi.setSystemTime(new Date(...t)); return defaultLogDate(week); };

  it('is today during the viewed week', () => {
    expect(at(2026, 8, 20, 9)).toBe('2026-09-20');
    expect(at(2026, 8, 26, 23, 30)).toBe('2026-09-26');
  });
  it('is today for the whole day after the week ends (regression: stopped at midnight)', () => {
    expect(at(2026, 8, 27, 15)).toBe('2026-09-27');
  });
  it('is the week start for any other week', () => {
    expect(at(2026, 8, 28, 8)).toBe('2026-09-20');
    expect(at(2026, 8, 19, 8)).toBe('2026-09-20');
  });
});

describe('weights per phase for the 1RM table', () => {
  const both = [...slotsFor(BUILTIN.A), ...slotsFor(BUILTIN.B)];
  it('lists each program weight with its phase', () => {
    expect(programWeights(cfg(), both, 'chestpress')).toEqual([{ ph: 'strength', w: 35 }, { ph: 'hyp', w: 25 }]);
    expect(programWeights(cfg(), both, 'hack')).toEqual([{ ph: 'hyp', w: 270 }]);
  });
  it('follows a phase default set for a slot', () => {
    expect(programWeights(cfg({ phDef: { 'A-d1s6:0': 'hyp' } }), slotsFor(BUILTIN.A), 'chestpress')).toEqual([{ ph: 'hyp', w: 25 }, { ph: 'hyp', w: 35 }]);
  });
  it('gives the best logged weight in each phase', () => {
    const L = [{ d: '1', ph: 'strength', w: 40 }, { d: '2', ph: 'hyp', w: 30 }, { d: '3', ph: 'strength', w: 45 }, { d: '4', w: 20 }, { d: '5', ph: 'hyp', w: '' }];
    expect(bestByPhase(L)).toEqual([{ ph: 'strength', w: 45 }, { ph: 'hyp', w: 30 }, { ph: null, w: 20 }]);
    expect(bestByPhase(undefined)).toEqual([]);
  });
  it('Cable Punch ISO hold starts at 30 lb', () => {
    expect(programWeights(cfg(), slotsFor(BUILTIN.B), 'cablepunch')).toEqual([{ ph: 'iso', w: 30 }]);
  });
});

describe('check-offs log the planned numbers', () => {
  const slots = slotsFor(BUILTIN.A);
  const run = (logs, before, after) => autoLogs(cfg(), logs, slots, normWeek(before), normWeek(after), '2026-09-20', '2026-09-22');

  it('logs the card’s target when an exercise is checked off', () => {
    const out = run({}, {}, { done: { 'A-d3s1': true } });
    expect(out.hack).toEqual([{ id: expect.stringMatching(/^L/), d: '2026-09-22', ph: 'hyp', w: 270, s: 4, r: 15, sets: Array(4).fill({ w: 270, r: 15 }), slot: 'A-d3s1', wk: '2026-09-20', auto: true }]);
  });
  it('logs each half of a superset as it is checked', () => {
    const one = run({}, {}, { done: { 'A-d2s5#1': true } });
    expect(Object.keys(one)).toEqual(['chestpress']);
    const both = run({}, {}, { done: { 'A-d2s5': true } });
    expect(Object.keys(both).sort()).toEqual(['chestpress', 'hipthrust']);
    expect(both.hipthrust[0]).toMatchObject({ ph: 'strength', w: 320, s: 4, r: 6 });
  });
  it('does not log over a session already logged for that card this week', () => {
    const logs = { hack: [{ d: '2026-09-21', ph: 'hyp', w: 275, s: 4, r: 12, slot: 'A-d3s1', wk: '2026-09-20' }] };
    expect(run(logs, {}, { done: { 'A-d3s1': true } })).toEqual({});
  });
  it('removes only its own entry when unchecked', () => {
    const real = { d: '2026-09-13', ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk: '2026-09-13' };
    const auto = { d: '2026-09-22', ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk: '2026-09-20', auto: true };
    expect(run({ hack: [real, auto] }, { done: { 'A-d3s1': true } }, {})).toEqual({ hack: [real] });
    const realThisWeek = { ...real, d: '2026-09-21', wk: '2026-09-20' };
    expect(run({ hack: [realThisWeek] }, { done: { 'A-d3s1': true } }, {})).toEqual({}); // what you logged stays
  });
  it('does not raise the suggested weight or flag a stall on check-offs alone', () => {
    const a = (d, wk) => ({ d, ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk, auto: true });
    const logs = { hack: [a('2026-09-01', '2026-08-30'), a('2026-09-08', '2026-09-06'), a('2026-09-15', '2026-09-13')] };
    expect(targetOf(cfg(), logs, { ex: 'hack', ph: 'hyp' }, 'hyp')).toEqual({ w: 270, src: 'last session' });
    expect(stallOf(cfg(), logs, 'hack', 'hyp')).toBeNull();
  });
});

describe('rest day layout', () => {
  const sl = (id, day) => ({ id, day, type: 'single', items: [{ ex: 'hack' }] });
  const slots = [sl('a', 1), sl('b', 3), sl('c', 6)];
  const ids = cols => Object.fromEntries(Object.entries(cols).map(([d, l]) => [d, l.map(s => s.id)]));

  it('maps program days to displayed days around the rest position', () => {
    expect(DAYS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([1, 2, 3, 4, 5, 6].map(d => shownDay([3], d))).toEqual([1, 2, 4, 5, 6, 7]);
    expect(DAYS.map(d => programDay([3], d))).toEqual([1, 2, null, 3, 4, 5, 6]);
    expect(shownDay(null, 4)).toBe(4);
    expect(programDay(undefined, 4)).toBe(4);
    expect([1, 2, 3, 4, 5].map(d => shownDay([2, 4], d))).toEqual([1, 3, 5, 6, 7]);
    expect(DAYS.map(d => programDay([2, 4], d))).toEqual([1, null, 2, null, 3, 4, 5]);
    expect(shownDay([7], 7)).toBe(8); // off the board
  });
  it('lays the week out with no rest day', () => {
    expect(ids(currentLayout({ moved: {} }, slots))).toEqual({ 1: ['a'], 2: [], 3: ['b'], 4: [], 5: [], 6: ['c'], 7: [] });
  });
  it('inserts an empty rest column and shifts later workouts one day', () => {
    expect(ids(currentLayout({ moved: {}, rest: 3 }, slots))).toEqual({ 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: ['c'] });
  });
  it('lays out several rest days', () => {
    expect(ids(currentLayout({ moved: {}, rest: [2, 5] }, [sl('a', 1), sl('b', 3), sl('c', 5)]))).toEqual({ 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: ['c'] });
  });
  it('with rest on Day 7 a day-7 slot is pushed off the board', () => {
    expect(ids(currentLayout({ moved: {}, rest: 7 }, [sl('a', 1), sl('d', 7)]))).toEqual({ 1: ['a'], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] });
  });
  it('shifts moved cards too', () => {
    expect(ids(currentLayout({ moved: { a: 5 }, rest: 3 }, slots))[6]).toEqual(['a']);
  });
  it('hides a card that falls off the end', () => {
    const cols = currentLayout({ moved: {}, rest: 2 }, [...slots, sl('d', 7)]);
    expect(cols[7].map(s => s.id)).toEqual(['c']);
  });
  it('a second rest day is blocked only by workouts it would push off, and skipped ones do not count', () => {
    const six = [sl('a', 1), sl('b', 2), sl('c', 3), sl('d', 4), sl('e', 5), sl('f', 6)];
    expect(overflowSlots({ moved: {}, rest: [3] }, six, 5).map(s => s.id)).toEqual(['f']);
    expect(restBlocked({ moved: {}, rest: [3] }, six, 5)).toBe(true);
    expect(restBlocked({ moved: {}, rest: [3], skipped: { f: true } }, six, 5)).toBe(false);
    expect(restBlocked({ moved: {}, rest: [3] }, six.slice(0, 5), 5)).toBe(false);
  });
  it('blocks a rest day when a card sits on program day 7', () => {
    expect(restBlocked({ moved: {} }, slots)).toBe(false);
    expect(restBlocked({ moved: {} }, [...slots, sl('d', 7)])).toBe(true);
    expect(restBlocked({ moved: { c: 7 } }, slots)).toBe(true);
  });
  it('titles a day by its position, keeping custom titles', () => {
    expect(dayTitle({ title: 'Day 4' }, 5)).toBe('Day 5');
    expect(dayTitle({}, 2)).toBe('Day 2');
    expect(dayTitle({ title: 'Leg day' }, 2)).toBe('Leg day');
  });
  it('normWeek keeps a valid rest day and drops anything else', () => {
    expect(normWeek({ rest: 3 }).rest).toEqual([3]);
    expect(normWeek({ rest: [5, 2, 2, 9, 'x'] }).rest).toEqual([2, 5]);
    expect(normWeek({ rest: '3' }).rest).toEqual([3]);
    ['x', 0, 8, null, undefined, 2.5].forEach(v => expect(normWeek({ rest: v })).not.toHaveProperty('rest'));
    expect(normWeek(null)).not.toHaveProperty('rest');
  });
});

describe('swapped day order', () => {
  const sl = (id, day) => ({ id, day, type: 'single', items: [{ ex: 'hack' }] });
  const slots = [sl('a', 1), sl('b', 3), sl('c', 6)];
  const ids = cols => Object.fromEntries(Object.entries(cols).map(([d, l]) => [d, l.map(s => s.id)]));

  it('isOrder accepts only a clean permutation of 1..7', () => {
    expect(isOrder([1, 2, 3, 4, 5, 6, 7])).toBe(true);
    expect(isOrder([2, 1, 3, 4, 5, 7, 6])).toBe(true);
    [null, undefined, 'x', [], [1, 2, 3], [1, 1, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 8], ['1', '2', '3', '4', '5', '6', '7'], [1, 2, 3, 4, 5, 6, 7, 8], [1.5, 2, 3, 4, 5, 6, 7]]
      .forEach(v => expect(isOrder(v), JSON.stringify(v)).toBe(false));
  });
  it('orderOf falls back to the normal order when the week has none or an invalid one', () => {
    expect(orderOf({})).toEqual(DAYS);
    expect(orderOf({ order: [1, 1, 3, 4, 5, 6, 7] })).toEqual(DAYS);
    expect(orderOf({ order: [2, 1, 3, 4, 5, 6, 7] })).toEqual([2, 1, 3, 4, 5, 6, 7]);
  });
  it('swapping the last two days puts the Day 6 workout in column 7', () => {
    const w = { moved: {}, order: [1, 2, 3, 4, 5, 7, 6] };
    expect(ids(currentLayout(w, slots))).toEqual({ 1: ['a'], 2: [], 3: ['b'], 4: [], 5: [], 6: [], 7: ['c'] });
  });
  it('combines an order with a rest day', () => {
    // order swaps workouts 1 and 2; rest at column 3 shifts later workouts one column.
    const w = { moved: {}, order: [2, 1, 3, 4, 5, 6, 7], rest: 3 };
    expect(ids(currentLayout(w, slots))).toEqual({ 1: [], 2: ['a'], 3: [], 4: ['b'], 5: [], 6: [], 7: ['c'] });
  });
  it('puts a moved card with the workout it was moved to', () => {
    const w = { moved: { a: 3 }, order: [2, 1, 3, 4, 5, 6, 7] };
    expect(ids(currentLayout(w, slots))[3]).toEqual(['a', 'b']);
  });
  it('colOf and dayAt are inverses, and dayAt is null on the rest column', () => {
    const w = { order: [2, 1, 3, 4, 5, 6, 7], rest: 3 };
    expect(posOf(w, 1)).toBe(2);
    expect(colOf(w, 1)).toBe(2);
    expect(colOf(w, 3)).toBe(4);
    expect(dayAt(w, 2)).toBe(1);
    expect(dayAt(w, 3)).toBeNull();
    expect(dayAt(w, 4)).toBe(3);
    expect(dayAt({}, 5)).toBe(5);
  });
  it('restBlocked looks at the last workout position', () => {
    expect(restBlocked({ moved: {} }, slots)).toBe(false);
    expect(restBlocked({ moved: {}, order: [1, 2, 3, 4, 5, 7, 6] }, slots)).toBe(true); // the Day 6 workout now sits last
    expect(restBlocked({ moved: {}, order: [1, 2, 3, 4, 5, 7, 6] }, [sl('d', 7)])).toBe(false); // workout 7 now sits at position 6, so it does not block
  });
  it('normWeek keeps a valid non-identity order and drops anything else', () => {
    expect(normWeek({ order: [2, 1, 3, 4, 5, 6, 7] }).order).toEqual([2, 1, 3, 4, 5, 6, 7]);
    expect(normWeek({ order: [1, 2, 3, 4, 5, 6, 7] })).not.toHaveProperty('order');
    [[1, 1, 3, 4, 5, 6, 7], [1, 2, 3], 'x', null, ['1', '2', '3', '4', '5', '6', '7']].forEach(v => expect(normWeek({ order: v })).not.toHaveProperty('order'));
    expect(normWeek(null)).not.toHaveProperty('order');
    const src = [2, 1, 3, 4, 5, 6, 7]; const out = normWeek({ order: src }).order; out[0] = 9;
    expect(src[0]).toBe(2);
  });
});

describe('altDay: the nearest day a moved card would not clash', () => {
  const mk = (id, day) => ({ id, day, type: 'single', items: [{ ex: 'hack', ph: 'hyp' }] });
  const other = (id, day) => ({ id, day, type: 'single', items: [{ ex: 'legext', ph: 'hyp' }] });
  const c = cfg();
  it('picks the nearest clash-free day, the later one on a tie', () => {
    // Hack is already on Day 4; the moved card (home Day 7) was dropped on Day 4 too.
    const slots = [mk('a', 4), mk('x', 7)];
    const w = normWeek({ moved: { x: 4 } });
    expect(altDay(c, w, slots, slots[1], 4, 7)).toBe(6); // Days 3 and 5 sit next to Day 4; 6 and 2 tie, 6 wins
  });
  it('skips the day the card came from', () => {
    const slots = [mk('a', 4), mk('x', 6)];
    expect(altDay(c, normWeek({ moved: { x: 4 } }), slots, slots[1], 4, 6)).toBe(2);
  });
  it('skips the rest day', () => {
    const slots = [mk('a', 4), mk('x', 7)];
    expect(altDay(c, normWeek({ moved: { x: 4 }, rest: 6 }), slots, slots[1], 4, 7)).toBe(2);
  });
  it('ignores other exercises and skipped cards', () => {
    const slots = [mk('a', 1), other('b', 3), mk('s', 3), mk('x', 7)];
    const w = normWeek({ moved: { x: 2 }, skipped: { s: true } });
    expect(altDay(c, w, slots, slots[3], 2, 7)).toBe(3); // Day 3 only has a different exercise and a skipped Hack
  });
  it('is null when every other day clashes', () => {
    // Leg Extension on Days 2, 4 and 6, so Hack is not on every workout day (that would make it never clash).
    const slots = [mk('a', 1), mk('b', 3), mk('c', 5), mk('d', 7), other('o2', 2), other('o4', 4), other('o6', 6), mk('x', 2)];
    expect(altDay(c, normWeek({ moved: { x: 4 } }), slots, slots[7], 4, 2)).toBeNull();
  });
});

describe('stray moved values', () => {
  const mk = id => ({ id, day: 2, type: 'single', items: [{ ex: 'hack', ph: 'hyp' }] });
  it.each([9, 0])('currentLayout copes with moved %s', v => {
    const cols = currentLayout({ moved: { a: v } }, [mk('a')]);
    const at = Object.keys(cols).filter(c => cols[c].some(s => s.id === 'a'));
    expect(at.length).toBe(1);
    expect(+at[0]).toBeGreaterThanOrEqual(1); expect(+at[0]).toBeLessThanOrEqual(7);
  });
  it('normWeek keeps only moved days 1..7', () => {
    expect(normWeek({ moved: { a: 3, b: 9, c: '4', d: 'x' } }).moved).toEqual({ a: 3, c: 4 });
  });
});

describe('dayDate: the date a board was worked', () => {
  const card = (id, ex) => ({ id, day: 1, type: 'single', items: [{ ex }] });
  const a = card('a', 'hack'), b = card('b', 'legext');
  const WK = '2026-09-27';
  const entry = (slot, d, extra = {}) => ({ d, slot, wk: WK, w: 100, s: 3, r: 5, ...extra });

  it('is null when nothing is logged', () => {
    expect(dayDate([a, b], {}, WK)).toBeNull();
    expect(dayDate([], { hack: [entry('a', '2026-09-29')] }, WK)).toBeNull();
  });
  it('is the earliest date among the cards in the column', () => {
    const logs = { hack: [entry('a', '2026-09-30')], legext: [entry('b', '2026-09-29')] };
    expect(dayDate([a, b], logs, WK)).toBe('2026-09-29');
  });
  it('ignores other weeks and cards that are not in the column', () => {
    const logs = { hack: [entry('a', '2026-09-22', { wk: '2026-09-20' }), entry('a', '2026-09-30')], legext: [entry('b', '2026-09-28')] };
    expect(dayDate([a], logs, WK)).toBe('2026-09-30');
  });
  it('works out the week from the date when an entry has no week field', () => {
    const e = { d: '2026-09-29', slot: 'a', w: 100, s: 3, r: 5 };
    expect(dayDate([a], { hack: [e] }, WK)).toBe('2026-09-29');
    expect(dayDate([a], { hack: [e] }, '2026-09-20')).toBeNull();
  });
  it('counts hand-logged sessions and every exercise of a pair', () => {
    const pair = { id: 'p', day: 1, type: 'superset', items: [{ ex: 'hack' }, { ex: 'legext' }] };
    expect(dayDate([pair], { legext: [entry('p', '2026-10-01', { auto: undefined })] }, WK)).toBe('2026-10-01');
  });
});

describe('normWeek keeps restOn only with a rest day', () => {
  it('keeps a well-formed restOn alongside a valid rest', () => {
    expect(normWeek({ rest: 3, restOn: '2026-09-29' }).restOn).toBe('2026-09-29');
  });
  it('drops it without a rest day or when malformed', () => {
    expect(normWeek({ restOn: '2026-09-29' })).not.toHaveProperty('restOn');
    expect(normWeek({ rest: 9, restOn: '2026-09-29' })).not.toHaveProperty('restOn');
    ['9/29/2026', '2026-9-29', 20260929, null, '', {}].forEach(v => expect(normWeek({ rest: 3, restOn: v })).not.toHaveProperty('restOn'));
    expect(normWeek(null)).not.toHaveProperty('restOn');
  });
});

describe('yesterday’s leftovers', () => {
  const mk = (id, day, type = 'single', n = 1) => ({ id, day, type, items: Array.from({ length: n }, () => ({ ex: 'hack', ph: 'hyp' })) });
  const slots = [mk('a', 3), mk('b', 3), mk('c', 3), mk('p', 3, 'superset', 2), mk('d', 4)];
  const ids = l => l.map(s => s.id);

  it('todayCol: the week runs Sunday (column 1) to Saturday (column 7)', () => {
    expect(todayCol(parseDate('2026-09-27'))).toBe(1);
    expect(todayCol(parseDate('2026-09-30'))).toBe(4);
    expect(todayCol(parseDate('2026-10-03'))).toBe(7);
  });
  it('counts only cards with nothing checked that are not skipped', () => {
    const w = normWeek({ done: { a: true, 'p#0': true }, skipped: { b: true } });
    expect(ids(leftovers(w, slots, 3))).toEqual(['c']);
    expect(ids(leftovers(normWeek({}), slots, 3))).toEqual(['a', 'b', 'c', 'p']);
  });
  it('follows swapped days and gives nothing on the rest column', () => {
    expect(ids(leftovers(normWeek({ order: [1, 2, 4, 3, 5, 6, 7] }), slots, 3))).toEqual(['d']);
    expect(leftovers(normWeek({ rest: 3 }), slots, 3)).toEqual([]);
  });
  it('moveTargets: later columns that are not finished and not the rest day', () => {
    const w = normWeek({ done: { d: true }, rest: 6 });
    expect(moveTargets(w, slots, 3)).toEqual([5, 7]); // 4 is finished, 6 is the rest day
    expect(moveTargets(normWeek({}), slots, 7)).toEqual([]);
  });
});

describe('experiment cards on a week', () => {
  const prog = { key: 'T', days: [{ slots: [{ id: 'p1', items: [{ ex: 'hack' }] }] }, ...Array.from({ length: 6 }, () => ({ slots: [] }))] };
  const x = { id: 'X-a1', day: 3, ex: 'legext', ph: 'hyp', note: 'try light' };

  it('weekSlots adds the week’s experiment cards after the program’s', () => {
    const s = weekSlots(prog, { extra: [x] });
    expect(s.map(c => c.id)).toEqual(['p1', 'X-a1']);
    expect(s[1]).toEqual({ id: 'X-a1', day: 3, type: 'single', sec: 'Experiment', experiment: true, items: [{ ex: 'legext', ph: 'hyp' }], note: 'try light' });
  });
  it('weekSlots without extras is the program’s cards; an empty note is left off', () => {
    expect(weekSlots(prog, {}).map(c => c.id)).toEqual(['p1']);
    expect(weekSlots(prog, null).map(c => c.id)).toEqual(['p1']);
    expect(weekSlots(prog, { extra: [{ ...x, note: '' }] })[1]).not.toHaveProperty('note');
  });
  it('normWeek keeps valid experiment cards and drops malformed ones', () => {
    const bad = [{ ...x, id: 'nope' }, { ...x, id: 'X-b', day: 8 }, { ...x, id: 'X-c', ex: '' }, { ...x, id: 'X-d', ph: 'zzz' }, { ...x, id: 'X-e', note: 5 }, { ...x, id: 'X-f', day: '3' }, null, 'x'];
    expect(normWeek({ extra: [x, ...bad] }).extra).toEqual([x]);
    expect(normWeek({ extra: [{ id: 'X-g', day: 2, ex: 'hack' }] }).extra).toEqual([{ id: 'X-g', day: 2, ex: 'hack', ph: null, note: '' }]);
    expect(normWeek({ extra: [x, { ...x, note: 'dup' }] }).extra).toEqual([x]);
    expect(normWeek({ extra: [] })).not.toHaveProperty('extra');
    expect(normWeek({ extra: 'x' })).not.toHaveProperty('extra');
    expect(normWeek({})).not.toHaveProperty('extra');
  });
  it('experiment cards lay out by program day, so they follow the rest-day shift', () => {
    const w = normWeek({ extra: [x], rest: 2 });
    expect(currentLayout(w, weekSlots(prog, w))[4].map(c => c.id)).toEqual(['X-a1']);
  });
});

describe('normExperiments', () => {
  it('keeps valid entries once each and drops malformed ones', () => {
    const e = { id: 'E1', ex: 'hack', ph: 'hyp', note: 'n' };
    expect(normExperiments([e, { ...e }, { id: '', ex: 'hack' }, { id: 'E2', ex: '' }, { id: 'E3', ex: 'hack', ph: 'zzz' }, null, 'x', { id: 'E4', ex: 'legext' }]))
      .toEqual([e, { id: 'E4', ex: 'legext', ph: null, note: '' }]);
    expect(normExperiments(undefined)).toEqual([]);
  });
});
describe('experiment note length', () => {
  it('caps a long note at 200 characters on an entry and on a week card', () => {
    const long = 'n'.repeat(300);
    expect(normExperiments([{ id: 'E1', ex: 'hack', note: long }])[0].note).toHaveLength(200);
    expect(normWeek({ extra: [{ id: 'X-1', day: 2, ex: 'hack', note: long }] }).extra[0].note).toHaveLength(200);
  });
});

describe('planOrder: a new day order after a day is finished', () => {
  // Each card trains one named exercise; `sq` is the one that repeats.
  const sl = (id, day, ex) => ({ id, day, type: 'single', items: [{ ex }] });
  const c = cfg({ ex: { sq: { n: 'Squat' }, b: { n: 'Bench' }, r: { n: 'Row' }, p: { n: 'Press' }, k: { n: 'Curl' }, l: { n: 'Lunge' } } });
  const done = (...ids) => Object.fromEntries(ids.map(id => [id, true]));
  // Workouts 1-6 in program order; Squat on Days 2 and 3; Day 7 empty.
  const six = [sl('a', 1, 'b'), sl('b', 2, 'sq'), sl('c', 3, 'sq'), sl('d', 4, 'r'), sl('e', 5, 'p'), sl('f', 6, 'k')];

  it('dayClash lists the exercises two columns share, leaving out skipped cards and rest columns', () => {
    const w = normWeek({ moved: {} });
    expect(dayClash(w, six, 2, 3)).toEqual(['sq']);
    expect(dayClash(w, six, 3, 4)).toEqual([]);
    expect(dayClash(normWeek({ moved: {}, skipped: { c: true } }), six, 2, 3)).toEqual([]);
    expect(dayClash(normWeek({ moved: {}, rest: [3] }), six, 2, 3)).toEqual([]);
  });
  it('dayClash matches an exercise inside a superset', () => {
    const slots = [sl('a', 1, 'b'), { id: 'ss', day: 2, type: 'superset', items: [{ ex: 'r' }, { ex: 'b' }] }, sl('c', 3, 'k')];
    expect(dayClash(normWeek({ moved: {} }), slots, 1, 2)).toEqual(['b']);
  });
  it('names several shared exercises in a list and never moves an empty day', () => {
    const slots = [sl('a', 1, 'b'), sl('a2', 1, 'r'), sl('a3', 1, 'p'), sl('b', 2, 'b'), sl('b2', 2, 'r'), sl('b3', 2, 'p'), sl('c', 3, 'k'), sl('d', 4, 'l'), sl('e', 5, 'sq'), sl('f', 6, 'sq')];
    const plan = planOrder(c, normWeek({ moved: {}, done: done('a', 'a2', 'a3') }), slots, 1);
    expect(plan.lines[0]).toBe('Bench, Row and Press are on Day 1 and Day 2.');
    expect(plan.order[6]).toBe(7); // the empty Day 7 stays last, where a rest day can go
  });
  it('ignores an exercise that is on every workout day, since no order can split it', () => {
    const slots = [...six, ...[1, 2, 3, 4, 5, 6].map(d => sl(`g${d}`, d, 'l'))];
    const w = normWeek({ moved: {} });
    expect(dailyExercises(w, slots)).toEqual(['l']);
    expect(dayClash(w, slots, 1, 2)).toEqual([]);
    expect(clashCount(w, slots, 1)).toBe(1); // only the Squat pair
  });
  it('leaves out Home cards and either/or cards', () => {
    const home = { ...sl('h3', 3, 'b'), sec: 'Home' };
    const either = { id: 'e3', day: 3, type: 'either', items: [{ ex: 'b' }, { ex: 'r' }] };
    expect(countsForClash(home)).toBe(false);
    expect(countsForClash(either)).toBe(false);
    expect(countsForClash(six[0])).toBe(true);
    const w = normWeek({ moved: {} });
    expect(dayClash(w, [...six, { ...sl('h4', 4, 'r'), sec: 'Home' }, { ...sl('h5', 5, 'r'), sec: 'Home' }], 4, 5)).toEqual([]);
    expect(dayClash(w, [...six, { id: 'e1', day: 4, type: 'either', items: [{ ex: 'p' }, { ex: 'k' }] }], 4, 5)).toEqual([]);
  });
  it('clashCount counts neighboring pairs from a column on', () => {
    const w = normWeek({ moved: {} });
    expect(clashCount(w, six, 1)).toBe(1);
    expect(clashCount(w, six, 3)).toBe(0); // the Day 2-3 pair is behind column 3
  });

  it('finishing Day 2 moves the next Squat day later, by the nearest swap', () => {
    const w = normWeek({ moved: {}, done: done('a', 'b') });
    const plan = planOrder(c, w, six, 2);
    expect(plan.order).toEqual([1, 2, 4, 3, 5, 6, 7]);
    expect(plan.rest).toEqual([]);
    expect(plan.before).toBe(1);
    expect(plan.after).toBe(0);
    expect(plan.lines.join(' ')).toBe('Squat is on Day 2 and Day 3. Swapping Day 3 and Day 4 fixes it.');
  });
  it('returns null when nothing ahead clashes', () => {
    const spread = [sl('a', 1, 'b'), sl('b', 2, 'sq'), sl('c', 3, 'r'), sl('d', 4, 'sq'), sl('e', 5, 'p')];
    expect(planOrder(c, normWeek({ moved: {}, done: done('a') }), spread, 1)).toBeNull();
  });
  it('returns null when the clash is with a day you have started', () => {
    const w = normWeek({ moved: {}, done: done('a', 'b', 'c') }); // Day 3 is started (here, finished too)
    expect(planOrder(c, w, six, 2)).toBeNull();
  });
  it('never moves the finished day, earlier days or a day with a check-off', () => {
    // Squat on Days 1-5 and Day 6 started: only columns 2-5 and 7 can move.
    const slots = [1, 2, 3, 4, 5].map(d => sl(`s${d}`, d, 'sq')).concat([sl('f', 6, 'k'), sl('f2', 6, 'r'), sl('h', 7, 'b')]);
    const w = normWeek({ moved: {}, done: done('s1', 'f') });
    const plan = planOrder(c, w, slots, 1);
    expect(plan.order[0]).toBe(1);
    expect(plan.order[5]).toBe(6);
  });
  it('can only reduce a clash it cannot fix, and says how many are left', () => {
    // Squat on Days 1-5, others on 6 and 7: after the finished Day 1, columns 3, 5 and 7 hold three Squats apart;
    // the fourth touches two neighbors wherever it goes.
    const slots = [1, 2, 3, 4, 5].map(d => sl(`s${d}`, d, 'sq')).concat([sl('f', 6, 'k'), sl('h', 7, 'b')]);
    const plan = planOrder(c, normWeek({ moved: {}, done: done('s1') }), slots, 1);
    expect(plan.before).toBe(4);
    expect(plan.after).toBe(2);
    expect(plan.lines.join(' ')).toMatch(/That leaves 2 back-to-back repeats instead of 4\.$/);
    const one = [1, 2, 3].map(d => sl(`s${d}`, d, 'sq')).concat([sl('f', 4, 'k'), sl('h', 5, 'b'), sl('i', 6, 'r'), sl('j', 7, 'p')]);
    const sw = planOrder(c, normWeek({ moved: {}, done: done('s1', 's2') }), one, 2); // Days 1-2 are behind; only the 2-3 pair counts
    expect(sw.after).toBe(0);
  });

  it('moves the rest day between two Squat days rather than reordering workouts', () => {
    // Rest on column 6: columns show workouts 1-5, rest, 6. Squat on workouts 3 and 4 (columns 3 and 4).
    const slots = [sl('a', 1, 'b'), sl('b2', 2, 'r'), sl('c', 3, 'sq'), sl('d', 4, 'sq'), sl('e', 5, 'p'), sl('f', 6, 'k')];
    const w = normWeek({ moved: {}, rest: [6], restOn: '2026-10-05', done: done('a', 'b2', 'c') });
    const plan = planOrder(c, w, slots, 3);
    expect(plan.rest).toEqual([4]);
    expect(plan.order).toEqual([1, 2, 3, 4, 5, 6, 7]); // the workouts keep their order and shift one day later
    expect(plan.lines.join(' ')).toBe('Squat is on Day 3 and Day 4. Moving your rest day from Day 6 to Day 4 fixes it.');
  });
  it('moves the rest day first when that alone cuts the repeats, even if a reorder would fix more', () => {
    // Columns: 1 b+sq, 2 sq+r, 3 r, 4 p, 5 k, rest on 6, 7 l. Finished Day 1: Squat on 1-2 and Row on 2-3.
    const slots = [sl('a', 1, 'b'), sl('a2', 1, 'sq'), sl('b2', 2, 'sq'), sl('b3', 2, 'r'), sl('c', 3, 'r'), sl('d', 4, 'p'), sl('e', 5, 'k'), sl('f', 6, 'l')];
    const plan = planOrder(c, normWeek({ moved: {}, rest: [6], done: done('a', 'a2') }), slots, 1);
    expect(plan.rest).toEqual([3]); // Day 2 or Day 3 both split one pair; Day 3 moves fewer days
    expect(plan.order).toEqual([1, 2, 3, 4, 5, 6, 7]); // no workout reordered
    expect(plan.lines.at(-1)).toBe('Moving your rest day from Day 6 to Day 3 leaves 1 back-to-back repeat instead of 2.');
  });
  it('describes a rest day trading places with a neighbor as a rest day move', () => {
    const slots = [sl('a', 1, 'b'), sl('b2', 2, 'sq'), sl('c', 3, 'sq'), sl('e', 5, 'k'), sl('f', 6, 'l')];
    const plan = planOrder(c, normWeek({ moved: {}, rest: [4], done: done('a', 'b2') }), slots, 2);
    expect(plan.lines.at(-1)).toBe('Moving your rest day from Day 4 to Day 3 fixes it.');
  });
  it('keeps an earlier rest day where it is, and keeps the hidden workout off the board', () => {
    // Rest on column 2: columns show workouts 1, rest, 2-6; workout 7 is hidden.
    const slots = [sl('a', 1, 'b'), sl('b2', 2, 'r'), sl('c', 3, 'sq'), sl('d', 4, 'sq'), sl('e', 5, 'p'), sl('f', 6, 'k')];
    const w = normWeek({ moved: {}, rest: [2], done: done('a', 'b2') }); // finished column 3 (workout 2)
    const plan = planOrder(c, w, slots, 3);
    expect(plan.rest).toEqual([2]);
    expect(plan.order[6]).toBe(7);
    expect(plan.after).toBe(0);
  });
  it('works on top of a swapped order, and a moved card travels with its workout', () => {
    // Order swaps workouts 4 and 5; the Squat card from Day 1 was moved onto workout 3.
    const slots = [sl('a', 1, 'b'), sl('x', 1, 'sq'), sl('b2', 2, 'r'), sl('c', 3, 'p'), sl('d', 4, 'k'), sl('e', 5, 'sq'), sl('f', 6, 'l')];
    const w = normWeek({ moved: { x: 3 }, order: [1, 2, 3, 5, 4, 6, 7], done: done('a', 'b2', 'c', 'x') });
    // Column 3 (workout 3, now holding Squat) is finished; column 4 shows workout 5 with Squat.
    const plan = planOrder(c, w, slots, 3);
    expect(plan.order.slice(0, 3)).toEqual([1, 2, 3]);
    expect(plan.order[3]).not.toBe(5);
    expect(plan.after).toBe(0);
  });
});

describe('moving cards follows the planner\'s clash rule', () => {
  const sl = (id, day, ex, more = {}) => ({ id, day, type: 'single', items: [{ ex }], ...more });
  const c = cfg({ ex: { sq: { n: 'Squat' }, b: { n: 'Bench' }, r: { n: 'Row' }, sled: { n: 'Sled' }, grip: { n: 'Grip' } } });
  it('Home and either/or cards give no back-to-back warning, either moving or sitting next door', () => {
    const w = normWeek(null);
    const home = sl('h', 1, 'grip', { sec: 'Home' }); const home3 = sl('h3', 3, 'grip', { sec: 'Home' });
    expect(moveClashes(c, w, [home, home3, sl('x', 5, 'b')], home, 2)).toEqual([]);
    expect(moveClashes(c, w, [home, sl('g3', 3, 'grip'), sl('x', 5, 'b')], home, 2)).toEqual([]); // a moved Home card next to a regular one
    const either = { id: 'e', day: 3, type: 'either', items: [{ ex: 'sq' }, { ex: 'r' }] };
    const sq = sl('s', 1, 'sq');
    expect(moveClashes(c, w, [sq, either, sl('x', 5, 'b')], sq, 2)).toEqual([]);
    expect(moveClashes(c, w, [sq, sl('y', 3, 'sq')], sq, 2)).toHaveLength(1); // a normal card still warns
  });
  it('an exercise on every other workout day (the sled) gives no back-to-back warning', () => {
    const slots = [1, 2, 3, 4, 5, 6].map(d => sl(`sl${d}`, d, 'sled')).concat([sl('b1', 1, 'b'), sl('r6', 6, 'r')]);
    expect(moveClashes(c, normWeek(null), slots, slots[1], 7)).toEqual([]);
  });
  it('the same exercise twice on one day still warns, Home cards and the sled included', () => {
    const slots = [1, 2, 3, 4, 5, 6].map(d => sl(`sl${d}`, d, 'sled')).concat([sl('h1', 1, 'grip', { sec: 'Home' }), sl('h4', 4, 'grip', { sec: 'Home' })]);
    expect(moveClashes(c, normWeek(null), slots, slots[1], 3)[0]).toMatch(/Sled is already on Day 3/);
    expect(moveClashes(c, normWeek(null), slots, slots[6], 4)[0]).toMatch(/Grip is already on Day 4/);
  });
});

describe('isFinished: a day is done when its workout is, Home and Optional cards aside', () => {
  const sl = (id, more = {}) => ({ id, day: 1, type: 'single', items: [{ ex: id }], ...more });
  const day = [sl('sled', { sec: 'Optional' }), sl('a', { sec: 'Regular' }), sl('b', { sec: 'Plyometric' }), { id: 'ss', day: 1, type: 'superset', sec: 'Supersets', items: [{ ex: 'p' }, { ex: 'q' }] }, sl('grip', { sec: 'Home' })];
  const w = (done, skipped = {}) => normWeek({ done, skipped });
  it('counts every card but Home and Optional ones', () => {
    expect(countsForFinish(day[0])).toBe(false);
    expect(countsForFinish(day[4])).toBe(false);
    expect(countsForFinish(day[1])).toBe(true);
    expect(countsForFinish(sl('x'))).toBe(true); // no section
  });
  it('is finished with the sled and Home cards left unticked', () => {
    expect(isFinished(day, w({ a: true, b: true, 'ss#0': true, 'ss#1': true }))).toBe(true);
  });
  it('is not finished with half a superset or a card left', () => {
    expect(isFinished(day, w({ a: true, b: true, 'ss#0': true }))).toBe(false);
    expect(isFinished(day, w({ a: true, 'ss#0': true, 'ss#1': true, sled: true, grip: true }))).toBe(false);
  });
  it('a skip counts as dealt with, but a day of only skips is not finished', () => {
    expect(isFinished(day, w({ a: true, 'ss#0': true, 'ss#1': true }, { b: true }))).toBe(true);
    expect(isFinished(day, w({}, { a: true, b: true, ss: true }))).toBe(false);
  });
  it('a day of only Home or Optional cards, or no cards, is never finished', () => {
    expect(isFinished([day[0], day[4]], w({ sled: true, grip: true }))).toBe(false);
    expect(isFinished([], w({}))).toBe(false);
  });
});

describe('planCard and planFix: moving one card when a day is finished', () => {
  const sl = (id, day, ex, more = {}) => ({ id, day, type: 'single', items: [{ ex }], ...more });
  const c = cfg({ ex: { sq: { n: 'Squat' }, b: { n: 'Bench' }, r: { n: 'Row' }, p: { n: 'Press' }, k: { n: 'Curl' }, l: { n: 'Lunge' } } });
  const done = (...ids) => Object.fromEntries(ids.map(id => [id, true]));
  // Two cards a day, Squat on Days 2 and 3 only, Day 7 empty.
  const two = [sl('a', 1, 'b'), sl('a2', 1, 'l'), sl('b', 2, 'sq'), sl('b2', 2, 'r'), sl('c', 3, 'sq'), sl('c2', 3, 'p'),
    sl('d', 4, 'k'), sl('d2', 4, 'b'), sl('e', 5, 'r'), sl('e2', 5, 'l'), sl('f', 6, 'p'), sl('f2', 6, 'k')];
  const fin2 = (more = {}) => normWeek({ moved: {}, done: done('a', 'a2', 'b', 'b2'), ...more });

  it('moves the clashing card to the nearest day that fixes it', () => {
    const plan = planCard(c, fin2(), two, 2);
    expect(plan).toMatchObject({ slot: 'c', from: 3, to: 4, pd: 4, before: 1, after: 0 });
    expect(plan.lines.join(' ')).toBe('Squat is on Day 2 and Day 3. Moving Squat from Day 3 to Day 4 fixes it.');
  });
  it('never targets a started day or the rest column, and stores the program day', () => {
    // Rest on column 5: columns 1-4 show workouts 1-4, then rest, then workouts 5 and 6. Day 4 is started.
    const plan = planCard(c, fin2({ rest: [5], done: done('a', 'a2', 'b', 'b2', 'd') }), two, 2);
    expect(plan).toMatchObject({ slot: 'c', from: 3, to: 6, pd: 5 });
  });
  it('never targets an empty day, or a day that already has that exercise', () => {
    // Squat on Days 2, 3 and 5. Day 7 (empty) and Day 5 (Squat twice that day) would score clash-free; neither is allowed.
    const slots = [sl('a', 1, 'b'), sl('b', 2, 'sq'), sl('c', 3, 'sq'), sl('c2', 3, 'p'), sl('d', 4, 'k'), sl('e', 5, 'sq'), sl('e2', 5, 'r'), sl('f', 6, 'l')];
    expect(planCard(c, normWeek({ moved: {}, done: done('a', 'b') }), slots, 2)).toBeNull();
  });
  it('moves a superset whole, and names it', () => {
    const slots = two.map(s => (s.id === 'c' ? { id: 'c', day: 3, type: 'superset', items: [{ ex: 'sq' }, { ex: 'r' }] } : s));
    const plan = planCard(c, fin2(), slots, 2);
    expect(plan.slot).toBe('c');
    expect(plan.lines.at(-1)).toBe('Moving the Squat + Row superset from Day 3 to Day 4 leaves 1 back-to-back repeat instead of 2.'); // Row is on Day 5 too
    expect(currentLayout({ ...fin2(), moved: { c: plan.pd } }, slots)[plan.to].map(s => s.id)).toContain('c');
  });
  it('never empties the day a card leaves', () => {
    const lone = two.filter(s => s.id !== 'c2'); // Squat is alone on Day 3
    expect(planCard(c, fin2(), lone, 2)).toBeNull();
    const withHome = [...lone, sl('h3', 3, 'grip', { sec: 'Home' })]; // a Home card left behind doesn't count
    expect(planCard(c, fin2(), withHome, 2)).toBeNull();
  });
  it('ignores Home and either/or cards, which never clash, and never moves them', () => {
    const slots = [...two.filter(s => s.id !== 'c'), sl('h', 3, 'sq', { sec: 'Home' }), { id: 'x', day: 3, type: 'either', items: [{ ex: 'sq' }, { ex: 'k' }] }];
    expect(planCard(c, fin2(), slots, 2)).toBeNull(); // nothing to fix
  });
  it('returns null when no single card fixes or reduces it', () => {
    const slots = [...two, sl('c3', 3, 'sq')]; // two Squat cards on Day 3: moving one leaves the other
    expect(planCard(c, fin2(), slots, 2)).toBeNull();
  });
  it('leaves the week it was given alone', () => {
    const w = fin2(); const copy = structuredClone(w);
    planCard(c, w, two, 2); planFix(c, w, two, 2);
    expect(w).toEqual(copy);
  });

  it('planFix: a card move beats a day reorder that fixes no more', () => {
    const fix = planFix(c, fin2(), two, 2);
    expect(planOrder(c, fin2(), two, 2).after).toBe(0); // a reorder would fix it too
    expect(fix).toMatchObject({ kind: 'card', slot: 'c', to: 4, after: 0 });
  });
  it('planFix: moving the rest day still comes first', () => {
    const fix = planFix(c, fin2({ rest: [6] }), two, 2);
    expect(fix.kind).toBe('order');
    expect(fix.rest).toEqual([3]);
    expect(fix.order).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('planFix: a reorder wins only when it leaves fewer repeats', () => {
    // Squat twice on Day 3 (next to Day 2) and Press on Days 3 and 4: one card fixes one pair, a reorder fixes both.
    const slots = [sl('a', 1, 'b'), sl('b', 2, 'sq'), sl('c', 3, 'sq'), sl('c2', 3, 'sq'), sl('c3', 3, 'p'), sl('d', 4, 'p'), sl('d2', 4, 'k'), sl('e', 5, 'r'), sl('f', 6, 'l')];
    const w = normWeek({ moved: {}, done: done('a', 'b') });
    expect(planCard(c, w, slots, 2).after).toBe(1);
    const fix = planFix(c, w, slots, 2);
    expect(fix.kind).toBe('order');
    expect(fix.after).toBe(0);
  });
  it('planFix: null when nothing helps', () => {
    expect(planFix(c, fin2({ done: done('a', 'a2', 'b', 'b2', 'c') }), two, 2)).toBeNull(); // Day 3 is started
  });
});
