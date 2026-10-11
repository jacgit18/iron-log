import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved, mem } from '../test/browserStubs.js';

// ADR 022 in the store: a tick writes down what the week runs, and a week that is over keeps showing and counting that.
let useAppStore, BUILTIN, DEFAULT_CFG, weekSummary, ymd, weekStartOf, addDays;
const st = () => useAppStore.getState();
const tick = () => new Promise(r => setTimeout(r, 0));

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG } = await import('../lib/logic.js'));
  ({ weekSummary } = await import('../lib/trends.js'));
  ({ ymd, weekStartOf, addDays } = await import('../shared/dates.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], cfg: structuredClone(DEFAULT_CFG), weekStart: weekStartOf(new Date()), weekHist: null, edProg: null, edDay: 1, modal: null });
});

const lastWeek = () => ymd(addDays(weekStartOf(new Date()), -7));
const firstCard = () => st().activeSlots().find(s => s.sec !== 'Optional');

describe('what a week ran, in the store', () => {
  it('a tick writes down the program and its cards with the week', () => {
    st().checkCard(firstCard().id, true);
    const w = saved('weeks/' + st().weekKey());
    expect(w.ran.prog).toBe('A');
    expect(w.ran.program.days[0].slots.map(s => s.id)).toEqual(BUILTIN.A.days[0].slots.map(s => s.id));
  });

  it('last week keeps its cards and its count after another program is loaded into A', async () => {
    useAppStore.setState({ weekStart: addDays(weekStartOf(new Date()), -7), week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } });
    const card = firstCard();
    st().checkCard(card.id, true);
    const key = lastWeek(); const w = saved('weeks/' + key);
    const before = weekSummary(st().cfg, st().programs, key, w);
    expect(before.ex).toBe(1);
    // Another program goes into A (a copy of B, given its own ids): none of its cards is the one ticked last week.
    expect(st().createProgram('Mine', 'B')).toBe(true);
    st().loadVersion(st().library.find(it => it.name === 'Mine').id, 'A');
    expect(st().programs.A.days.flatMap(d => d.slots).some(s => s.id === card.id)).toBe(false);
    expect(weekSummary(st().cfg, st().programs, key, w)).toEqual(before);
    expect(st().activeSlots().some(s => s.id === card.id)).toBe(true); // the board for last week still shows it
    st().gotoWeek('today'); await tick();
    expect(st().activeSlots().some(s => s.id === card.id)).toBe(false); // this week shows the new program
  });

  it('a past week saved before the record gets one when history loads, from what it shows, once', async () => {
    const key = lastWeek(); const card = BUILTIN.A.days[0].slots[1];
    mem['ironlog:weeks/' + key] = JSON.stringify({ prog: null, done: { [card.id]: true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    await st().loadHistory();
    const w = saved('weeks/' + key);
    expect(w.ran.prog).toBe('A');
    expect(w.ran.program.days[0].slots.some(s => s.id === card.id)).toBe(true);
    const at = JSON.stringify(w); useAppStore.setState({ weekHist: null });
    await st().loadHistory();
    expect(JSON.stringify(saved('weeks/' + key))).toBe(at); // not written again
  });

  it('an empty past week is left alone', async () => {
    const key = lastWeek();
    mem['ironlog:weeks/' + key] = JSON.stringify({ prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} });
    await st().loadHistory();
    expect(saved('weeks/' + key)).not.toHaveProperty('ran');
  });
});

describe('this week’s record follows its program until the week is over', () => {
  const ids = () => saved('weeks/' + st().weekKey()).ran.program.days[0].slots.map(s => s.id);

  it('a card added or removed after the last tick is in the record', () => {
    const [a, b] = st().activeSlots().filter(s => s.day === 1 && s.sec !== 'Optional');
    st().checkCard(a.id, true);
    const prog = structuredClone(st().programs.A);
    prog.days[0].slots = prog.days[0].slots.filter(s => s.id !== b.id);
    prog.days[0].slots.push({ id: 'A-new', sec: 'Regular', items: [{ ex: 'hack', ph: null, w: 100 }] });
    st().saveProgram('A', prog);
    expect(ids()).toContain('A-new');
    expect(ids()).not.toContain(b.id);
    expect(ids()).toContain(a.id);
  });

  it('a mode change moves the record to the week’s new program', () => {
    const even = (new Date().getMonth() + 1) % 2 === 0;
    useAppStore.setState(s => ({ cfg: { ...s.cfg, m2Even: even ? 'B' : 'A' } })); // mode 2 gives this month B
    st().checkCard(firstCard().id, true);
    expect(saved('weeks/' + st().weekKey()).ran.prog).toBe('A');
    st().setMode(2);
    expect(saved('weeks/' + st().weekKey()).ran.prog).toBe('B');
  });

  it('a past week’s record is left alone by a program edit', () => {
    useAppStore.setState({ weekStart: addDays(weekStartOf(new Date()), -7), week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } });
    st().checkCard(firstCard().id, true);
    const at = JSON.stringify(saved('weeks/' + lastWeek()));
    const prog = structuredClone(st().programs.A); prog.days[0].slots = [];
    st().saveProgram('A', prog);
    expect(JSON.stringify(saved('weeks/' + lastWeek()))).toBe(at);
  });
});

describe('choosing a past week’s program', () => {
  const past = () => {
    const even = (addDays(weekStartOf(new Date()), -7).getMonth() + 1) % 2 === 0;
    useAppStore.setState(s => ({ cfg: { ...s.cfg, mode: 2, m2Even: even ? 'A' : 'B' }, weekStart: addDays(weekStartOf(new Date()), -7), week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } }));
    st().checkCard(firstCard().id, true);
    const prog = structuredClone(st().programs.A); prog.days[0].slots = []; st().saveProgram('A', prog); // A changes after the week
  };

  it('the program it already shows keeps its record', () => {
    past(); const at = JSON.stringify(saved('weeks/' + lastWeek()));
    st().setWeekProg('A');
    expect(JSON.stringify(saved('weeks/' + lastWeek()))).toBe(at);
    expect(st().activeSlots().length).toBeGreaterThan(0);
  });

  it('the other program takes today’s version of it', () => {
    past(); st().setWeekProg('B');
    expect(saved('weeks/' + lastWeek()).ran.prog).toBe('B');
    expect(st().activeProgKey()).toBe('B');
  });
});
