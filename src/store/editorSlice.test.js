import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

let useAppStore, BUILTIN, DEFAULT_CFG, sameProg, exInfo, slotsFor;
const st = () => useAppStore.getState();
const day1 = () => st().edProgram().days[0].slots;
const ids = slots => slots.map(s => s.id);
const builtinA = () => ids(BUILTIN.A.days[0].slots);

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN, exInfo, slotsFor } = await import('../lib/data.js'));
  ({ DEFAULT_CFG } = await import('../lib/logic.js'));
  ({ sameProg } = await import('../lib/export.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], cfg: structuredClone(DEFAULT_CFG), edProg: null, edDay: 1, edMoved: null, edRemoved: null, modal: null });
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
  it('puts a removed card back where it was, once', () => {
    const before = structuredClone(day1());
    st().removeEdSlot(2);
    expect(st().edRemoved).toMatchObject({ day: 1, idx: 2, slot: before[2] });
    st().undoRemoveEdSlot();
    expect(day1()).toEqual(before);
    expect(st().edRemoved).toBeNull();
    st().undoRemoveEdSlot(); // a second Undo adds nothing
    expect(day1()).toEqual(before);
  });
  // Cards saved without an id (older saved programs) are named by their position, so these use a Day 1 with no ids.
  const idless = () => { const p = structuredClone(BUILTIN.A); p.days[0].slots.forEach(sl => { delete sl.id; }); useAppStore.setState(x => ({ programs: { ...x.programs, A: p } })); };
  it('remove, then a move, then Undo: every card keeps its own id, none shared', () => {
    idless(); const before = day1().map((s, i) => s.id || `A-d1s${i + 1}`); // what each card is called now: its position
    st().removeEdSlot(1);
    st().moveEdSlot(0, 1);
    st().undoRemoveEdSlot();
    const after = day1().map(s => s.id);
    expect(new Set(after).size).toBe(after.length);
    expect(after.slice().sort()).toEqual(before.slice().sort());
    expect(after[1]).toBe(before[1]); // the card came back where it was, with its own id
  });
  it('the cards after a removed one keep their ids, so their ticks and phase defaults stay with them', () => {
    idless(); const before = day1().map((s, i) => s.id || `A-d1s${i + 1}`); // what each card is called now: its position
    st().removeEdSlot(0);
    expect(day1().map(s => s.id)).toEqual(before.slice(1));
  });
  it('drops the Undo when you switch day, so it never lands on another day', () => {
    st().removeEdSlot(0);
    st().setEdDay(2);
    const d2 = structuredClone(st().edProgram().days[1].slots);
    st().undoRemoveEdSlot();
    expect(st().edProgram().days[1].slots).toEqual(d2);
    expect(day1()).toHaveLength(BUILTIN.A.days[0].slots.length - 1);
  });
  it('edits the day that is open', () => {
    st().setEdDay(3);
    st().removeEdSlot(0);
    expect(st().edProgram().days[2].slots).toHaveLength(BUILTIN.A.days[2].slots.length - 1);
    expect(day1()).toHaveLength(10);
  });
});

