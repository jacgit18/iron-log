import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved, mem } from '../test/browserStubs.js';

// ADR 022 in the store: a tick writes down what the week runs, and a week that is over keeps showing and counting that.
let onlyElsewhere, useAppStore, fromOtherTab, BUILTIN, DEFAULT_CFG, weekSummary, ymd, weekStartOf, addDays;
const st = () => useAppStore.getState();
const tick = () => new Promise(r => setTimeout(r, 0));

beforeAll(async () => {
  ({ useAppStore, fromOtherTab } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, onlyElsewhere } = await import('../lib/logic.js'));
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

  // The edit used to wait for this week's next load or tick, so a week never opened again before Sunday kept the old cards.
  it('a program edit made while the board shows another week updates this week’s saved record', () => {
    const now = ymd(weekStartOf(new Date())); const card = BUILTIN.A.days[0].slots[1];
    st().checkCard(card.id, true); // this week, with its record
    useAppStore.setState({ weekStart: addDays(weekStartOf(new Date()), -7), week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } });
    const prog = structuredClone(st().programs.A);
    prog.days[0].slots.push({ id: 'A-new', sec: 'Regular', items: [{ ex: 'hack', ph: null, w: 100 }] });
    st().saveProgram('A', prog);
    const w = saved('weeks/' + now);
    expect(w.ran.program.days[0].slots.map(s => s.id)).toContain('A-new');
    expect(w.done).toEqual({ [card.id]: true }); // the rest of the week is untouched
    expect(saved('weeks/' + lastWeek())).toBeNull(); // the week on screen got no record from this
  });

  // Review fix: the loaded history is not kept current when syncing, so a copy of this week from it could drop another device's ticks.
  it('reads this week’s saved document, not an older copy in the loaded history', () => {
    const now = ymd(weekStartOf(new Date())); const card = BUILTIN.A.days[0].slots[1];
    st().checkCard(card.id, true);
    const older = { ...saved('weeks/' + now), done: {} }; // the history loaded before that tick
    useAppStore.setState({ weekHist: { [now]: older }, weekStart: addDays(weekStartOf(new Date()), -7), week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } });
    const prog = structuredClone(st().programs.A);
    prog.days[0].slots.push({ id: 'A-new', sec: 'Regular', items: [{ ex: 'hack', ph: null, w: 100 }] });
    st().saveProgram('A', prog);
    const w = saved('weeks/' + now);
    expect(w.ran.program.days[0].slots.map(s => s.id)).toContain('A-new');
    expect(w.done).toEqual({ [card.id]: true });
  });

  it('this week without a record is left alone by an edit made from another week', () => {
    const now = ymd(weekStartOf(new Date()));
    mem['ironlog:weeks/' + now] = JSON.stringify({ prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} });
    useAppStore.setState({ weekStart: addDays(weekStartOf(new Date()), -7), week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } });
    const prog = structuredClone(st().programs.A); prog.days[0].slots = [];
    st().saveProgram('A', prog);
    expect(saved('weeks/' + now)).not.toHaveProperty('ran');
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

describe('the board’s + Add exercise on a finished week', () => {
  it('opens no sheet and changes no program, since the week shows what it ran', () => {
    useAppStore.setState({ weekStart: addDays(weekStartOf(new Date()), -7), week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } });
    st().checkCard(firstCard().id, true);
    expect(st().shownFromRecord()).toBe(true);
    st().openAddToProgram(1);
    expect(st().modal).toBe(null);
  });
  it('opens the sheet on this week', () => {
    st().checkCard(firstCard().id, true);
    expect(st().shownFromRecord()).toBe(false);
    st().openAddToProgram(1);
    expect(st().modal).toMatchObject({ type: 'slot', target: { key: 'A', day: 1 } });
  });
});

describe('old past weeks get their record once the data is in', () => {
  it('without opening Progress, and only once per device', async () => {
    const key = lastWeek(); const card = BUILTIN.A.days[0].slots[1];
    mem['ironlog:weeks/' + key] = JSON.stringify({ prog: null, done: { [card.id]: true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    const ready = st().ready;
    useAppStore.setState({ ready: Object.fromEntries(Object.keys(ready).map(k => [k, false])) });
    useAppStore.setState({ ready });
    await st().loadHistory(); // waits for the load the store started
    expect(saved('weeks/' + key).ran.program.days[0].slots.some(s => s.id === card.id)).toBe(true);
    expect(saved('ran-recorded/local')).toBe(true); // per data source: signing in to sync later records the server's weeks too
    useAppStore.setState({ weekHist: null, ready: Object.fromEntries(Object.keys(ready).map(k => [k, false])) });
    useAppStore.setState({ ready });
    expect(st().historyLoading).toBe(false); // done on this device: not loaded again
  });
});

describe('review fixes: the record catches up, and the backfill is not skipped by a bad load', () => {
  const stale = () => { st().checkCard(firstCard().id, true); const w = structuredClone(st().week); w.ran.program.days[0].slots = w.ran.program.days[0].slots.slice(0, 1); useAppStore.setState({ week: w }); };
  const cards = () => st().week.ran.program.days[0].slots.length;

  it('this week’s record catches up once the data is in (the week can load before the programs)', () => {
    stale(); expect(cards()).toBe(1);
    const ready = st().ready;
    useAppStore.setState({ ready: Object.fromEntries(Object.keys(ready).map(k => [k, false])) });
    useAppStore.setState({ ready });
    expect(cards()).toBe(BUILTIN.A.days[0].slots.length);
  });

  it('a program changed in another tab updates this week’s record', () => {
    stale();
    fromOtherTab({ key: 'ironlog:programs/A', newValue: JSON.stringify(BUILTIN.A) });
    expect(cards()).toBe(BUILTIN.A.days[0].slots.length);
  });

  it('a history load that hit an error does not mark the backfill done', async () => {
    const ready = st().ready; const key = localStorage.key;
    localStorage.key = () => { throw new Error('blocked'); };
    try {
      useAppStore.setState({ weekHist: null, ready: Object.fromEntries(Object.keys(ready).map(k => [k, false])) });
      useAppStore.setState({ ready });
      await st().loadHistory();
    } finally { localStorage.key = key; }
    expect(saved('ran-recorded/local')).toBe(null);
  });
});

describe('looking at the other program', () => {
  it('keeps a rest day on the program it was ticked on, and brings it back', () => {
    st().setMode(2);
    st().setWeekProg('B'); st().setRestDay(3);
    expect(st().week.rest).toEqual([3]);
    st().setWeekProg('A');
    expect(st().week.rest).toBeUndefined();
    expect(st().week.restOn).toBeUndefined();
    st().setRestDay(5);
    st().setWeekProg('B');
    expect(st().week.rest).toEqual([3]);
    st().setWeekProg('A');
    expect(st().week.rest).toEqual([5]);
  });
  it('knows when every check-off is on the other program', () => {
    st().setMode(2);
    st().checkCard(firstCard().id, true);
    st().setWeekProg('B');
    expect(onlyElsewhere(st().activeSlots(), st().week)).toBe(true);
    st().setWeekProg('A');
    expect(onlyElsewhere(st().activeSlots(), st().week)).toBe(false);
  });
});
