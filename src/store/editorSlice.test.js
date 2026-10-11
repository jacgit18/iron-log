import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

let useAppStore, BUILTIN, DEFAULT_CFG, sameProg;
const st = () => useAppStore.getState();
const day1 = () => st().edProgram().days[0].slots;
const ids = slots => slots.map(s => s.id);
const builtinA = () => ids(BUILTIN.A.days[0].slots);

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG } = await import('../lib/logic.js'));
  ({ sameProg } = await import('../lib/export.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], cfg: structuredClone(DEFAULT_CFG), edProg: null, edDay: 1, modal: null });
});

// Program A's Day 1: five Regular cards, two Supersets, two Home cards.
const newCard = over => ({ day: 1, sec: 'Regular', type: 'single', items: [{ ex: 'arnold', ph: 'strength', w: 30 }], ...over });

describe('editing a program', () => {
  it('saves an edited copy and never changes the built-in program', () => {
    const before = builtinA();
    st().moveEdSlot(0, 1);
    expect(ids(day1()).slice(0, 2)).toEqual(['A-d1s1', 'A-sled1']); // the sled card is first
    expect(saved('programs/A').days[0].slots[0].id).toBe('A-d1s1');
    expect(builtinA()).toEqual(before);
    expect(st().programs.A).not.toBe(BUILTIN.A);
  });
  it('does nothing when moving past either end', () => {
    st().moveEdSlot(0, -1);
    st().moveEdSlot(9, 1);
    expect(ids(day1())).toEqual(builtinA());
  });
  it('drag and drop moves a card to any position, losing and duplicating nothing', () => {
    const before = builtinA();
    for (let from = 0; from < before.length; from++) {
      for (let to = 0; to < before.length; to++) {
        useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B } });
        st().reorderEdSlot(from, to);
        const want = [...before]; want.splice(to, 0, ...want.splice(from, 1));
        expect(ids(day1())).toEqual(want);
        expect([...ids(day1())].sort()).toEqual([...before].sort());
      }
    }
    expect(builtinA()).toEqual(before);
  });
  it('drag and drop ignores a drop outside the day', () => {
    st().reorderEdSlot(0, 99); st().reorderEdSlot(-1, 2); st().reorderEdSlot(3, -1);
    expect(ids(day1())).toEqual(builtinA());
  });
  it('a card saved without an id keeps its position id when moved, by drag or by the arrows', () => {
    const bare = { ...BUILTIN.A, days: BUILTIN.A.days.map((d, di) => (di ? d : { ...d, slots: d.slots.map(({ id: _id, ...sl }) => sl) })) };
    for (const move of [() => st().reorderEdSlot(0, 2), () => st().moveEdSlot(0, 1)]) {
      useAppStore.setState({ programs: { A: bare, B: BUILTIN.B } });
      const first = day1()[0];
      move();
      const moved = day1().find(sl => sl.items[0].ex === first.items[0].ex && sl.sec === first.sec);
      expect(moved.id).toBe('A-d1s1');
      expect(new Set(ids(day1())).size).toBe(day1().length);
      expect(day1().every(sl => sl.id)).toBe(true);
    }
  });
  it('removes a card and sets or clears a day’s subtitle', () => {
    st().removeEdSlot(0);
    expect(ids(day1())).toEqual(builtinA().slice(1));
    st().setDaySub('  Pull day ');
    expect(st().edProgram().days[0].sub).toBe('Pull day');
    st().setDaySub(' ');
    expect(st().edProgram().days[0]).not.toHaveProperty('sub');
  });
  it('edits the day that is open', () => {
    st().setEdDay(3);
    st().removeEdSlot(0);
    expect(st().edProgram().days[2].slots).toHaveLength(BUILTIN.A.days[2].slots.length - 1);
    expect(day1()).toHaveLength(10);
  });
});