describe('moving a card to another day', () => {
  const day = n => st().edProgram().days[n - 1].slots;
  it('moves the card to the end of its section on the new day, keeping it whole', () => {
    const card = structuredClone(day1()[0]); const before3 = ids(day(3));
    st().moveEdSlotToDay(0, 3);
    expect(ids(day1())).toEqual(builtinA().slice(1));
    expect(day(3).find(s => s.id === card.id)).toEqual(card); // id, items, tier, type, note and start all kept
    expect(day(3)).toHaveLength(before3.length + 1);
    const at = day(3).findIndex(s => s.id === card.id);
    expect(day(3).filter((s, j) => s.sec === card.sec && j > at)).toHaveLength(0); // nothing of its section after it
    expect(ids(day(3)).filter(id => id !== card.id)).toEqual(before3); // the others untouched and in order
    expect(saved('programs/A').days[2].slots.map(s => s.id)).toContain(card.id);
  });
  it('loses and duplicates nothing for any card and any day', () => {
    const all = () => st().edProgram().days.flatMap(d => ids(d.slots)).sort();
    const want = all();
    for (let i = 0; i < day1().length; i++) for (let to = 2; to <= 7; to++) {
      useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B }, edDay: 1 });
      st().moveEdSlotToDay(i, to);
      expect(all()).toEqual(want);
    }
  });
  it('does nothing for the same day, a day that does not exist or a card that is not there', () => {
    const before = structuredClone(st().programs.A);
    st().moveEdSlotToDay(0, 1); st().moveEdSlotToDay(0, 8); st().moveEdSlotToDay(0, 0); st().moveEdSlotToDay(99, 2);
    expect(st().programs.A).toEqual(before);
    expect(st().edMoved).toBeNull();
  });
  it('a superset moves as one card', () => {
    const i = day1().findIndex(s => s.type === 'superset');
    const card = structuredClone(day1()[i]);
    st().moveEdSlotToDay(i, 2);
    expect(day(2).find(s => s.id === card.id)).toEqual(card);
  });
  it('a card saved without an id keeps its position id, and the cards left behind keep theirs', () => {
    const p = structuredClone(BUILTIN.A); p.days[0].slots.forEach(sl => { delete sl.id; }); p.days[1].slots.forEach(sl => { delete sl.id; });
    useAppStore.setState(x => ({ programs: { ...x.programs, A: p } }));
    const named = day1().map((s, i) => s.id || `A-d1s${i + 1}`); const named2 = day(2).map((s, i) => s.id || `A-d2s${i + 1}`);
    st().moveEdSlotToDay(1, 2);
    expect(ids(day1())).toEqual(named.filter((_, i) => i !== 1));
    expect(ids(day(2)).slice().sort()).toEqual([...named2, named[1]].sort());
  });
  it('Undo puts the card back in its old place, once', () => {
    const before = structuredClone(st().edProgram().days);
    st().moveEdSlotToDay(2, 5);
    expect(st().edMoved).toMatchObject({ from: 1, to: 5, idx: 2 });
    st().undoMoveEdSlot();
    expect(st().edProgram().days.map(d => d.slots.map(s => s.id))).toEqual(before.map(d => d.slots.map(s => s.id)));
    expect(st().edMoved).toBeNull();
    st().undoMoveEdSlot();
    expect(day1()).toHaveLength(before[0].slots.length);
  });
  it('Undo after the card was changed saves nothing and says so', () => {
    st().moveEdSlotToDay(0, 2);
    const id = st().edMoved.slot.id;
    st().editProgram(p => { p.days[1].slots.find(s => s.id === id).note = 'changed'; });
    const before = structuredClone(st().programs.A);
    st().undoMoveEdSlot();
    expect(st().programs.A).toEqual(before);
    expect(st().edMoved).toBeNull();
  });
  it('drops the Undo when you switch day or program, and a remove replaces it', () => {
    st().moveEdSlotToDay(0, 2); st().setEdDay(2);
    expect(st().edMoved).toBeNull();
    st().setEdDay(1); st().moveEdSlotToDay(0, 2); st().setEdProg('B');
    expect(st().edMoved).toBeNull();
    st().setEdProg('A'); st().moveEdSlotToDay(0, 2); st().removeEdSlot(0);
    expect(st().edMoved).toBeNull();
    expect(st().edRemoved).not.toBeNull();
  });
  it('works on a library program and never touches the built-in', () => {
    st().createProgram('Mine', 'A');
    const key = st().edKey(); expect(key.startsWith('L:')).toBe(true);
    const card = structuredClone(day1()[0]);
    st().moveEdSlotToDay(0, 4);
    expect(day(4).some(s => JSON.stringify(s) === JSON.stringify(card))).toBe(true);
    st().undoMoveEdSlot();
    expect(day1()[0]).toEqual(card);
    expect(ids(BUILTIN.A.days[0].slots)).toEqual(builtinA());
  });
});

