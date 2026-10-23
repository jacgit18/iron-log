import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

let useAppStore, BUILTIN, DEFAULT_CFG, currentLayout, restOwnDate, restDateCap, normWeek;
const st = () => useAppStore.getState();
let CURRENT_WEEK;

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, currentLayout, restOwnDate, restDateCap, normWeek } = await import('../lib/logic.js'));
  await st().init();
  CURRENT_WEEK = st().weekStart;
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ logs: {}, week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} }, body: [], library: [], experiments: [], modal: null, edProg: null, edDay: 1, cfg: structuredClone(DEFAULT_CFG), programs: { A: BUILTIN.A, B: BUILTIN.B }, weekHist: null });
  useAppStore.setState({ weekStart: CURRENT_WEEK });
});

// Program A: workouts on Days 1 to 6 (about ten cards each), Day 7 empty.
const dayIds = d => st().activeSlots().filter(s => s.day === d).map(s => s.id);
const skipDay = d => st().mutateWeek(w => { dayIds(d).forEach(id => { w.skipped[id] = true; }); });
const colsOf = () => Object.fromEntries(Object.entries(currentLayout(st().week, st().activeSlots())).map(([c, l]) => [c, l.map(s => s.id)]));
const PAST = new Date(2026, 0, 4); // a Sunday long gone: every day of that week may carry a rest date

describe('rest on a missed day (the owner case)', () => {
  it('ticks Rest on an earlier empty day while a rest is already ticked later: nothing moves, no message', () => {
    skipDay(3); // Day 3 was skipped, so its column is empty
    expect(st().setRestDay(5)).toBe(true); // today: Thursday
    const before = colsOf(); useAppStore.setState({ saveFlag: null });
    expect(st().setRestDay(3)).toBe(true); // the missed day
    expect(st().week.rest).toEqual([3, 5]);
    const after = colsOf();
    for (const c of [1, 2, 4, 6, 7]) expect(after[c]).toEqual(before[c]); // every workout keeps its column
    expect(after[3]).toEqual([]); expect(after[5]).toEqual([]);
    expect(Object.keys(st().week.skipped).filter(id => !dayIds(3).includes(id))).toEqual([]); // nothing else was skipped
    expect(st().saveFlag ?? null).toBeNull();
    expect(st().week.order).toEqual([1, 2, 4, 5, 6, 7, 3]); // the empty day parks at the end
  });
  it('counts skipped cards and cards moved out as empty, but not a live card or a card moved in', () => {
    st().setRestDay(5);
    // Day 3: move every card out to Day 2 (still in play there), so Day 3 is empty.
    dayIds(3).forEach(id => st().mutateWeek(w => { w.moved[id] = 2; }));
    expect(st().restOverflow(3)).toEqual([]);
    expect(st().setRestDay(3)).toBe(true);
    expect(colsOf()[2].length).toBeGreaterThan(dayIds(2).length); // the moved cards are still on Day 2
    expect(st().week.skipped).toEqual({});
  });
  it('keeps the shift for a day that has a live card', () => {
    skipDay(3); st().mutateWeek(w => { delete w.skipped['A-d3s1']; }); // one card of Day 3 is back in play
    expect(st().setRestDay(5)).toBe(true);
    expect(st().restOverflow(3).length).toBeGreaterThan(0); // Day 6 would fall off
    expect(st().setRestDay(3)).toBe(true); // one workout: skipped with a message
    expect(st().week.order).toBeUndefined();
    expect(dayIds(6).every(id => st().week.skipped[id])).toBe(true);
    expect(st().saveFlag).toMatch(/Day 3 is a rest day now/);
  });
  it('uses the shift (and its message) when there is no empty day to take', () => {
    // Every day but the last has live cards; a rest on a full day shifts.
    expect(st().setRestDay(2)).toBe(true);
    expect(st().week.order).toBeUndefined();
  });
  it('unticking returns the empty day to its old place and drops only that rest date', () => {
    skipDay(3); st().setRestDay(5); st().setRestDay(3);
    expect(st().week.order).toEqual([1, 2, 4, 5, 6, 7, 3]);
    expect(Object.keys(st().week.restOn)).toEqual(['3', '5']);
    st().setRestDay(3);
    expect(st().week.rest).toEqual([5]);
    expect(st().week.order).toBeUndefined(); // the normal order again
    expect(Object.keys(st().week.restOn)).toEqual(['5']);
    expect([...colsOf()[3]].sort()).toEqual([...dayIds(3)].sort()); // the skipped Day 3 cards are back in column 3
    expect(colsOf()[6].some(id => id.startsWith('A-d5'))).toBe(true);
  });
});

