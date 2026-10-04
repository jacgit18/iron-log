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