describe('moving one exercise of a superset to another day', () => {
  const day = n => st().edProgram().days[n - 1].slots;
  const ssIdx = () => day1().findIndex(s => s.type === 'superset');
  const addCard = (type, n) => st().editProgram(p => { p.days[0].slots.push({ id: 'T-' + type + n, day: 1, sec: type === 'superset' ? 'Supersets' : 'Regular', type, items: Array.from({ length: n }, (_, j) => ({ ex: 'arnold', ph: 'strength', w: 10 + j })) }); });
  const lastIdx = () => day1().length - 1;
  it('does nothing for a plain card, an either/or card, the same day, a day that is not there or a position that is not there', () => {
    addCard('either', 2);
    const before = structuredClone(st().programs.A);
    st().moveEdItemToDay(0, 0, 2);
    st().moveEdItemToDay(lastIdx(), 0, 2);
    st().moveEdItemToDay(ssIdx(), 0, 1); st().moveEdItemToDay(ssIdx(), 0, 8); st().moveEdItemToDay(ssIdx(), 9, 2); st().moveEdItemToDay(99, 0, 2);
    expect(st().programs.A).toEqual(before);
    expect(st().edMoved).toBeNull();
  });
  it('a two-exercise superset becomes two plain cards: the rest keeps the id, the exercise lands on the other day', () => {
    addCard('superset', 2); const i = lastIdx(); const items = structuredClone(day1()[i].items);
    st().moveEdItemToDay(i, 0, 3);
    expect(day1()[i]).toMatchObject({ id: 'T-superset2', sec: 'Regular', items: [items[1]] });
    expect(day1()[i].type).toBeUndefined();
    const moved = day(3).find(x => x.id === st().edMoved.slot.id);
    expect(moved.items).toEqual([items[0]]); expect(moved.id).not.toBe('T-superset2'); expect(moved.type).toBeUndefined();
    expect(st().edMoved).toMatchObject({ from: 1, to: 3, idx: i });
  });
  it('a three-exercise superset stays a superset of two', () => {
    addCard('superset', 3); const i = lastIdx(); const items = structuredClone(day1()[i].items);
    st().moveEdItemToDay(i, 1, 2);
    expect(day1()[i].type).toBe('superset'); expect(day1()[i].items).toEqual([items[0], items[2]]);
    expect(day(2).find(x => x.id === st().edMoved.slot.id).items).toEqual([items[1]]);
  });
  it('phase defaults follow the exercise and the later ones shift up', () => {
    addCard('superset', 3); const i = lastIdx();
    useAppStore.setState(x => ({ cfg: { ...x.cfg, phDef: { 'T-superset3:0': 'iso', 'T-superset3:1': 'hyp', 'T-superset3:2': 'strength' } } }));
    st().moveEdItemToDay(i, 0, 2);
    const newId = st().edMoved.slot.id;
    expect(st().cfg.phDef).toEqual({ [`${newId}:0`]: 'iso', 'T-superset3:0': 'hyp', 'T-superset3:1': 'strength' });
  });
  it('this week\'s ticks follow their exercises: a ticked two-exercise superset keeps both ticked, and a half-ticked three-exercise one shifts up', () => {
    addCard('superset', 2); const i = lastIdx();
    useAppStore.setState(x => ({ week: { ...x.week, done: { 'T-superset2': true } } }));
    st().moveEdItemToDay(i, 1, 2);
    const newId = st().edMoved.slot.id;
    expect(st().week.done).toEqual({ 'T-superset2': true, [newId]: true });
    addCard('superset', 3); const i3 = lastIdx();
    useAppStore.setState(x => ({ week: { ...x.week, done: { 'T-superset3#1': true }, skipped: { 'T-superset3#2': true }, ph: {} } }));
    st().moveEdItemToDay(i3, 0, 2);
    expect(st().week.done).toEqual({ 'T-superset3#0': true });
    expect(st().week.skipped).toEqual({ 'T-superset3#1': true });
  });
  it('Undo puts the superset, its phase defaults and this week\'s state back', () => {
    addCard('superset', 3); const i = lastIdx(); const card = structuredClone(day1()[i]);
    const phDef = { 'T-superset3:0': 'iso', 'T-superset3:2': 'hyp' };
    useAppStore.setState(x => ({ cfg: { ...x.cfg, phDef: { ...phDef } }, week: { ...x.week, done: { 'T-superset3#1': true }, skipped: { 'T-superset3#2': true }, ph: {} } }));
    const week = structuredClone(st().week.done); const skipped = structuredClone(st().week.skipped);
    const before = structuredClone(st().programs.A);
    st().moveEdItemToDay(i, 0, 4);
    st().undoMoveEdSlot();
    expect(day1()[i]).toEqual(card); expect(day(4)).toHaveLength(before.days[3].slots.length);
    expect(st().cfg.phDef).toEqual(phDef); expect(st().week.done).toEqual(week); expect(st().week.skipped).toEqual(skipped);
    expect(st().edMoved).toBeNull();
  });
  it('Undo says it could not put it back when the moved exercise was changed, and saves nothing', () => {
    addCard('superset', 2); st().moveEdItemToDay(lastIdx(), 0, 2);
    const id = st().edMoved.slot.id;
    st().editProgram(p => { p.days[1].slots.find(s => s.id === id).note = 'changed'; });
    const before = structuredClone(st().programs.A);
    st().undoMoveEdSlot();
    expect(st().programs.A).toEqual(before);
    expect(st().edMoved).toBeNull();
  });
  it('Undo says it could not put it back when the superset it left was removed', () => {
    addCard('superset', 2); st().moveEdItemToDay(lastIdx(), 0, 2);
    st().editProgram(p => { p.days[0].slots.pop(); });
    const before = structuredClone(st().programs.A);
    st().undoMoveEdSlot();
    expect(st().programs.A).toEqual(before);
    expect(st().edMoved).toBeNull();
  });
});

