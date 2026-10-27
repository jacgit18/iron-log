import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

let useAppStore, DEFAULT_CFG, BUILTIN, weekSlots;
const st = () => useAppStore.getState();
const slots = () => st().activeSlots();
const exs = () => slots().flatMap(s => s.items.map(i => i.ex)).sort();
// A's Day 1 holds two supersets; the board shows Day 1 in column 1 unless a rest day or an order moves it.
const superset = () => slots().find(s => s.type === 'superset' && s.day === 1);

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ DEFAULT_CFG, weekSlots } = await import('../lib/logic.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], cfg: structuredClone(DEFAULT_CFG), removed: null });
  useAppStore.setState(x => ({ week: { ...x.week, done: {}, skipped: {}, moved: {}, ph: {}, split: undefined, rest: undefined, order: undefined } }));
});

describe('moving one exercise of a superset to another day for this week (Board)', () => {
  it('the exercise appears on the other day with its sets and weight, nothing is lost or duplicated, and the program is untouched', () => {
    const s = superset(); const before = exs(); const prog = structuredClone(st().programs.A);
    expect(s.items.length).toBeGreaterThan(1);
    expect(st().moveSupersetItem(s.id, 0, 4)).toBe(true);
    expect(exs()).toEqual(before);
    const moved = slots().find(x => x.id === st().week.split[0].id);
    expect(moved.items).toEqual([s.items[0]]); expect(moved.day).toBe(4); expect(moved.type).toBe('single');
    expect(slots().find(x => x.id === s.id)).toBeUndefined();
    expect(st().programs.A).toEqual(prog);
  });
  it('ticks, skips and phases follow the exercise, and the others keep theirs', () => {
    const s = superset();
    useAppStore.setState(x => ({ week: { ...x.week, done: { [`${s.id}#0`]: true }, skipped: { [`${s.id}#1`]: true }, ph: { [`${s.id}:0`]: 'iso' } } }));
    st().moveSupersetItem(s.id, 0, 4);
    const sp = st().week.split[0]; const w = st().week;
    expect(w.done[sp.id]).toBe(true); expect(w.ph[`${sp.id}:0`]).toBe('iso');
    expect(w.skipped[sp.rest]).toBe(true); // the other exercise, now a plain card, is still skipped
    expect(w.skipped[`${s.id}#1`]).toBe(true); // the old key is left as it was
  });
  it('the phase shown does not change (a saved default under the old id is written as this week\'s pick)', () => {
    const s = superset();
    useAppStore.setState(x => ({ cfg: { ...x.cfg, phDef: { [`${s.id}:1`]: 'hyp' } } }));
    st().moveSupersetItem(s.id, 0, 4);
    const rest = slots().find(x => x.id === st().week.split[0].rest);
    expect(st().week.ph[`${rest.id}:0`]).toBe('hyp');
  });
  it('the rest of a card that was moved earlier stays on that day', () => {
    const s = superset(); st().moveSlot(s.id, 3);
    st().moveSupersetItem(s.id, 0, 5);
    expect(st().week.moved[st().week.split[0].rest]).toBe(3);
  });
  it('refuses a rest day, the day it is already on, plain cards, either/or cards and a position that is not there', () => {
    const s = superset(); const plain = slots().find(x => x.type === 'single' && x.day === 1); const either = slots().find(x => x.type === 'either');
    useAppStore.setState(x => ({ week: { ...x.week, rest: [6] } }));
    expect(st().moveSupersetItem(s.id, 0, 6)).toBe(false);
    expect(st().moveSupersetItem(s.id, 0, 1)).toBe(false);
    expect(st().moveSupersetItem(plain.id, 0, 3)).toBe(false);
    if (either) expect(st().moveSupersetItem(either.id, 0, 3)).toBe(false);
    expect(st().moveSupersetItem(s.id, 9, 3)).toBe(false);
    expect(st().week.split).toBeUndefined();
  });
  it('Undo puts the superset back exactly: cards, ticks, skips and phases', () => {
    const s = superset();
    useAppStore.setState(x => ({ week: { ...x.week, done: { [`${s.id}#0`]: true }, ph: { [`${s.id}:1`]: 'iso' } } }));
    const cards = structuredClone(slots()); const week = structuredClone(st().week);
    st().moveSupersetItem(s.id, 0, 4);
    st().undoRemoved();
    expect(slots()).toEqual(cards); expect(st().week.done).toEqual(week.done); expect(st().week.ph).toEqual(week.ph); expect(st().week.skipped).toEqual(week.skipped);
    expect(st().week.split).toBeUndefined(); expect(st().week.moved).toEqual(week.moved);
  });
  it('a second exercise can follow from a three-exercise superset, and Undo takes back the latest move first', () => {
    const A = structuredClone(BUILTIN.A);
    A.days[0].slots.push({ id: 'T-3', sec: 'Supersets', type: 'superset', items: ['x1', 'x2', 'x3'].map(ex => ({ ex, ph: 'hyp', w: 10 })) });
    useAppStore.setState({ programs: { A, B: BUILTIN.B } });
    const before = exs();
    st().moveSupersetItem('T-3', 0, 4);
    const first = st().week.split[0]; expect(slots().find(x => x.id === first.rest).items.map(i => i.ex)).toEqual(['x2', 'x3']);
    st().moveSupersetItem(first.rest, 1, 5);
    expect(exs()).toEqual(before);
    const [, second] = st().week.split; expect(slots().find(x => x.id === second.rest).items.map(i => i.ex)).toEqual(['x2']);
    st().undoRemoved(); // the latest note is the second move's
    expect(st().week.split).toHaveLength(1); expect(exs()).toEqual(before);
  });
  it('the first of two chained moves can still be put back later: the second goes back with it, and what was ticked on the new cards comes along', () => {
    const A = structuredClone(BUILTIN.A);
    A.days[0].slots.push({ id: 'T-3', sec: 'Supersets', type: 'superset', items: ['x1', 'x2', 'x3'].map(ex => ({ ex, ph: 'hyp', w: 10 })) });
    useAppStore.setState({ programs: { A, B: BUILTIN.B } });
    const before = exs();
    st().moveSupersetItem('T-3', 0, 4);
    const first = st().week.split[0];
    st().moveSupersetItem(first.rest, 1, 5);
    const second = st().week.split[1];
    useAppStore.setState(x => ({ week: { ...x.week, done: { ...x.week.done, [first.id]: true, [second.id]: true } } }));
    expect(st().unmoveSupersetItem(first.id)).toBe(true);
    expect(st().week.split).toBeUndefined(); expect(exs()).toEqual(before);
    expect(slots().find(x => x.id === 'T-3').items.map(i => i.ex)).toEqual(['x1', 'x2', 'x3']);
    expect(st().week.done).toEqual({ 'T-3#0': true, 'T-3#2': true }); // x1 and x3 were ticked on the new cards; x2 was not
  });
  it('a program edited since leaves the card as it was instead of losing the exercise', () => {
    const s = superset(); st().moveSupersetItem(s.id, 0, 4);
    const edited = structuredClone(st().programs.A);
    edited.days[0].slots.forEach(sl => { if (sl.id === s.id) sl.items[0].ex = 'other-ex'; });
    const prog = { ...edited, key: 'A' };
    const out = weekSlots(prog, st().week, st().weekKey()).flatMap(x => x.items.map(i => i.ex));
    expect(out).toContain('other-ex'); expect(out).toContain(s.items[1].ex);
  });
});
