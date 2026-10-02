import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseDate } from './dates.js';
import { BUILTIN, slotsFor } from './data.js';
import {
  DEFAULT_CFG, programFor, round, rxOf, progressionOf, stallOf, targetOf, summarizeSets, setsOfEntry, describe as describeEntry,
  isDone, isItemDone, setCardDone, setItemDone, tally, normWeek, defaultLogDate, currentLayout, moveClashes,
  programWeights, bestByPhase, autoLogs, DAYS, shownDay, programDay, dayTitle, restBlocked,
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
  it('uses the 1RM percentage when a 1RM is set', () => {
    expect(targetOf(cfg({ rm: { hack: 400 } }), {}, item, 'hyp')).toEqual({ w: 260, src: '65% of 1RM' });
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
    expect(out.hack).toEqual([{ d: '2026-09-22', ph: 'hyp', w: 270, s: 4, r: 15, sets: Array(4).fill({ w: 270, r: 15 }), slot: 'A-d3s1', wk: '2026-09-20', auto: true }]);
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
    expect([1, 2, 3, 4, 5, 6].map(d => shownDay(3, d))).toEqual([1, 2, 4, 5, 6, 7]);
    expect(DAYS.map(d => programDay(3, d))).toEqual([1, 2, null, 3, 4, 5, 6]);
    expect(shownDay(null, 4)).toBe(4);
    expect(programDay(undefined, 4)).toBe(4);
  });
  it('lays the week out with no rest day', () => {
    expect(ids(currentLayout({ moved: {} }, slots))).toEqual({ 1: ['a'], 2: [], 3: ['b'], 4: [], 5: [], 6: ['c'], 7: [] });
  });
  it('inserts an empty rest column and shifts later workouts one day', () => {
    expect(ids(currentLayout({ moved: {}, rest: 3 }, slots))).toEqual({ 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: ['c'] });
  });
  it('with rest on Day 7 a day-7 slot still lands in column 7', () => {
    expect(ids(currentLayout({ moved: {}, rest: 7 }, [sl('a', 1), sl('d', 7)]))).toEqual({ 1: ['a'], 2: [], 3: [], 4: [], 5: [], 6: [], 7: ['d'] });
  });
  it('shifts moved cards too', () => {
    expect(ids(currentLayout({ moved: { a: 5 }, rest: 3 }, slots))[6]).toEqual(['a']);
  });
  it('clamps a card that would fall off the end into the last column instead of losing it', () => {
    const cols = currentLayout({ moved: {}, rest: 2 }, [...slots, sl('d', 7)]);
    expect(cols[7].map(s => s.id).sort()).toEqual(['c', 'd']);
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
    expect(normWeek({ rest: 3 }).rest).toBe(3);
    expect(normWeek({ rest: '3' }).rest).toBe(3);
    ['x', 0, 8, null, undefined, 2.5].forEach(v => expect(normWeek({ rest: v })).not.toHaveProperty('rest'));
    expect(normWeek(null)).not.toHaveProperty('rest');
  });
});