describe('the add/edit exercise sheet', () => {
  it('adds one card to each ticked day, each with its own id, and nothing else moves', () => {
    const before = st().edProgram().days.map(d => ids(d.slots));
    expect(st().saveSlot(newCard({ days: [5, 1, 3, 3] }))).toBeNull();
    const after = st().edProgram().days;
    const added = [1, 3, 5].map(n => after[n - 1].slots.filter(s => !before[n - 1].includes(s.id)));
    added.forEach(a => { expect(a).toHaveLength(1); expect(a[0]).toMatchObject({ sec: 'Regular', items: [{ ex: 'arnold', ph: 'strength', w: 30 }] }); });
    expect(new Set(added.map(a => a[0].id)).size).toBe(3);
    [2, 4, 6, 7].forEach(n => expect(ids(after[n - 1].slots)).toEqual(before[n - 1]));
    [1, 3, 5].forEach(n => expect(ids(after[n - 1].slots).filter(id => before[n - 1].includes(id))).toEqual(before[n - 1]));
  });
  it('asks for a day when none is ticked, and ignores the days list when editing a card', () => {
    expect(st().saveSlot(newCard({ days: [] }))).toBe('Pick at least one day.');
    const first = day1()[1];
    expect(st().saveSlot({ ...newCard({ days: [2, 3] }), id: first.id, idx: 1, sec: first.sec })).toBeNull();
    expect(day1()[1].id).toBe(first.id);
    expect(st().edProgram().days[1].slots.some(s => s.id === first.id)).toBe(false);
  });
  it('offers Optional as a section, and a new Optional section goes first', async () => {
    const { SECTIONS } = await import('./editorSlice.js');
    expect(SECTIONS).toContain('Optional');
    st().setEdDay(2); // drop the day's Optional cards first, so the section is new
    const sec = () => st().edProgram().days[1].slots.map(s => s.sec);
    while (sec().includes('Optional')) st().removeEdSlot(sec().indexOf('Optional'));
    expect(st().saveSlot(newCard({ day: 2, sec: 'Optional' }))).toBeNull();
    expect(sec()[0]).toBe('Optional');
    expect(st().edProgram().days[1].slots[0].items[0].ex).toBe('arnold');
  });
  it('adds a card after the last one in its section, and a new section before Home', () => {
    expect(st().saveSlot(newCard())).toBeNull();
    expect(day1()[6]).toMatchObject({ sec: 'Regular', items: [{ ex: 'arnold', ph: 'strength', w: 30 }] });
    st().saveSlot(newCard({ sec: 'Plyometric' }));
    expect(day1().map(s => s.sec).slice(-3)).toEqual(['Plyometric', 'Home', 'Home']);
    st().saveSlot(newCard({ sec: 'Home' }));
    expect(day1().at(-1).items[0].ex).toBe('arnold');
  });
  it('keeps an edited card in its place with its id', () => {
    const orig = day1()[2];
    st().saveSlot(newCard({ id: orig.id, idx: 2, sec: orig.sec, items: [{ ex: 'platerot', ph: 'hyp', w: 15 }] }));
    expect(day1()[2]).toMatchObject({ id: orig.id, items: [{ ex: 'platerot', ph: 'hyp', w: 15 }] });
    expect(day1()).toHaveLength(10);
  });
  it('moves an edited card to another day', () => {
    const orig = day1()[0];
    st().saveSlot(newCard({ id: orig.id, idx: 0, day: 4, sec: 'Regular', items: orig.items }));
    expect(ids(day1())).not.toContain(orig.id);
    expect(ids(st().edProgram().days[3].slots)).toContain(orig.id);
    expect(st().saveFlag).toBe('Saved to Day 4');
  });
  it('creates a new exercise from a typed name', () => {
    st().saveSlot(newCard({ items: [{ ex: '__new', nn: 'Sled Drag', nu: 'https://example.com/v', ph: 'exp', w: null, bw: true }] }));
    expect(st().cfg.ex['sled-drag']).toEqual({ n: 'Sled Drag', url: 'https://example.com/v' });
    expect(day1()[6].items[0]).toEqual({ ex: 'sled-drag', ph: 'exp', w: null, bw: true });
  });
  it('says what’s missing instead of saving', () => {
    expect(st().saveSlot(newCard({ items: [{ ex: '' }] }))).toMatch(/Choose an exercise/);
    expect(st().saveSlot(newCard({ items: [{ ex: '__new', nn: 'X', nu: 'youtube.com/x' }] }))).toMatch(/https:\/\//);
    expect(st().programs.A).toBe(BUILTIN.A);
  });
});

describe('names, saved versions and loading', () => {
  it('renames a program, and the default name clears it', () => {
    st().renameProgram('A', '  Upper/Lower ');
    expect(st().cfg.progNames).toEqual({ A: 'Upper/Lower' });
    st().renameProgram('A', 'Program A');
    expect(st().cfg.progNames).toEqual({});
  });
  it('saves a copy of the current program', () => {
    st().removeEdSlot(0);
    st().saveCurrentAs('Before deload');
    expect(st().library).toHaveLength(1);
    expect(st().library[0]).toMatchObject({ name: 'Before deload', from: 'A' });
    expect(sameProg(st().library[0].prog, st().programs.A)).toBe(true);
    expect(saved('library/main').items).toHaveLength(1);
  });
  it('loading a version first saves the current program, so nothing is lost', () => {
    st().removeEdSlot(0); // A is now an edited copy that isn't saved anywhere else
    const edited = st().programs.A;
    st().loadVersion('orig', 'A');
    expect(st().programs.A).toBe(BUILTIN.A);
    expect(saved('programs/A')).toBeNull();
    expect(st().library).toHaveLength(1);
    expect(st().library[0].auto).toBe(true);
    expect(sameProg(st().library[0].prog, edited)).toBe(true);
    // Load it back: A matches the saved copy, and no second copy is made.
    st().loadVersion(st().library[0].id, 'A');
    expect(sameProg(st().programs.A, edited)).toBe(true);
    expect(st().library).toHaveLength(1);
  });
  it('makes no copy when the current program is the original or already saved', () => {
    st().loadVersion('orig', 'A');
    expect(st().library).toEqual([]);
    st().removeEdSlot(0); st().saveCurrentAs('Mine');
    st().loadVersion('orig', 'A');
    expect(st().library.map(it => it.name)).toEqual(['Mine']);
  });
});

describe('creating a program', () => {
  it('copies A or B into the library with its own card ids and phase defaults', () => {
    useAppStore.setState(s => ({ cfg: { ...s.cfg, phDef: { 'A-sled1:0': 'strength' } } }));
    expect(st().createProgram('My plan', 'A')).toBe(true);
    const it = st().library[0];
    expect(it).toMatchObject({ name: 'My plan', from: 'A', created: true });
    const firstId = it.prog.days[0].slots[0].id;
    expect(firstId).toMatch(/^P.{5}-d1s1$/);
    expect(st().cfg.phDef[`${firstId}:0`]).toBe('strength');
    expect(st().edProg).toBe('L:' + it.id);
  });
  it('edits the copy, not the program on the board', () => {
    st().createProgram('My plan', 'A');
    st().removeEdSlot(0);
    expect(st().programs.A).toBe(BUILTIN.A);
    expect(st().library[0].prog.days[0].slots).toHaveLength(9);
    st().renameLibItem('Renamed');
    expect(st().edName()).toBe('Renamed');
  });
  it('goes back to the board’s program when the copy being edited is deleted', () => {
    st().createProgram('My plan', 'A');
    st().deleteLibItem(st().library[0].id);
    expect(st().library).toEqual([]);
    expect(st().edKey()).toBe('A');
  });
});

describe('GitHub backup with no repository set (ADR 016 step 4: no personal default)', () => {
  it('asks for a repository instead of sending anywhere', async () => {
    const calls = []; const realFetch = globalThis.fetch; globalThis.fetch = async (...a) => { calls.push(a); throw new Error('no network in this test'); };
    try {
      useAppStore.setState({ ghToken: 'test-token' });
      await st().backupDirect();
      expect(st().backupMsg).toMatchObject({ kind: 'err', text: expect.stringMatching(/Set the backup repository/) });
      await st().restoreFromGitHub();
      expect(st().backupMsg).toMatchObject({ kind: 'err', text: expect.stringMatching(/Set the backup repository/) });
      expect(calls).toHaveLength(0);
    } finally { globalThis.fetch = realFetch; useAppStore.setState({ ghToken: '', backupMsg: null }); }
  });
});

describe('a new card’s start week', () => {
  let weekSlots, tally, leftovers, colOf, countsForFinish, weekSummary, normProgram, ymd, weekStartOf, addDays;
  beforeAll(async () => {
    ({ weekSlots, tally, leftovers, colOf, countsForFinish } = await import('../lib/logic.js'));
    ({ weekSummary } = await import('../lib/trends.js'));
    ({ normProgram } = await import('../shared/validate.js'));
    ({ ymd, weekStartOf, addDays } = await import('../shared/dates.js'));
  });
  const thisWeek = () => ymd(weekStartOf(new Date()));
  const nextWeek = () => ymd(addDays(weekStartOf(new Date()), 7));
  // The board's program, open in the editor on Day `d`, with this week on the board.
  const onBoard = d => { useAppStore.setState({ weekStart: weekStartOf(new Date()), week: { ...st().week, done: {}, skipped: {}, moved: {}, rest: [] } }); st().setEdProg(st().activeProgKey()); st().setEdDay(d); return st().activeProgKey(); };
  // Finish program day `d` this week: tick its first counting card, skip the rest.
  const finish = d => {
    const w = st().week; const col = st().activeSlots().filter(s => s.day === d && countsForFinish(s));
    useAppStore.setState({ week: { ...w, done: { [col[0].id]: true }, skipped: Object.fromEntries(col.slice(1).map(s => [s.id, true])) } });
    return colOf(st().week, d);
  };
  const added = () => st().edProgram().days[st().edDay - 1].slots.find(s => s.items[0].ex === 'arnold');

  it('starts this week when its day is not finished, and counts on the board', () => {
    onBoard(2);
    expect(st().saveSlot(newCard({ day: 2 }))).toBeNull();
    expect(added().from).toBe(thisWeek());
    expect(st().activeSlots().some(s => s.id === added().id)).toBe(true);
  });
  it('starts next week when its day is already finished: the day stays finished and it is no leftover', () => {
    onBoard(1); const col = finish(1);
    const before = tally(st().activeSlots(), st().week);
    expect(st().saveSlot(newCard({ day: 1 }))).toBeNull();
    expect(added().from).toBe(nextWeek());
    const slots = st().activeSlots();
    expect(slots.some(s => s.id === added().id)).toBe(false);
    expect(tally(slots, st().week)).toEqual(before);
    expect(leftovers(st().week, slots, col).some(s => s.id === added().id)).toBe(false);
    expect(weekSlots(st().edProgram(), st().week, nextWeek()).some(s => s.id === added().id)).toBe(true);
  });
  it('adding to several days gives each copy its own start week', () => {
    onBoard(2); finish(1);
    expect(st().saveSlot(newCard({ days: [1, 2] }))).toBeNull();
    const on = d => st().edProgram().days[d - 1].slots.find(s => s.items[0].ex === 'arnold');
    expect(on(1).from).toBe(nextWeek());
    expect(on(2).from).toBe(thisWeek());
  });
  it('an edited card keeps its start week', () => {
    onBoard(1); finish(1); st().saveSlot(newCard({ day: 1 }));
    const i = st().edProgram().days[0].slots.indexOf(added());
    expect(st().saveSlot({ ...newCard({ day: 1, items: [{ ex: 'arnold', ph: 'hyp', w: 35 }] }), id: added().id, idx: i })).toBeNull();
    expect(added()).toMatchObject({ from: nextWeek(), items: [{ ph: 'hyp', w: 35 }] });
  });
  it('earlier weeks in Progress leave out a card added this week', () => {
    const k = onBoard(3); const past = ymd(addDays(weekStartOf(new Date()), -14));
    const w = { prog: k, done: {}, skipped: {}, moved: {} };
    const before = weekSummary(st().cfg, st().programs, past, w).total;
    st().saveSlot(newCard({ day: 3 }));
    expect(weekSummary(st().cfg, st().programs, past, w).total).toBe(before);
    expect(weekSummary(st().cfg, st().programs, thisWeek(), w).total).toBe(before + 1);
  });
  it('a start week survives cleaning, and a bad one is dropped', () => {
    const p = structuredClone(BUILTIN.A); p.days[0].slots = [{ id: 'x1', from: '2026-10-11', items: [{ ex: 'arnold', ph: 'strength', w: 30 }] }, { id: 'x2', from: 'soon', items: [{ ex: 'arnold', ph: 'strength', w: 30 }] }];
    const out = normProgram(p, 'A').days[0].slots;
    expect(out[0].from).toBe('2026-10-11');
    expect(out[1]).not.toHaveProperty('from');
  });
});