describe('unticking an in-place rest (week.restTook)', () => {
  it('puts the displaced day back where it was, even after a manual swap', () => {
    skipDay(3); st().swapDays(1, 1); // order 2,1,3,...
    const before = [...st().week.order];
    st().setRestDay(3);
    expect(st().week.restTook).toEqual({ 3: 3 });
    st().setRestDay(3);
    expect(st().week.order).toEqual(before);
    expect(st().week.restTook).toBeUndefined();
    expect(st().week.rest).toBeUndefined();
  });
  it('does not touch a manual swap of an empty last day when an ordinary rest is unticked', () => {
    skipDay(6); st().swapDays(6, 1); // order 1..5,7,6
    const before = [...st().week.order];
    st().setRestDay(4); st().setRestDay(4);
    expect(st().week.order).toEqual(before);
    expect(st().week.restTook).toBeUndefined();
  });
  it('keeps the marker with its rest when the rest is swapped with a neighbor', () => {
    skipDay(3); st().setRestDay(3);
    st().swapDays(3, 1);
    expect(st().week.rest).toEqual([4]);
    expect(st().week.restTook).toEqual({ 4: 3 });
  });
  it('is cleaned on load: only rest columns, only valid days', () => {
    expect(normWeek({ rest: [3], restTook: { 3: 3, 5: 2, 9: 1 } }).restTook).toEqual({ 3: 3 });
    expect(normWeek({ rest: [3], restTook: { 3: 'x' } })).not.toHaveProperty('restTook');
  });
});

describe('a date for each rest day', () => {
  it('stamps an earlier day with its own date and today for today', () => {
    useAppStore.setState({ weekStart: PAST });
    st().setRestDay(5); st().setRestDay(3, { skipOverflow: true });
    expect(st().week.restOn).toEqual({ 3: '2026-01-06', 5: '2026-01-08' });
    expect(restOwnDate(PAST, 3)).toBe('2026-01-06');
  });
  it('keeps each date with its rest when a rest is swapped with a neighbor, and unticking removes only its own', () => {
    useAppStore.setState({ weekStart: PAST });
    st().setRestDay(2); st().setRestDay(5, { skipOverflow: true });
    st().swapDays(5, 1);
    expect(st().week.rest).toEqual([2, 6]);
    expect(st().week.restOn).toEqual({ 2: '2026-01-05', 6: '2026-01-08' });
    expect(st().swapDays(2, 1)).toBe(true);
    expect(st().week.restOn).toEqual({ 3: '2026-01-05', 6: '2026-01-08' });
    st().setRestDay(3);
    expect(st().week.restOn).toEqual({ 6: '2026-01-08' });
  });
  it('reads the old single string as the first rest day’s date', () => {
    useAppStore.setState({ weekStart: PAST });
    const w = normWeek({ rest: [2, 4], restOn: '2026-01-05' });
    expect(w.restOn).toEqual({ 2: '2026-01-05' }); // the second rest day has no date of its own yet
    useAppStore.setState({ week: w });
    expect(st().setRestDate(4, '2026-01-07')).toBe(true);
    expect(st().week.restOn).toEqual({ 2: '2026-01-05', 4: '2026-01-07' });
  });
  it('changes one rest date only when it is a day of this week and not after today', () => {
    useAppStore.setState({ weekStart: PAST });
    st().setRestDay(2); st().setRestDay(5, { skipOverflow: true });
    expect(st().setRestDate(5, '2026-01-09')).toBe(true);
    expect(st().week.restOn).toEqual({ 2: '2026-01-05', 5: '2026-01-09' });
    expect(st().setRestDate(5, '2026-01-11')).toBe(false); // the next week
    expect(st().setRestDate(5, '2026-01-03')).toBe(false); // the week before
    expect(st().setRestDate(4, '2026-01-07')).toBe(false); // not a rest day
    expect(st().setRestDate(5, 'tomorrow')).toBe(false);
    expect(st().week.restOn).toEqual({ 2: '2026-01-05', 5: '2026-01-09' });
  });
  it('refuses a date later than today in the current week', () => {
    st().setRestDay(2);
    const cap = restDateCap(st().weekStart);
    const later = new Date(new Date(cap + 'T00:00:00').getTime() + 36 * 3600 * 1000).toLocaleDateString('en-CA');
    expect(st().setRestDate(2, later)).toBe(false); // always after the latest allowed date
    expect(st().setRestDate(2, cap)).toBe(true);
  });
});