describe('moving a card to another program', () => {
  const dayOf = (key, n) => (key.startsWith('L:') ? st().library.find(x => 'L:' + x.id === key).prog : st().programs[key]).days[n - 1].slots;
  const total = () => ['A', 'B'].reduce((a, k) => a + st().programs[k].days.reduce((b, d) => b + d.slots.length, 0), 0);
  it('moves the card to the end of its section in the other program with a new id, keeping what it holds', () => {
    const card = structuredClone(day1()[0]); const before3 = ids(dayOf('B', 3));
    st().moveEdSlotToProgram(0, 'B', 3);
    expect(ids(day1())).toEqual(builtinA().slice(1));
    const got = dayOf('B', 3).find(s => !before3.includes(s.id));
    expect(got.id).toMatch(/^B-x/);
    expect({ ...got, id: card.id }).toEqual(card);
    expect(ids(dayOf('B', 3)).filter(id => id !== got.id)).toEqual(before3);
    expect(dayOf('B', 3).filter((s, j) => j > dayOf('B', 3).indexOf(got) && s.sec === card.sec)).toHaveLength(0);
    expect(saved('programs/B').days[2].slots.map(s => s.id)).toContain(got.id);
    expect(st().edMoved).toMatchObject({ key: 'A', from: 1, to: 3, toKey: 'B', toLabel: 'Program B' });
  });
  it('a target day saved without ids keeps each of its cards’ own ids when the new card goes in', () => {
    const p = structuredClone(BUILTIN.B); p.days[2].slots.forEach(sl => { delete sl.id; });
    useAppStore.setState(x => ({ programs: { ...x.programs, B: p } }));
    const named = dayOf('B', 3).map((s, i) => s.id || `B-d3s${i + 1}`);
    st().moveEdSlotToProgram(0, 'B', 3);
    const after = ids(dayOf('B', 3));
    expect(after.filter(id => !id.startsWith('B-x'))).toEqual(named);
    expect(after).toHaveLength(named.length + 1);
  });
  it('carries the phase defaults to the new id', () => {
    const first = day1()[0].id; const second = day1()[1].id;
    useAppStore.setState(x => ({ cfg: { ...x.cfg, phDef: { [first + ':0']: 'hyp', [second + ':0']: 'iso' } } }));
    st().moveEdSlotToProgram(0, 'B', 2);
    const got = dayOf('B', 2).find(s => s.id.startsWith('B-x'));
    expect(st().cfg.phDef[got.id + ':0']).toBe('hyp');
    expect(st().cfg.phDef[second + ':0']).toBe('iso');
  });
  it('loses and duplicates nothing for any card, program and day', () => {
    const want = total();
    for (let i = 0; i < day1().length; i++) for (let to = 1; to <= 7; to++) {
      useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B }, edDay: 1, edProg: null });
      st().moveEdSlotToProgram(i, 'B', to);
      expect(total()).toBe(want);
    }
  });
  it('moves to and from a saved program, and the saved program is the one edited', () => {
    st().createProgram('Mine', 'A'); const lib = 'L:' + st().library[0].id;
    st().setEdProg('A'); st().setEdDay(1);
    st().moveEdSlotToProgram(0, lib, 5);
    expect(dayOf(lib, 5).some(s => s.id.startsWith('N-x'))).toBe(true);
    expect(ids(day1())).toEqual(builtinA().slice(1));
    st().setEdProg(lib); st().setEdDay(5);
    const i = dayOf(lib, 5).findIndex(s => s.id.startsWith('N-x'));
    st().moveEdSlotToProgram(i, 'B', 1);
    expect(dayOf(lib, 5).some(s => s.id.startsWith('N-x'))).toBe(false);
    expect(dayOf('B', 1).some(s => s.id.startsWith('B-x'))).toBe(true);
  });
  it('the same program is the same-program move: the id is kept', () => {
    const card = structuredClone(day1()[0]);
    st().moveEdSlotToProgram(0, 'A', 4);
    expect(dayOf('A', 4).find(s => s.id === card.id)).toEqual(card);
    expect(st().edMoved.toKey).toBeUndefined();
  });
  it('refuses a program that is gone and changes nothing', () => {
    const before = structuredClone(st().programs);
    st().moveEdSlotToProgram(0, 'L:gone', 2);
    expect(st().programs).toEqual(before);
    expect(st().edMoved).toBeNull();
  });
  it('Undo puts the card back in its program, day, place and id, and takes it out of the other', () => {
    const before = structuredClone(day1());
    st().moveEdSlotToProgram(2, 'B', 6);
    st().undoMoveEdSlot();
    expect(day1()).toEqual(before);
    expect(dayOf('B', 6).some(s => s.id.startsWith('B-x'))).toBe(false);
    expect(st().edMoved).toBeNull();
    st().undoMoveEdSlot();
    expect(day1()).toEqual(before);
  });
  it('Undo after the card was changed in the other program saves nothing', () => {
    st().moveEdSlotToProgram(0, 'B', 2);
    const id = st().edMoved.slot.id;
    st().saveProgram('B', { ...st().programs.B, days: st().programs.B.days.map(d => ({ ...d, slots: d.slots.map(s => (s.id === id ? { ...s, note: 'changed' } : s)) })) });
    const a = structuredClone(st().programs.A); const b = structuredClone(st().programs.B);
    st().undoMoveEdSlot();
    expect(st().programs.A).toEqual(a);
    expect(st().programs.B).toEqual(b);
    expect(st().edMoved).toBeNull();
  });
  it('Go to: the notice is dropped by switching program, like any other', () => {
    st().moveEdSlotToProgram(0, 'B', 2);
    st().setEdProg('B');
    expect(st().edMoved).toBeNull();
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
  it('adds a catalog exercise picked in the sheet to the library with the card, and nothing when the save is refused (ADR 036)', () => {
    const fly = { id: 'c:fedb:Cable_Fly', name: 'Cable Fly', data: { eq: 'cable', muscles: { p: ['chest'] } } };
    const item = { ex: fly.id, nn: '', cat: fly, ne: 'cable', ph: 'hyp', w: null };
    const cfgBefore = structuredClone(st().cfg);
    expect(st().saveSlot(newCard({ days: [], items: [item] }))).toBe('Pick at least one day.');
    expect(st().cfg).toEqual(cfgBefore);
    const before = day1().length;
    expect(st().saveSlot(newCard({ days: [1], items: [item] }))).toBeNull();
    expect(st().cfg.ex[fly.id]).toEqual({ n: 'Cable Fly', eq: 'cable' });
    expect(st().cfg.muscleMap[fly.id]).toEqual({ p: ['chest'] });
    expect(day1()).toHaveLength(before + 1);
    expect(day1().filter(s => s.items[0].ex === fly.id)).toHaveLength(1);
    // Picked again once it is in the library: used as it is, not added twice.
    expect(st().saveSlot(newCard({ days: [2], items: [item] }))).toBeNull();
    expect(Object.keys(st().cfg.ex).filter(k => k === fly.id)).toHaveLength(1);
    // A catalog name you already use is refused before anything is written.
    st().mutateCfg(c => { c.ex.mine = { n: 'Hammer Row' }; });
    const progBefore = structuredClone(st().programs);
    expect(st().saveSlot(newCard({ days: [1], items: [{ ...item, ex: 'c:fedb:Hammer', cat: { id: 'c:fedb:Hammer', name: 'hammer row', data: {} } }] }))).toBe('You already have an exercise called hammer row.');
    expect(st().programs).toEqual(progBefore);
  });
  it('synced, refuses a catalog exercise whose name a built-in in your program has, though the library does not list it (ADR 024, 036)', async () => {
    const { listBuiltinExercises } = await import('../lib/data.js');
    expect(slotsFor(st().programs.A).some(sl => sl.items.some(i => i.ex === 'hack'))).toBe(true); // Program A uses Hack Squat
    const hack = { id: 'c:fedb:Hack_Squat', name: 'Hack Squat', data: { eq: 'machine' } };
    listBuiltinExercises(false);
    try {
      const cfgBefore = structuredClone(st().cfg); const progBefore = structuredClone(st().programs);
      expect(st().saveSlot(newCard({ days: [2], items: [{ ex: hack.id, nn: '', cat: hack, ph: 'hyp', w: null }] }))).toBe('You already have an exercise called Hack Squat.');
      expect(st().addCatalogExercise(hack)).toBe('You already have an exercise called Hack Squat.');
      expect(st().cfg).toEqual(cfgBefore);
      expect(st().programs).toEqual(progBefore);
    } finally { listBuiltinExercises(true); }
  });
  it('refuses a card whose two items would add different exercises with one name, writing nothing', () => {
    const fly = { id: 'c:fedb:Cable_Fly', name: 'Cable Fly', data: {} };
    const pick = { ex: fly.id, nn: '', cat: fly, ph: 'hyp', w: null };
    const cfgBefore = structuredClone(st().cfg); const progBefore = structuredClone(st().programs);
    const superset = items => newCard({ type: 'superset', days: [1], items });
    expect(st().saveSlot(superset([{ ex: '__new', nn: 'cable fly', ph: 'hyp', w: null }, pick]))).toBe('Cable Fly is used twice in this card as different exercises. Pick the same one for both.');
    expect(st().saveSlot(superset([pick, { ...pick, ex: 'c:other:Fly', cat: { id: 'c:other:Fly', name: 'Cable  Fly', data: {} } }]))).toMatch(/used twice/);
    expect(st().cfg).toEqual(cfgBefore);
    expect(st().programs).toEqual(progBefore);
    expect(st().saveSlot(superset([pick, pick]))).toBeNull(); // the same pick on both: one exercise
    expect(Object.values(st().cfg.ex).filter(x => x.n === 'Cable Fly')).toHaveLength(1);
  });
  it('asks for a day when none is ticked, and ignores the days list when editing a card', () => {
    expect(st().saveSlot(newCard({ days: [] }))).toBe('Pick at least one day.');
    const cfgBefore = structuredClone(st().cfg); const progBefore = structuredClone(st().programs);
    expect(st().saveSlot(newCard({ days: [], items: [{ ex: '__new', nn: 'Farmer Carry Test', nu: 'https://youtu.be/abc', ph: 'strength', w: null }] }))).toBe('Pick at least one day.');
    expect(st().cfg).toEqual(cfgBefore);
    expect(st().programs).toEqual(progBefore);
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
  it('equipment picked for an existing exercise replaces its saved one everywhere', () => {
    const orig = day1()[2];
    st().saveSlot(newCard({ id: orig.id, idx: 2, sec: orig.sec, items: [{ ex: 'platerot', ph: 'hyp', w: 15, ne: 'dumbbell' }] }));
    expect(st().cfg.ex.platerot).toMatchObject({ eq: 'dumbbell' });
    st().saveSlot(newCard({ id: orig.id, idx: 2, sec: orig.sec, items: [{ ex: 'platerot', ph: 'hyp', w: 15, ne: 'plate' }] }));
    expect(st().cfg.ex.platerot).toBeUndefined(); // back to the built-in value: no override kept
    st().saveSlot(newCard({ id: orig.id, idx: 2, sec: orig.sec, items: [{ ex: 'platerot', ph: 'hyp', w: 15, ne: '' }] }));
    expect(exInfo(st().cfg, 'platerot').eq).toBe(''); // Not set picked: the built-in equipment is cleared
  });
  it('a save that never showed the equipment field leaves the saved equipment alone', () => {
    const orig = day1()[2];
    st().saveSlot(newCard({ id: orig.id, idx: 2, sec: orig.sec, items: [{ ex: 'platerot', ph: 'hyp', w: 15 }] }));
    expect(st().cfg.ex.platerot).toBeUndefined();
    expect(exInfo(st().cfg, 'platerot').eq).toBe('plate');
  });
  it('says what’s missing instead of saving', () => {
    expect(st().saveSlot(newCard({ items: [{ ex: '' }] }))).toMatch(/Choose an exercise/);
    expect(st().saveSlot(newCard({ items: [{ ex: '__new', nn: 'X', nu: 'youtube.com/x' }] }))).toMatch(/https:\/\//);
    expect(st().programs.A).toBe(BUILTIN.A);
  });
});

describe('names, saved versions and loading', () => {
  it('a program loaded from the library gives the slot its name', () => {
    st().removeEdSlot(0); st().saveCurrentAs('Upper/Lower');
    st().loadVersion(st().library[0].id, 'B');
    expect(st().cfg.progNames).toEqual({ B: 'Upper/Lower' });
    expect(st().edName()).toBe('Upper/Lower');
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
  it('the same library program in A and B gets its own card ids in the second slot, with its phase defaults', async () => {
    const { slotsFor } = await import('../lib/data.js');
    const first = BUILTIN.A.days[0].slots[1].id; // a card with a stored id
    useAppStore.setState(s => ({ cfg: { ...s.cfg, phDef: { [`${first}:0`]: 'hyp' } } }));
    st().saveCurrentAs('Shared');
    const id = st().library[0].id;
    st().loadVersion(id, 'B'); // B now holds A's cards
    const a = slotsFor(st().programs.A).map(s => s.id); const b = slotsFor(st().programs.B).map(s => s.id);
    expect(b).toHaveLength(a.length);
    expect(b.filter(x => a.includes(x))).toEqual([]); // no card shared between A and B
    expect(st().cfg.phDef[`${b[1]}:0`]).toBe('hyp'); // the phase default moved to the new id
    expect(st().cfg.phDef[`${first}:0`]).toBe('hyp'); // and A's own is untouched
  });
  it('loading a version back into the slot it came from keeps its card ids, so the week\u2019s ticks stay with them', async () => {
    const { slotsFor } = await import('../lib/data.js');
    st().setEdDay(2); st().removeEdSlot(0); // A is now an edited copy (Day 1 unchanged)
    const before = slotsFor(st().programs.A).map(s => s.id);
    st().saveCurrentAs('Mine');
    st().loadVersion(st().library[0].id, 'A');
    expect(slotsFor(st().programs.A).map(s => s.id)).toEqual(before);
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
  it('starts an empty program with seven empty days, from nothing', () => {
    expect(st().createProgram('Mine', 'empty')).toBe(true);
    const it = st().library[0];
    expect(it).toMatchObject({ name: 'Mine', created: true });
    expect(it).not.toHaveProperty('from');
    expect(it.prog.days).toHaveLength(7);
    expect(it.prog.days.every(d => d.slots.length === 0)).toBe(true);
    expect(st().edProg).toBe('L:' + it.id);
  });
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
  it('Undo puts a deleted program back where it was, saved, once', () => {
    st().saveCurrentAs('One'); st().saveCurrentAs('Two'); st().saveCurrentAs('Three');
    const before = st().library.map(x => x.id);
    st().deleteLibItem(before[1]);
    expect(st().library.some(x => x.id === before[1])).toBe(false);
    expect(st().removed).toMatchObject({ scope: 'library' });
    expect(saved('library/main').items).toHaveLength(2);
    st().undoRemoved();
    expect(st().library.map(x => x.id)).toEqual(before);
    expect(saved('library/main').items.map(x => x.id)).toEqual(before);
    st().undoRemoved(); // nothing left to undo
    expect(st().library.map(x => x.id)).toEqual(before);
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
