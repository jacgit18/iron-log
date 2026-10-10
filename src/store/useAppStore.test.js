import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mem, clearStorage, saved } from '../test/browserStubs.js';

let useAppStore, BUILTIN, warmupOf, withAllDays, DEFAULT_CFG, currentLayout, defaultLogDate, dayDate, tally, phaseOf, orderOf;
const st = () => useAppStore.getState();

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN, warmupOf, withAllDays } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, currentLayout, defaultLogDate, dayDate, tally, phaseOf, orderOf } = await import('../lib/logic.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ logs: {}, week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} }, body: [], library: [], experiments: [], modal: null, edProg: null, edDay: 1, cfg: structuredClone(DEFAULT_CFG), programs: { A: BUILTIN.A, B: BUILTIN.B }, weekHist: null });
});

// Program A runs in mode 1; A-d3s1 is Hack Squat (Hypertrophy, 270 lb, 4 × 15).
describe('checking off on the board', () => {
  it('logs the planned numbers, and unchecking removes them', () => {
    st().checkCard('A-d3s1', true);
    expect(st().logs.hack).toHaveLength(1);
    expect(st().logs.hack[0]).toMatchObject({ w: 270, s: 4, r: 15, auto: true, slot: 'A-d3s1', wk: st().weekKey() });
    expect(saved('logs/hack').entries).toHaveLength(1);
    st().checkCard('A-d3s1', false);
    expect(st().logs.hack).toEqual([]);
    expect(saved('logs/hack').entries).toEqual([]);
  });

  it('logging real numbers replaces the planned entry', () => {
    st().checkCard('A-d3s1', true);
    const wk = st().weekKey();
    st().submitLog('A-d3s1', 0, { entry: { d: wk, ph: 'hyp', w: 275, s: 4, r: 12, slot: 'A-d3s1', wk }, ph: 'hyp', done: true });
    expect(st().logs.hack).toEqual([expect.objectContaining({ w: 275, r: 12 })]);
    expect(st().logs.hack[0].auto).toBeUndefined();
    // Unchecking removes what you logged for the card this week too.
    st().checkCard('A-d3s1', false);
    expect(st().logs.hack).toEqual([]);
    expect(st().uncheckNote.text).toMatch(/removed 1 logged entry/);
  });

  it('unchecking leaves entries from other weeks and other cards alone, and skipping keeps what you logged', () => {
    const wk = st().weekKey();
    const old = { d: '2026-01-04', ph: 'hyp', w: 250, s: 4, r: 12, slot: 'A-d3s1', wk: '2026-01-04' };
    useAppStore.setState({ logs: { hack: [old] } });
    st().submitLog('A-d3s1', 0, { entry: { d: wk, ph: 'hyp', w: 275, s: 4, r: 12, slot: 'A-d3s1', wk }, ph: 'hyp', done: true });
    st().submitLog('A-d1s1', 0, { entry: { d: wk, ph: 'hyp', w: 45, s: 4, r: 12, slot: 'A-d1s1', wk }, ph: 'hyp', done: true });
    st().skipCard('A-d3s1'); // skipping isn't unchecking
    expect(st().logs.hack).toHaveLength(2);
    st().skipCard('A-d3s1'); // undo the skip
    st().checkCard('A-d3s1', true);
    st().checkCard('A-d3s1', false);
    expect(st().logs.hack).toEqual([old]);
    expect(st().logs.latpd).toHaveLength(1); // the other card's log is untouched
  });

  it('skipping a half-done superset keeps the ticked exercise done', () => {
    const slot = st().activeSlots().find(s => s.id === 'A-d1s6');
    st().checkItem('A-d1s6', 0, true);
    st().skipCard('A-d1s6');
    expect(st().week.skipped['A-d1s6']).toBe(true);
    expect(st().week.done['A-d1s6#0']).toBe(true);
    expect(tally([slot], st().week)).toMatchObject({ total: 1, done: 1, skipped: 1 });
    st().skipCard('A-d1s6'); // undo the skip: the tick is still there
    expect(st().week.done['A-d1s6#0']).toBe(true);
  });

  it('checking a whole day logs every card on it, and skipping a card removes its entry', () => {
    st().checkDay(3, true);
    const day3 = st().activeSlots().filter(s => s.day === 3);
    // An either/or card logs the one option it counts as done (the first, when none was picked).
    const exIds = [...new Set(day3.flatMap(s => (s.type === 'either' ? s.items.slice(0, 1) : s.items).map(i => i.ex)))];
    exIds.forEach(id => expect(st().logs[id]?.length, id).toBe(1));
    expect(st().logs.facepull).toBeUndefined();
    st().skipCard('A-d3s1');
    expect(st().logs.hack).toEqual([]);
  });
});

describe('warm-up list', () => {
  it('starts with Shadow box only, and items can be added and removed', () => {
    expect(warmupOf(st().cfg).map(x => x.id)).toEqual(['shadow']);
    expect(st().addWarmup('  ', '')).toBe(false);
    expect(st().addWarmup(' Band pull-aparts ', '2 × 15')).toBe(true);
    const [a, b] = warmupOf(st().cfg);
    expect(b).toMatchObject({ n: 'Band pull-aparts', rx: '2 × 15' });
    st().removeWarmup(a.id);
    expect(warmupOf(st().cfg).map(x => x.n)).toEqual(['Band pull-aparts']);
    st().removeWarmup(b.id);
    expect(warmupOf(st().cfg)).toEqual([]); // an emptied list stays empty
  });
});

describe('sled cards', () => {
  it('are Optional Explosive 1 × 3 cards, first on every day with exercises, push → lateral pull in A and push → pull in B', () => {
    [['A', 'sledlat'], ['B', 'sled']].forEach(([k, ex]) => {
      const days = BUILTIN[k].days.filter(d => d.slots.length);
      expect(days.length).toBeGreaterThan(0);
      days.forEach(d => expect(d.slots[0]).toMatchObject({ note: 'Optional', items: [{ ex, ph: 'exp', rx: '1 × 3' }] }));
    });
  });
  it('are added once to a saved program, so deleting one stays deleted', () => {
    const saved = { days: [{ title: 'Day 1', slots: [{ sec: 'Regular', items: [{ ex: 'hack' }] }] }, { title: 'Day 2', slots: [] }, ...Array.from({ length: 4 }, (_, i) => ({ title: `Day ${i + 3}`, slots: [] }))] };
    const once = withAllDays(saved);
    expect(once.days[0].slots).toHaveLength(2);
    expect(once.days[1].slots).toHaveLength(0);
    const trimmed = { ...once, days: once.days.map((d, i) => (i ? d : { ...d, slots: d.slots.slice(0, 1) })) };
    expect(withAllDays(trimmed).days[0].slots).toHaveLength(1);
  });
  it('move to the top of a saved program, and never share an id with another card', () => {
    // A saved program where the sled card sits last and has the same id as an earlier card (a gap left by a deleted one).
    const sled = { id: 'A-d1s2', sec: 'Optional', items: [{ ex: 'sledlat', ph: 'exp', rx: '1 × 3' }] };
    const saved = { key: 'A', days: [{ title: 'Day 1', slots: [{ id: 'A-d1s1', sec: 'Regular', items: [{ ex: 'hack' }] }, { id: 'A-d1s2', sec: 'Regular', items: [{ ex: 'latpd' }] }, sled] }, ...Array.from({ length: 5 }, (_, i) => ({ title: `Day ${i + 2}`, slots: [] }))] };
    const slots = withAllDays(saved).days[0].slots;
    expect(slots.map(sl => sl.items[0].ex)).toEqual(['sledlat', 'hack', 'latpd']);
    expect(new Set(slots.map(sl => sl.id)).size).toBe(3);
    expect(slots.slice(1).map(sl => sl.id)).toEqual(['A-d1s1', 'A-d1s2']); // the other cards keep their ids
  });
  it('keep positional ids on cards that had none when the sled card goes in front', () => {
    const slots = withAllDays({ key: 'A', days: [{ title: 'Day 1', slots: [{ sec: 'Regular', items: [{ ex: 'hack' }] }] }, ...Array.from({ length: 5 }, (_, i) => ({ title: `Day ${i + 2}`, slots: [] }))] }).days[0].slots;
    expect(slots.map(sl => sl.id)).toEqual(['A-sled1', 'A-d1s1']);
  });
});

describe('erase data', () => {
  const fill = () => {
    st().checkCard('A-d3s1', true);
    st().saveBodyWeight(180);
    st().setRm('hack', '400');
    st().setGhRepo('me/log');
    useAppStore.setState({ library: [{ id: 'x', name: 'v1', prog: BUILTIN.B }] }); st().saveLibrary();
    st().saveProgram('A', { ...BUILTIN.A, days: BUILTIN.A.days.slice() });
    mem['ironlog:weeks/2020-01-05'] = JSON.stringify({ done: { 'A-d1s1': true } });
  };

  it('erases only what was picked', async () => {
    fill();
    await st().eraseData({ logs: true, weeks: false, body: false, programs: false, settings: false });
    expect(st().logs).toEqual({});
    expect(saved('logs/hack')).toBeNull();
    expect(st().week.done).toEqual({ 'A-d3s1': true });
    expect(st().body).toHaveLength(1);
    expect(st().cfg.rm).toEqual({ hack: 400 });
  });

  it('erases everything and keeps the GitHub backup settings', async () => {
    fill();
    await st().eraseData({ logs: true, weeks: true, body: true, programs: true, settings: true });
    const s = st();
    expect([s.logs, s.week.done, s.body, s.library]).toEqual([{}, {}, [], []]);
    expect(s.programs).toEqual({ A: BUILTIN.A, B: BUILTIN.B });
    expect(s.cfg.rm).toEqual({});
    expect(s.cfg.ghBackup.repo).toBe('me/log');
    expect(Object.keys(mem).filter(k => /^ironlog:(logs|weeks|programs)\//.test(k))).toEqual([]);
    expect(saved('body/main').entries).toEqual([]);
    expect(s.saveFlag).toBe('Data erased');
  });
});

// Program A: A-d1s1 is on Day 1, A-d3s1 (Hack Squat) on Day 3; Day 7 is empty.
describe('rest day', () => {
  const ids = d => currentLayout(st().week, st().activeSlots())[d].map(s => s.id);

  it('shifts later workouts one day, saves the week, and clears on a second tick', () => {
    expect(st().setRestDay(3)).toBe(true);
    expect(st().week.rest).toEqual([3]);
    expect(saved('weeks/' + st().weekKey()).rest).toEqual([3]);
    expect(ids(3)).toEqual([]);
    expect(ids(4)).toContain('A-d3s1');
    expect(st().setRestDay(3)).toBe(true);
    expect(st().week.rest).toBeUndefined();
    expect(ids(3)).toContain('A-d3s1');
  });
  it('reports the workouts a second rest day would push off the week', () => {
    st().mutateWeek(w => { w.skipped['A-d6s1'] = true; });
    st().setRestDay(3);
    expect(st().restOverflow(2).length).toBeGreaterThan(0); // the rest of Day 6 would still fall off
  });
  it('allows several rest days and unticks one at a time', () => {
    st().setRestDay(2); st().setRestDay(5, { skipOverflow: true });
    expect(st().week.rest).toEqual([2, 5]);
    st().setRestDay(2);
    expect(st().week.rest).toEqual([5]);
    st().setRestDay(5);
    expect(st().week.rest).toBeUndefined();
    expect(st().week.restOn).toBeUndefined();
  });
  it('refuses a rest day that pushes workouts off the week, unless told to skip them', () => {
    st().setRestDay(1);
    const over = st().restOverflow(2);
    expect(over.length).toBeGreaterThan(0);
    expect(st().setRestDay(2)).toBe(false);
    expect(st().week.rest).toEqual([1]);
    expect(st().setRestDay(2, { skipOverflow: true })).toBe(true);
    expect(st().week.rest).toEqual([1, 2]);
    over.forEach(s => expect(st().week.skipped[s.id]).toBe(true));
    st().setRestDay(2);
    expect(st().week.rest).toEqual([1]);
  });
  it('is blocked, with a message, when Day 7 has exercises', () => {
    st().mutateWeek(w => { w.moved['A-d3s1'] = 7; });
    expect(st().setRestDay(2)).toBe(false);
    expect(st().week.rest).toBeUndefined();
  });
  it('moves a card to the program day behind a displayed day', () => {
    st().setRestDay(3);
    st().moveSlot('A-d1s1', 5); // displayed Day 5 is program Day 4
    expect(st().week.moved['A-d1s1']).toBe(4);
    expect(ids(5)).toContain('A-d1s1');
    st().undoMove();
    expect(st().week.moved['A-d1s1']).toBeUndefined();
  });
  it('refuses to move a card onto the rest day', () => {
    st().setRestDay(3);
    st().moveSlot('A-d1s1', 3);
    expect(st().week.moved['A-d1s1']).toBeUndefined();
  });
  it('checks off a displayed day', () => {
    st().setRestDay(3);
    st().checkDay(4, true); // displayed Day 4 holds program Day 3
    expect(st().week.done['A-d3s1']).toBe(true);
  });
});

describe('swap days', () => {
  const ids = d => currentLayout(st().week, st().activeSlots())[d].map(s => s.id);

  it('swaps two columns for this week, saves the order, and follows the workout on a phone', () => {
    expect(st().swapDays(6, 1)).toBe(true);
    expect(st().week.order).toEqual([1, 2, 3, 4, 5, 7, 6]);
    expect(saved('weeks/' + st().weekKey()).order).toEqual([1, 2, 3, 4, 5, 7, 6]);
    expect(ids(6)).toEqual([]);
    expect(ids(7)).toContain('A-d6s1');
    expect(st().mDay).toBe(7);
  });
  it('swapping back removes the order', () => {
    st().swapDays(6, 1); st().swapDays(7, -1);
    expect(st().week.order).toBeUndefined();
    expect(ids(6)).toContain('A-d6s1');
  });
  it('does nothing past the ends', () => {
    expect(st().swapDays(1, -1)).toBe(false);
    expect(st().swapDays(7, 1)).toBe(false);
    expect(st().week.order).toBeUndefined();
  });
  it('swapping a workout with the rest column moves the rest day', () => {
    st().setRestDay(3);
    expect(st().swapDays(2, 1)).toBe(true); // Day 2 workout <-> rest at column 3
    expect(st().week.rest).toEqual([2]);
    expect(st().week.order).toBeUndefined();
    expect(st().swapDays(2, 1)).toBe(true); // rest at 2 <-> column 3 workout
    expect(st().week.rest).toEqual([3]);
  });
  it('swaps two workouts across a rest day', () => {
    st().setRestDay(3);
    expect(st().swapDays(4, 1)).toBe(true); // columns 4 and 5 show workouts 3 and 4
    expect(st().week.order).toEqual([1, 2, 4, 3, 5, 6, 7]);
    expect(ids(4)).toContain('A-d4s1');
    expect(ids(5)).toContain('A-d3s1');
  });
  it('never touches the hidden last workout position while a rest day is set', () => {
    st().setRestDay(3);
    for (let d = 1; d <= 6; d++) st().swapDays(d, 1);
    expect((st().week.order || [])[6] ?? 7).toBe(7);
  });
  it('blocks a rest day when the empty day has been swapped away from the end, and allows it once it is back', () => {
    st().swapDays(6, 1); // the Day 6 workout now sits last
    expect(st().setRestDay(2)).toBe(false);
    expect(st().week.rest).toBeUndefined();
    st().swapDays(7, -1);
    expect(st().setRestDay(2)).toBe(true);
  });
  it('moves a card onto the workout shown in the column, and undo restores it', () => {
    st().swapDays(6, 1);
    st().moveSlot('A-d1s1', 7); // column 7 shows the Day 6 workout
    expect(st().week.moved['A-d1s1']).toBe(6);
    expect(ids(7)).toContain('A-d1s1');
    st().moveSlot('A-d1s1', 1); // back to its home column
    expect(st().week.moved['A-d1s1']).toBeUndefined();
  });
  it('moving after a swap can be undone, and the note remembers the home column', () => {
    st().swapDays(4, 1); // columns 4 and 5 now show workouts 5 and 4
    st().moveSlot('A-d1s1', 4);
    expect(st().week.moved['A-d1s1']).toBe(5);
    const n = st().moveNote;
    expect(n.fromShown).toBe(1);
    st().undoMove();
    expect(st().week.moved['A-d1s1']).toBeUndefined();
  });
  it('a move that clashes suggests a clash-free day, and moving there clears the heads-up', () => {
    // A-d6s5 (Arnold Press + Zercher Squat) is also on Day 4 as A-d4s4; Day 5 sits right after it.
    st().moveSlot('A-d6s5', 5);
    expect(st().moveNote.lines.length).toBeGreaterThan(0);
    expect(st().moveNote.alt).toBe(7); // Day 6 is where it came from; Day 7 is empty
    st().moveSlot('A-d6s5', st().moveNote.alt);
    expect(st().moveNote).toBeNull();
  });
  it('a move with no clash has no suggestion', () => {
    st().moveSlot('A-d6s5', 7);
    expect(st().moveNote).toBeNull();
  });
  it('keeps a check-off with its workout across a swap', () => {
    st().checkCard('A-d6s1', true);
    st().swapDays(6, 1);
    expect(st().week.done['A-d6s1']).toBe(true);
    expect(ids(7)).toContain('A-d6s1');
  });
});

describe('day dates', () => {
  it('stamps the rest day with today’s date, keeps it when the rest day moves, and clears it on untick', () => {
    st().setRestDay(3);
    expect(st().week.restOn).toBe(defaultLogDate(st().weekStart));
    st().mutateWeek(w => { w.restOn = '2026-01-04'; });
    st().swapDays(3, -1); // the swap arrows move the rest day
    expect(st().week.rest).toEqual([2]);
    expect(st().week.restOn).toBe('2026-01-04');
    st().swapDays(2, 1);
    expect(st().week.rest).toEqual([3]);
    expect(st().week.restOn).toBe('2026-01-04');
    st().setRestDay(3); // untick
    expect(st().week.rest).toBeUndefined();
    expect(st().week.restOn).toBeUndefined();
    st().setRestDay(3); // ticking again stamps a fresh date
    expect(st().week.restOn).toBe(defaultLogDate(st().weekStart));
  });
  it('a check-off dates its board, and unchecking removes the date', () => {
    const cards = () => currentLayout(st().week, st().activeSlots())[3];
    expect(dayDate(cards(), st().logs, st().weekKey())).toBeNull();
    st().checkCard('A-d3s1', true);
    expect(dayDate(cards(), st().logs, st().weekKey())).toBe(defaultLogDate(st().weekStart));
    st().checkCard('A-d3s1', false);
    expect(dayDate(cards(), st().logs, st().weekKey())).toBeNull();
  });
  it('the date stays with the workout when days are swapped', () => {
    st().checkCard('A-d6s1', true);
    st().swapDays(6, 1);
    const col7 = currentLayout(st().week, st().activeSlots())[7];
    expect(dayDate(col7, st().logs, st().weekKey())).toBe(defaultLogDate(st().weekStart));
  });
});

describe('bulk skip and move (yesterday’s leftovers)', () => {
  it('skips every card it is given', () => {
    st().skipCards(['A-d1s1', 'A-d1s2']);
    expect(st().week.skipped).toMatchObject({ 'A-d1s1': true, 'A-d1s2': true });
    expect(saved('weeks/' + st().weekKey()).skipped['A-d1s2']).toBe(true);
  });
  it('moves every card to the workout shown in the column, following swaps', () => {
    st().swapDays(6, 1); // column 7 now shows the Day 6 workout
    st().moveCards(['A-d1s1', 'A-d1s2'], 7);
    expect(st().week.moved).toMatchObject({ 'A-d1s1': 6, 'A-d1s2': 6 });
  });
  it('refuses the rest column', () => {
    st().setRestDay(3);
    st().moveCards(['A-d1s1'], 3);
    expect(st().week.moved['A-d1s1']).toBeUndefined();
  });
  it('warns about clashes, and undo puts the whole batch back', () => {
    // A-d6s5 (Arnold Press + Zercher Squat) is also on Day 4, right before column 5.
    st().moveCards(['A-d6s1', 'A-d6s5'], 5);
    expect(st().week.moved).toMatchObject({ 'A-d6s1': 5, 'A-d6s5': 5 });
    expect(st().moveNote.lines.length).toBeGreaterThan(0);
    expect(st().moveNote.fromShown).toBe(6);
    st().undoMove();
    expect(st().week.moved['A-d6s1']).toBeUndefined();
    expect(st().week.moved['A-d6s5']).toBeUndefined();
    expect(st().moveNote).toBeNull();
  });
});

describe('experiment board', () => {
  beforeEach(() => useAppStore.setState({ experiments: [] }));
  const add = (ex = 'hack', ph = 'hyp', note = '') => { st().saveExperiment({ ex, ph, note }); return st().experiments.at(-1); };

  it('adds, edits and deletes entries, and saves them', () => {
    const e = add('hack', 'hyp', 'try light');
    expect(e).toMatchObject({ ex: 'hack', ph: 'hyp', note: 'try light' });
    expect(saved('experiments/main').items).toHaveLength(1);
    st().saveExperiment({ id: e.id, ex: 'hack', ph: 'strength', note: '' });
    expect(st().experiments).toEqual([{ id: e.id, ex: 'hack', ph: 'strength', note: '' }]);
    st().deleteExperiment(e.id);
    expect(st().experiments).toEqual([]);
    expect(saved('experiments/main').items).toEqual([]);
  });
  it('creates a new exercise from a typed name, and asks for one when missing', () => {
    expect(st().saveExperiment({ ex: '__new', nn: 'Cable Lateral Raise', ph: null, note: '' })).toBeNull();
    const e = st().experiments.at(-1);
    expect(st().cfg.ex[e.ex].n).toBe('Cable Lateral Raise');
    expect(st().saveExperiment({ ex: '__new', nn: '' })).toMatch(/Choose an exercise/);
    expect(st().saveExperiment({ ex: '' })).toMatch(/Choose an exercise/);
  });
  it('adds an entry to a day of this week as a card that follows swaps, and keeps the entry', () => {
    const e = add();
    st().swapDays(6, 1); // column 7 shows the Day 6 workout
    expect(st().addToDay(e.id, 7)).toBe(true);
    const x = st().week.extra[0];
    expect(x).toMatchObject({ day: 6, ex: 'hack', ph: 'hyp' });
    expect(x.id).toMatch(/^X-/);
    expect(currentLayout(st().week, st().activeSlots())[7].map(s => s.id)).toContain(x.id);
    expect(saved('weeks/' + st().weekKey()).extra).toHaveLength(1);
    expect(st().experiments).toHaveLength(1);
  });
  it('refuses the rest day', () => {
    const e = add(); st().setRestDay(3);
    expect(st().addToDay(e.id, 3)).toBe(false);
    expect(st().week.extra).toBeUndefined();
  });
  it('an added card counts, checks off with a planned log, and Remove undoes it all', () => {
    const e = add('legext', 'hyp');
    const before = tally(st().activeSlots(), st().week).total;
    st().addToDay(e.id, 2);
    const id = st().week.extra[0].id;
    expect(tally(st().activeSlots(), st().week).total).toBe(before + 1);
    st().checkCard(id, true);
    st().setPhase(id, 0, 'strength');
    expect(st().logs.legext.some(x => x.slot === id && x.auto)).toBe(true);
    st().removeExtra(id);
    expect(st().week.extra).toBeUndefined();
    expect(st().week.done[id]).toBeUndefined();
    expect(st().week.ph[`${id}:0`]).toBeUndefined();
    expect((st().logs.legext || []).some(x => x.slot === id)).toBe(false);
    expect(tally(st().activeSlots(), st().week).total).toBe(before);
  });
  it('Remove keeps sets you logged by hand', () => {
    const e = add('legext', 'hyp'); st().addToDay(e.id, 2); const id = st().week.extra[0].id; const wk = st().weekKey();
    st().submitLog(id, 0, { entry: { d: wk, ph: 'hyp', w: 50, s: 3, r: 12, slot: id, wk }, ph: 'hyp', done: true });
    st().removeExtra(id);
    expect(st().logs.legext.some(x => x.slot === id && !x.auto)).toBe(true);
  });
  it('Remove clears a heads-up about a bulk move that included the card', () => {
    const e = add('legext', 'hyp'); st().addToDay(e.id, 2); const id = st().week.extra[0].id;
    useAppStore.setState({ moveNote: { batch: { [id]: null }, week: st().weekKey(), lines: ['x'], fromShown: 2, to: 3 } });
    st().removeExtra(id);
    expect(st().moveNote).toBeNull();
  });
  it('Remove only works on experiment cards', () => {
    st().removeExtra('A-d1s1');
    expect(st().activeSlots().some(s => s.id === 'A-d1s1')).toBe(true);
  });
  it('deleting an entry leaves the cards already added', () => {
    const e = add(); st().addToDay(e.id, 2); st().deleteExperiment(e.id);
    expect(st().week.extra).toHaveLength(1);
  });
  it('Erase programs clears the list', async () => {
    add(); await st().eraseData({ programs: true });
    expect(st().experiments).toEqual([]);
  });
});

describe('exercise details, default phase and adding to a day', () => {
  it('keeps a video link and equipment over a built-in exercise, and can clear them', async () => {
    const { exInfo } = await import('../lib/data.js');
    expect(exInfo(st().cfg, 'hack')).toMatchObject({ n: 'Hack Squat', eq: 'machine' });
    expect(st().saveExerciseDetails('hack', { url: 'https://example.com/v', eq: 'barbell', ph: '' })).toBeNull();
    expect(exInfo(st().cfg, 'hack')).toMatchObject({ n: 'Hack Squat', url: 'https://example.com/v', eq: 'barbell' });
    st().saveExerciseDetails('hack', { url: '', eq: '', ph: '' });
    expect(exInfo(st().cfg, 'hack').url).toBeFalsy();
    expect(exInfo(st().cfg, 'hack').eq).toBeFalsy();
    expect(st().saveExerciseDetails('hack', { url: 'nope', eq: '', ph: '' })).toMatch(/https/);
  });
  it('an exercise default phase applies to every card, but a slot default or a week pick still wins', () => {
    const sl = st().activeSlots(); const a = sl.find(s => s.id === 'A-d1s6'); const b = sl.find(s => s.id === 'A-d4s5'); // chest press: strength, then hypertrophy
    st().saveExerciseDetails('chestpress', { url: '', eq: '', ph: 'iso' });
    expect(phaseOf(st().cfg, st().week, a, 0)).toBe('iso');
    expect(phaseOf(st().cfg, st().week, b, 1)).toBe('iso');
    st().setPhase('A-d1s6', 0, 'exp');
    expect(phaseOf(st().cfg, st().week, a, 0)).toBe('exp');
    st().saveExerciseDetails('chestpress', { url: '', eq: '', ph: '' });
    expect(phaseOf(st().cfg, st().week, b, 1)).toBe('hyp');
  });
  it('adds an exercise or a new one to one day of this week only', () => {
    expect(st().addExerciseToDay(2, { ex: 'facepull', ph: 'hyp', note: 'light' })).toBeNull();
    expect(st().addExerciseToDay(2, { ex: '__new', nn: 'Hip 90/90', ne: 'bodyweight', ph: 'hyp' })).toBeNull();
    const extras = st().activeSlots().filter(s => s.added);
    expect(extras).toHaveLength(2);
    expect(extras[0].items[0]).toMatchObject({ ex: 'facepull', ph: 'hyp' });
    expect(extras[1].items[0].ph).toBe('hyp');
    expect(st().addExerciseToDay(2, { ex: '', nn: '' })).toMatch(/Choose/);
  });
});

describe('mobility phase', () => {
  it('has its own sets × reps, and never turns a 1RM into a target', async () => {
    const { PHASES, PH_KEYS } = await import('../lib/data.js');
    const { rxOf, baseTargetOf } = await import('../lib/logic.js');
    expect(PH_KEYS).toContain('mob');
    expect(PHASES.mob.label).toBe('Mobility');
    expect(rxOf(st().cfg, { ex: 'canoe' }, 'mob')).toBe('2 × 30 s');
    const cfg = { ...st().cfg, rm: { canoe: 100 } };
    expect(baseTargetOf(cfg, {}, { ex: 'canoe', w: 10 }, 'mob')).toMatchObject({ w: 10, src: 'program' });
    st().saveExerciseDetails('canoe', { url: '', eq: '', ph: 'mob' });
    expect(st().cfg.exPh.canoe).toBe('mob');
  });
});

describe('equipment from the log sheet', () => {
  it('changing it updates the exercise everywhere, and the new options exist', async () => {
    const { exInfo, EQUIPMENT } = await import('../lib/data.js');
    expect(EQUIPMENT).toMatchObject({ ezbar: 'EZ bar', shortbar: 'Short barbell' });
    const entry = { d: '2026-10-01', ph: 'hyp', w: 270, s: 4, r: 15 };
    expect(st().submitLog('A-d3s1', 0, { entry, ph: 'hyp', eq: 'ezbar' })).toBe(true);
    expect(exInfo(st().cfg, 'hack').eq).toBe('ezbar');
    expect(exInfo(st().cfg, 'hack').n).toBe('Hack Squat');
    st().submitLog('A-d3s1', 0, { entry, ph: 'hyp', eq: 'machine' }); // back to the built-in value: no leftover override
    expect(st().cfg.ex.hack).toBeUndefined();
    st().submitLog('A-d3s1', 0, { entry, ph: 'hyp' }); // untouched
    expect(exInfo(st().cfg, 'hack').eq).toBe('machine');
  });
});

describe('the board add button', () => {
  it('aims the add sheet at the board program and the program day shown in that column', () => {
    useAppStore.setState({ edProg: 'B', edDay: 5 });
    st().openAddToProgram(2);
    expect(st().modal).toMatchObject({ type: 'slot', idx: null, col: 2, target: { key: 'A', day: 2 } });
    expect(st().edProg).toBe('B'); expect(st().edDay).toBe(5); // the Program tab is untouched
    st().closeModal();
  });
  it('saves to that program day, not the Program tab selection', () => {
    useAppStore.setState({ edProg: 'B', edDay: 5 });
    st().openAddToProgram(2);
    const before = st().programs.A.days[1].slots.length;
    expect(st().saveSlot({ id: null, sec: 'Regular', tier: 'Accessory', type: 'single', day: 2, idx: null, note: '', target: st().modal.target, items: [{ ex: 'facepull', ph: 'hyp', w: null, rx: '', note: '' }] })).toBeNull();
    expect(st().programs.A.days[1].slots).toHaveLength(before + 1);
    expect(st().programs.B.days[4].slots.some(x => x.items[0].ex === 'facepull' && x.sec === 'Regular' && x.tier === 'Accessory' && x.id.includes('-x'))).toBe(false);
    expect(st().modal).toBeNull();
  });
});

describe('video link on an existing exercise', () => {
  it('the experiment sheet save updates the link everywhere', async () => {
    const { exInfo } = await import('../lib/data.js');
    expect(st().saveExperiment({ ex: 'hack', ph: 'hyp', nu: 'https://example.com/hack' })).toBeNull();
    expect(exInfo(st().cfg, 'hack').url).toBe('https://example.com/hack');
    expect(st().saveExperiment({ ex: 'hack', ph: 'hyp', nu: 'nope' })).toMatch(/https/);
    st().saveExperiment({ ex: 'hack', ph: 'hyp', nu: '' }); // clearing removes it
    expect(exInfo(st().cfg, 'hack').url).toBeFalsy();
  });
  it('keeps a link that is already there when it is not changed', async () => {
    const { exInfo } = await import('../lib/data.js');
    st().saveExperiment({ ex: 'canoe', ph: null, nu: 'https://youtu.be/yR6EnBqjKNs' });
    expect(st().cfg.ex.canoe).toBeUndefined();
    expect(exInfo(st().cfg, 'canoe').url).toBe('https://youtu.be/yR6EnBqjKNs');
  });
});

describe('video link from the log sheet', () => {
  it('saving a log with a new link updates the exercise for every card', async () => {
    const { exInfo } = await import('../lib/data.js');
    const entry = { d: '2026-10-01', ph: 'hyp', w: 270, s: 4, r: 15 };
    st().submitLog('A-d3s1', 0, { entry, ph: 'hyp', url: 'https://example.com/hack' });
    expect(exInfo(st().cfg, 'hack').url).toBe('https://example.com/hack');
    st().submitLog('A-d3s1', 0, { entry, ph: 'hyp' }); // field not offered: link left alone
    expect(exInfo(st().cfg, 'hack').url).toBe('https://example.com/hack');
  });
});

describe('bug check fixes', () => {
  it('"default everywhere" from the log beats a slot default saved earlier', () => {
    useAppStore.setState({ cfg: { ...st().cfg, phDef: { 'A-d1s6:0': 'strength' } } });
    const entry = { d: '2026-10-01', ph: 'hyp', w: 35, s: 4, r: 15 };
    st().submitLog('A-d1s6', 0, { entry, ph: 'hyp', makeExDefault: true });
    const s6 = st().activeSlots().find(s => s.id === 'A-d1s6');
    expect(phaseOf(st().cfg, st().week, s6, 0)).toBe('hyp');
  });
  it('"default everywhere" also beats a phase picked for another day of the same week', () => {
    const slots = st().activeSlots(); const seen = {}; let pair = null;
    slots.forEach(sl => sl.items.forEach((x, i) => { if (seen[x.ex] && seen[x.ex][0].id !== sl.id && !pair) pair = [seen[x.ex], [sl, i]]; (seen[x.ex] = seen[x.ex] || [sl, i]); }));
    const [[a, ai], [b, bi]] = pair;
    st().mutateWeek(w => { w.ph[`${b.id}:${bi}`] = 'strength'; });
    st().submitLog(a.id, ai, { entry: { d: '2026-10-01', ph: 'hyp', w: 35, s: 4, r: 15 }, ph: 'hyp', makeExDefault: true });
    expect(phaseOf(st().cfg, st().week, st().activeSlots().find(x => x.id === b.id), bi)).toBe('hyp');
  });
  it('a 1RM does not set the target; a weight you log does, for the same exercise and phase on other days', async () => {
    const { targetOf, planRows } = await import('../lib/logic.js');
    useAppStore.setState({ cfg: { ...st().cfg, rm: { hack: 300 } } });
    const other = st().slotById('A-d5s3'); expect(other.items[0].ex).toBe('hack');
    expect(phaseOf(st().cfg, st().week, other, 0)).toBe('hyp');
    expect(targetOf(st().cfg, st().logs, other.items[0], 'hyp')).toMatchObject({ w: 270, src: 'program' }); // not 65% of the 1RM
    st().submitLog('A-d3s1', 0, { entry: { d: '2026-10-01', ph: 'hyp', w: 280, s: 4, r: 15 }, ph: 'hyp' });
    expect(targetOf(st().cfg, st().logs, other.items[0], 'hyp')).toMatchObject({ w: 280, src: 'last session' });
    expect(planRows(st().cfg, st().logs, other.items[0], 'hyp')[0].w).toBe(280);
  });
  it('a one-week card keeps the phase picked when it was added, even with an exercise default', () => {
    st().saveExerciseDetails('chestpress', { url: '', eq: '', ph: 'iso' });
    st().addExerciseToDay(2, { ex: 'chestpress', ph: 'hyp' });
    const card = st().activeSlots().find(s => s.added);
    expect(phaseOf(st().cfg, st().week, card, 0)).toBe('hyp');
  });
  it('Mobility sets are held for time, like Isometric', async () => {
    const { planRows } = await import('../lib/logic.js');
    expect(planRows(st().cfg, {}, { ex: 'canoe' }, 'mob')).toEqual([{ w: null, sec: 30 }, { w: null, sec: 30 }]);
  });
  it('unchecking a card removes its check-off entry', () => {
    st().checkCard('A-d3s1', true);
    expect(st().logs.hack).toHaveLength(1);
    st().checkCard('A-d3s1', false);
    expect(st().logs.hack).toEqual([]);
  });
  it('history waits for the data source instead of reading too early', async () => {
    const mode = st().storeMode;
    useAppStore.setState({ storeMode: 'loading', weekHist: null });
    mem['ironlog:weeks/2026-01-04'] = JSON.stringify({ done: { x: true } });
    const p = st().loadHistory();
    await Promise.resolve();
    expect(st().weekHist).toBeNull(); // still waiting
    useAppStore.setState({ storeMode: mode });
    await p;
    expect(st().weekHist['2026-01-04']).toBeTruthy();
  });
  it('ticking both default boxes keeps the slot default', () => {
    const entry = { d: '2026-10-01', ph: 'hyp', w: 35, s: 4, r: 15 };
    st().submitLog('A-d1s6', 0, { entry, ph: 'hyp', makeDefault: true, makeExDefault: true });
    expect(st().cfg.phDef['A-d1s6:0']).toBe('hyp');
    expect(st().cfg.exPh.chestpress).toBe('hyp');
  });
  it('the Details default phase also replaces slot defaults for that exercise', () => {
    useAppStore.setState({ cfg: { ...st().cfg, phDef: { 'A-d1s6:0': 'strength' } } });
    st().saveExerciseDetails('chestpress', { url: '', eq: '', ph: 'iso' });
    const s6 = st().activeSlots().find(s => s.id === 'A-d1s6');
    expect(phaseOf(st().cfg, st().week, s6, 0)).toBe('iso');
  });
  it('"default everywhere" on a one-week card shows the new default', () => {
    st().addExerciseToDay(2, { ex: 'chestpress', ph: 'hyp' });
    const card = st().activeSlots().find(s => s.added);
    st().submitLog(card.id, 0, { entry: { d: '2026-10-01', ph: 'strength', w: 35, s: 4, r: 6 }, ph: 'strength', makeExDefault: true });
    expect(phaseOf(st().cfg, st().week, st().slotById(card.id), 0)).toBe('strength');
  });
  it('built-in Canoe Stretch and Desk Bands are normal cards that log, in their Home section', () => {
    st().checkCard('A-d3s9', true); // Desk Bands, Day 3 (Home)
    expect(st().logs.deskbands).toHaveLength(1);
    expect(st().activeSlots().filter(s => s.items[0].ex === 'canoe').every(s => s.sec === 'Home')).toBe(true);
  });
});

describe('body weight goal', () => {
  it('saves a target with the latest weigh-in as its start, and can remove it', () => {
    useAppStore.setState({ body: [{ wk: '2026-09-27', d: '2026-09-27', w: 195 }] });
    expect(st().setBodyGoal('180', '2026-12-01')).toBe(true);
    expect(st().cfg.bwGoal).toEqual({ w: 180, start: { w: 195, d: '2026-09-27' }, by: '2026-12-01' });
    expect(st().setBodyGoal('abc')).toBe(false);
    st().clearBodyGoal();
    expect(st().cfg.bwGoal).toBeUndefined();
  });
  it('a goal set before any weigh-in starts from the first one', () => {
    st().setBodyGoal('180');
    expect(st().cfg.bwGoal.start).toBeUndefined();
    st().saveBodyWeight(200);
    expect(st().cfg.bwGoal.start.w).toBe(200);
  });
});

describe('lift weight goal', () => {
  it('saves a goal per phase with your best in that phase as its start, and can remove one', () => {
    useAppStore.setState({ logs: { hack: [{ d: '2026-09-20', ph: 'strength', w: 300, s: 4, r: 6 }, { d: '2026-09-27', ph: 'hyp', w: 270, s: 4, r: 12 }] } });
    expect(st().setLiftGoal('hack', 'hyp', '315', '2026-12-01')).toBe(true);
    expect(st().setLiftGoal('hack', 'any', '350')).toBe(true);
    expect(st().cfg.liftGoals.hack).toEqual({ hyp: { w: 315, start: 270, by: '2026-12-01' }, any: { w: 350, start: 300 } });
    expect(st().setLiftGoal('hack', 'hyp', 'abc')).toBe(false);
    expect(st().setLiftGoal('hack', 'nope', '300')).toBe(false);
    st().clearLiftGoal('hack', 'hyp');
    expect(st().cfg.liftGoals.hack).toEqual({ any: { w: 350, start: 300 } });
    st().clearLiftGoal('hack', 'any');
    expect(st().cfg.liftGoals).toBeUndefined();
  });
  it('moves a goal to another phase, but not onto one that has a goal', () => {
    useAppStore.setState({ logs: { hack: [{ d: '2026-09-20', ph: 'strength', w: 300, s: 4, r: 6 }] } });
    st().setLiftGoal('hack', 'hyp', '300'); st().setLiftGoal('hack', 'any', '350');
    expect(st().setLiftGoal('hack', 'any', '320', '', 'hyp')).toBe(false);
    expect(st().setLiftGoal('hack', 'strength', '320', '', 'hyp')).toBe(true);
    expect(st().cfg.liftGoals.hack).toEqual({ strength: { w: 320, start: 300 }, any: { w: 350, start: 300 } });
  });
  it('says so when a logged set reaches a goal in its phase', () => {
    st().setLiftGoal('hack', 'strength', '280');
    const wk = st().weekKey();
    st().submitLog('A-d3s1', 0, { entry: { d: wk, ph: 'hyp', w: 285, s: 4, r: 10, slot: 'A-d3s1', wk }, ph: 'hyp', done: true });
    expect(st().saveFlag).not.toMatch(/^Goal reached/);
    st().setLiftGoal('hack', 'hyp', '300');
    st().submitLog('A-d3s1', 0, { entry: { d: wk, ph: 'hyp', w: 305, s: 4, r: 10, slot: 'A-d3s1', wk }, ph: 'hyp', done: true });
    expect(st().saveFlag).toMatch(/^Goal reached: 300 lb on .* \(Hypertrophy\)/);
  });
});

describe('undoing an uncheck', () => {
  const logIt = () => { const wk = st().weekKey(); st().submitLog('A-d3s1', 0, { entry: { d: wk, ph: 'hyp', w: 275, s: 4, r: 12, slot: 'A-d3s1', wk }, ph: 'hyp', done: true }); };
  it('puts back the entries and the tick', () => {
    logIt();
    st().checkCard('A-d3s1', false);
    expect(st().logs.hack).toEqual([]);
    st().undoUncheck();
    expect(st().logs.hack).toEqual([expect.objectContaining({ w: 275, r: 12 })]);
    expect(st().week.done['A-d3s1']).toBe(true);
    expect(st().uncheckNote).toBeNull();
    expect(saved('logs/hack').entries).toHaveLength(1);
  });
  it('does not duplicate an entry or drop one logged in between', () => {
    logIt();
    st().checkCard('A-d3s1', false);
    const wk = st().weekKey();
    st().addEntry('A-d3s1', 0, { d: wk, ph: 'hyp', w: 280, s: 3, r: 10, slot: 'A-d3s1', wk });
    st().undoUncheck();
    expect(st().logs.hack.map(e => e.w).sort()).toEqual([275, 280]);
    st().undoUncheck(); // nothing left to undo
    expect(st().logs.hack).toHaveLength(2);
  });
  it('offers undo for any uncheck, and a new check-off replaces the offer', () => {
    st().checkCard('A-d3s1', true);
    expect(st().uncheckNote).toBeNull(); // ticking isn't an uncheck
    st().checkCard('A-d3s1', false); // only a check-off entry was there
    expect(st().uncheckNote.text).toBe('Unchecked Hack Squat.');
    st().checkCard('A-d1s1', true);
    expect(st().uncheckNote).toBeNull();
  });
  it('undoing a plain uncheck ticks the card again and brings back its check-off entry', () => {
    st().checkCard('A-d3s1', true);
    st().checkCard('A-d3s1', false);
    expect(st().logs.hack).toEqual([]);
    st().undoUncheck();
    expect(st().week.done['A-d3s1']).toBe(true);
    expect(st().logs.hack).toEqual([expect.objectContaining({ auto: true, slot: 'A-d3s1' })]);
  });
  it('names the day when a whole day is unticked', () => {
    st().checkDay(3, true); st().checkDay(3, false);
    expect(st().uncheckNote.text).toMatch(/^Unchecked Day 3/);
    st().undoUncheck();
    expect(st().week.done['A-d3s1']).toBe(true);
  });
});

describe('exercise library', () => {
  it('saves name, video, equipment, 1RM, default phase and muscles in one go', async () => {
    const { exInfo } = await import('../lib/data.js');
    expect(st().createLibraryExercise({ name: '  Cable   Lateral Raise ', url: 'https://example.com/v', eq: 'cable', rm: '40', ph: 'hyp', tags: { p: ['sidedelt'], s: ['traps'] } })).toBeNull();
    const id = Object.keys(st().cfg.ex).find(k => st().cfg.ex[k].n === 'Cable Lateral Raise');
    expect(exInfo(st().cfg, id)).toMatchObject({ n: 'Cable Lateral Raise', url: 'https://example.com/v', eq: 'cable' });
    expect(st().cfg.rm[id]).toBe(40); expect(st().cfg.exPh[id]).toBe('hyp');
    expect(st().cfg.muscleMap[id]).toEqual({ p: ['sidedelt'], s: ['traps'] });
    expect(st().modal).toBeNull();
  });
  it('refuses a missing, duplicate or bad-link new exercise', () => {
    expect(st().createLibraryExercise({ name: '  ' })).toMatch(/name/);
    expect(st().createLibraryExercise({ name: 'hack squat' })).toMatch(/already/);
    expect(st().createLibraryExercise({ name: 'New thing', url: 'nope' })).toMatch(/https/);
    expect(Object.keys(st().cfg.ex)).toEqual([]);
  });
  it('renames your own exercise but not a built-in, and refuses a name that is taken', () => {
    st().createLibraryExercise({ name: 'My Lift' });
    const id = Object.keys(st().cfg.ex)[0];
    expect(st().saveExerciseDetails(id, { name: 'Hack Squat' })).toMatch(/already/);
    expect(st().saveExerciseDetails(id, { name: 'Renamed Lift' })).toBeNull();
    expect(st().cfg.ex[id].n).toBe('Renamed Lift');
    st().saveExerciseDetails('hack', { name: 'Something Else' });
    expect(st().cfg.ex.hack && st().cfg.ex.hack.n).toBeUndefined();
  });
  it('1RM and muscles: clearing the 1RM, and going back to the default muscles', async () => {
    const { exInfo } = await import('../lib/data.js');
    st().saveExerciseDetails('hack', { rm: '400', tags: { p: ['hamstrings'], s: [] } });
    expect(st().cfg.rm.hack).toBe(400); expect(st().cfg.muscleMap.hack).toEqual({ p: ['hamstrings'], s: [] });
    st().saveExerciseDetails('hack', { rm: '', tags: null });
    expect(st().cfg.rm.hack).toBeUndefined(); expect(st().cfg.muscleMap.hack).toBeUndefined();
    st().saveExerciseDetails('hack', { tags: { p: ['quads'], s: ['adductors', 'glutes'] } }); // same as the default
    expect(st().cfg.muscleMap.hack).toBeUndefined();
    st().saveExerciseDetails('hack', { rm: '350' }); // fields left out stay as they were
    expect(exInfo(st().cfg, 'hack')).toMatchObject({ eq: 'machine' });
    expect(st().cfg.muscleMap.hack).toBeUndefined();
  });
  it('deletes only your own exercises that nothing uses', () => {
    st().createLibraryExercise({ name: 'Throwaway', rm: '10', tags: { p: ['chest'], s: [] } });
    const id = Object.keys(st().cfg.ex)[0];
    expect(st().deleteExercise('hack')).toMatch(/Built-in/);
    useAppStore.setState({ logs: { [id]: [{ d: '2026-10-01', w: 10, s: 1, r: 1 }] } });
    expect(st().deleteExercise(id)).toMatch(/in your logs/);
    useAppStore.setState({ logs: {}, experiments: [{ id: 'e1', ex: id, ph: null, note: '' }] });
    expect(st().deleteExercise(id)).toMatch(/Experiment board/);
    useAppStore.setState({ experiments: [] });
    expect(st().deleteExercise(id)).toBeNull();
    expect(st().cfg.ex[id]).toBeUndefined(); expect(st().cfg.rm[id]).toBeUndefined(); expect(st().cfg.muscleMap[id]).toBeUndefined();
  });
});

// Program A: Leg Extension is on Days 2 and 3, so finishing Day 2 suggests a new order for Days 3 to 6 (the empty Day 7 stays last).
describe('a suggestion after a day is finished', () => {
  const day2 = () => currentLayout(st().week, st().activeSlots())[2];
  // The cards that make a day count as finished: not the Optional sled, not Home cards.
  const workout = () => day2().filter(s => s.sec !== 'Optional' && s.sec !== 'Home');
  beforeEach(() => useAppStore.setState({ orderNote: null, orderSkip: [] }));

  // Program A: Leg Extension (A-d3s5) is on Days 2 and 3.
  it('finishing Day 2 suggests moving one card; Apply moves it and Put back restores it', () => {
    st().checkDay(2, true);
    const n = st().orderNote;
    expect(n).toMatchObject({ kind: 'card', doneCol: 2, prev: { slot: 'A-d3s5', moved: null }, next: { slot: 'A-d3s5', moved: 4 }, applied: false });
    expect(n.lines.join(' ')).toBe('Leg Extension ISO hold is on Day 2 and Day 3. Moving Leg Extension ISO hold from Day 3 to Day 4 fixes it.');
    expect(st().week.moved).toEqual({}); // nothing changes until Apply
    expect(st().applyOrder()).toBe(true);
    expect(st().week.moved).toEqual({ 'A-d3s5': 4 });
    expect(saved('weeks/' + st().weekKey()).moved).toEqual({ 'A-d3s5': 4 });
    expect(st().week.order).toBeUndefined();
    expect(st().orderNote.applied).toBe(true);
    expect(st().canUndoOrder()).toBe(true);
    expect(st().undoOrder()).toBe(true);
    expect(st().week.moved).toEqual({});
    expect(st().orderNote).toBeNull();
  });
  it('Put back of a card that was already moved puts it back where it was', () => {
    // Leg Extension's entry already says Day 3 (where it is), and another card was moved earlier this week.
    st().mutateWeek(w => { w.moved['A-d3s5'] = 3; w.moved['A-d1s1'] = 5; });
    st().checkDay(2, true);
    expect(st().orderNote.prev).toEqual({ slot: 'A-d3s5', moved: 3 });
    st().applyOrder();
    expect(st().week.moved).toEqual({ 'A-d1s1': 5, 'A-d3s5': 4 });
    st().undoOrder();
    expect(st().week.moved).toEqual({ 'A-d1s1': 5, 'A-d3s5': 3 });
  });
  it('Put back is refused once that card was moved again', () => {
    st().checkDay(2, true); st().applyOrder();
    st().mutateWeek(w => { w.moved['A-d3s5'] = 6; });
    expect(st().canUndoOrder()).toBe(false);
    expect(st().undoOrder()).toBe(false);
    expect(st().week.moved['A-d3s5']).toBe(6);
  });
  it('after Apply there is still room for a rest day: nothing is pushed off the week', () => {
    st().checkDay(1, true);
    expect(st().applyOrder()).toBe(true);
    expect(orderOf(st().week)[6]).toBe(7); // the empty Day 7 stayed last
    expect(st().restOverflow(2)).toEqual([]);
    expect(st().setRestDay(2)).toBe(true);
    expect(Object.keys(st().week.skipped)).toEqual([]);
  });
  it('ticking the last workout card raises it, with the sled and Home cards left unticked', () => {
    const cards = workout();
    expect(day2().length).toBeGreaterThan(cards.length); // there are sled and Home cards to leave alone
    cards.slice(0, -1).forEach(s => { st().checkCard(s.id, true); expect(st().orderNote).toBeNull(); });
    st().checkCard(cards[cards.length - 1].id, true);
    expect(st().orderNote.doneCol).toBe(2);
    expect(tally(day2(), st().week).full).toBe(false); // the day's box stays unticked
  });
  it('ticking a Home card on a finished day raises nothing new', () => {
    st().checkDay(2, true); st().dismissOrder();
    useAppStore.setState({ orderSkip: [] });
    const home = day2().find(s => s.sec === 'Home');
    st().checkCard(home.id, false); st().checkCard(home.id, true);
    expect(st().orderNote).toBeNull();
  });
  it('finishing a day by skipping its last card raises it too', () => {
    const cards = workout();
    cards.slice(0, -1).forEach(s => st().checkCard(s.id, true));
    st().skipCard(cards[cards.length - 1].id);
    expect(st().orderNote.doneCol).toBe(2);
  });
  it('unticking clears a suggestion not yet applied, and raises none', () => {
    st().checkDay(2, true);
    st().checkDay(2, false);
    expect(st().orderNote).toBeNull();
  });
  it('moving the rest day still comes first, and keeps its date', () => {
    st().setRestDay(6);
    const restOn = st().week.restOn;
    st().checkDay(2, true);
    expect(st().orderNote.kind).toBe('order');
    expect(st().orderNote.next.rest).toEqual([3]);
    st().applyOrder();
    expect(st().week.rest).toEqual([3]);
    expect(st().week.order).toBeUndefined();
    expect(st().week.restOn).toBe(restOn);
    st().undoOrder();
    expect(st().week.rest).toEqual([6]);
  });
  it('a day order wins when one card cannot fix it: Apply writes it, Put back restores it, refused once changed', () => {
    // Hack Squat twice on Day 3 (next to Day 2's) and Leg Extension on Days 3 and 4: moving one card fixes one pair
    // at most, swapping whole days fixes both.
    const day = (...exs) => ({ title: '', slots: exs.map(ex => ({ items: [{ ex, ph: 'hyp' }] })) });
    const prog = { ...BUILTIN.A, days: [day('latpd'), day('hack'), day('hack', 'hack', 'legext'), day('legext', 'wristpd'), day('platerot'), day('cablecrunch'), day()] };
    useAppStore.setState({ programs: { A: prog, B: BUILTIN.B } });
    st().checkDay(2, true);
    const n = st().orderNote;
    expect(n.kind).toBe('order');
    expect(n.next.order).not.toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(st().applyOrder()).toBe(true);
    expect(st().week.order).toEqual(n.next.order);
    expect(st().week.moved).toEqual({});
    expect(st().undoOrder()).toBe(true);
    expect(st().week.order).toBeUndefined();
    st().checkDay(2, false); useAppStore.setState({ orderNote: null, orderSkip: [] }); st().checkDay(2, true);
    st().applyOrder();
    st().mutateWeek(w => { w.order = [2, 1, 3, 4, 5, 6, 7]; });
    expect(st().canUndoOrder()).toBe(false);
    expect(st().undoOrder()).toBe(false);
    expect(st().week.order).toEqual([2, 1, 3, 4, 5, 6, 7]);
  });
  it('Dismiss keeps the same suggestion from coming back this session', () => {
    st().checkDay(2, true);
    st().dismissOrder();
    expect(st().orderNote).toBeNull();
    st().checkDay(2, false); st().checkDay(2, true);
    expect(st().orderNote).toBeNull();
  });
  it('finishing a day from the log sheet or with quick log raises it too', () => {
    const cards = workout(); const last = cards[cards.length - 1]; const idx = last.items.length - 1; const wk = st().weekKey();
    const upToLast = () => { cards.slice(0, -1).forEach(s => st().checkCard(s.id, true)); last.items.slice(0, -1).forEach((_, i) => st().checkItem(last.id, i, true)); };
    upToLast();
    st().submitLog(last.id, idx, { entry: { d: wk, ph: 'hyp', w: 10, s: 3, r: 10, slot: last.id, wk }, ph: null, done: true });
    expect(st().orderNote).toMatchObject({ kind: 'card', doneCol: 2 });
    st().checkDay(2, false); useAppStore.setState({ orderNote: null, logs: {} });
    upToLast();
    const ex = last.items[idx].ex; const ph = phaseOf(st().cfg, st().week, last, idx);
    useAppStore.setState({ logs: { ...st().logs, [ex]: [{ d: '2026-01-04', ph, w: 10, s: 3, r: 10, slot: last.id, wk: '2026-01-04' }] } });
    st().quickLog(last.id, idx);
    expect(st().orderNote).toMatchObject({ kind: 'card', doneCol: 2 });
  });
  it('starting the day it would move a card from redoes it, so Apply never moves a ticked card', () => {
    st().checkDay(2, true);
    expect(st().orderNote.next).toEqual({ slot: 'A-d3s5', moved: 4 });
    st().checkCard('A-d3s5', true); // Day 3 is started now, so it stays put
    if (st().orderNote) expect(st().orderNote.next.slot).not.toBe('A-d3s5');
    st().applyOrder();
    expect(st().week.moved['A-d3s5']).toBeUndefined();
  });
  it('Apply is refused when the board changed in a way it didn\'t see, and changing the week\'s program clears it', () => {
    st().checkDay(2, true);
    const n = st().orderNote;
    useAppStore.setState({ week: { ...st().week, moved: { 'A-d3s5': 6 } } }); // as if from another device
    expect(st().applyOrder()).toBe(false);
    expect(st().week.moved).toEqual({ 'A-d3s5': 6 });
    expect(st().orderNote).toBeNull();
    useAppStore.setState({ orderNote: n, week: { ...st().week, moved: {} } });
    st().setWeekProg('B');
    expect(st().orderNote).toBeNull();
  });
  it('a swap, a rest day or a card move clears it', () => {
    st().checkDay(2, true); st().swapDays(5, 1);
    expect(st().orderNote).toBeNull();
    st().checkDay(2, false); st().swapDays(5, 1); st().checkDay(2, true); st().setRestDay(6);
    expect(st().orderNote).toBeNull();
    st().setRestDay(6); st().checkDay(2, false); st().checkDay(2, true); st().moveSlot('A-d6s1', 5);
    expect(st().orderNote).toBeNull();
  });
});

// Through the store: Apply changes only the order and rest days, or one card's week.moved, and Put back restores
// the week exactly. Every rest day, finishing each early day, on both programs.
describe('applying a suggestion keeps every card and can be put back exactly', () => {
  beforeEach(() => useAppStore.setState({ orderNote: null, orderSkip: [] }));
  const where = () => { const m = {}; Object.entries(currentLayout(st().week, st().activeSlots())).forEach(([c, l]) => l.forEach(s => { (m[s.id] = m[s.id] || []).push(Number(c)); })); return m; };

  ['A', 'B'].forEach(prog => [null, 2, 3, 4, 5, 6, 7].forEach(rest => [1, 2, 3, 4].forEach(day => {
    it(`Program ${prog}, rest ${rest ?? 'none'}, finishing Day ${day}`, () => {
      st().setWeekProg(prog);
      if (rest) st().setRestDay(rest);
      st().checkCard(`${prog}-d6s2`, true); // a check-off elsewhere in the week
      st().checkDay(day, true);
      const n = st().orderNote; if (!n) return; // nothing to suggest here
      const before = structuredClone(st().week); const logs = structuredClone(st().logs); const pos = where();
      expect(st().applyOrder()).toBe(true);
      const after = st().week; const moved = where();
      expect(Object.keys(moved).sort()).toEqual(Object.keys(pos).sort()); // no card lost or added
      Object.values(moved).forEach(cs => expect(cs.length).toBe(1)); // none duplicated
      expect(after.done).toEqual(before.done);
      expect(after.skipped).toEqual(before.skipped);
      expect(after.restOn).toEqual(before.restOn);
      expect(st().logs).toEqual(logs);
      if (n.kind === 'card') {
        expect(after.order).toEqual(before.order);
        expect(after.rest).toEqual(before.rest);
        const { [n.next.slot]: _, ...rest0 } = after.moved; const { [n.next.slot]: __, ...rest1 } = before.moved; // eslint-disable-line no-unused-vars
        expect(rest0).toEqual(rest1); // only that card's entry changed
        Object.keys(pos).forEach(id => { if (id !== n.next.slot) expect(moved[id]).toEqual(pos[id]); }); // every other card stays
        expect(moved[n.next.slot]).not.toEqual(pos[n.next.slot]);
      } else {
        expect(after.moved).toEqual(before.moved);
      }
      expect(st().undoOrder()).toBe(true);
      expect(st().week).toEqual(before);
      expect(where()).toEqual(pos);
    });
  })));
});

describe('log sheet target', () => {
  it('is gone when the card, or the exercise at that position, no longer exists', () => {
    const card = st().activeSlots().find(s => s.type === 'single');
    expect(st().logTargetExists(card.id, 0)).toBe(true);
    expect(st().logTargetExists(card.id, card.items.length)).toBe(false); // the program now has fewer exercises on that card
    expect(st().logTargetExists('no-such-card', 0)).toBe(false);
  });
});

describe('the loaded week history stays current', () => {
  it('an edit made on another week is in allWeeks after coming back', async () => {
    useAppStore.setState({ weekHist: {} }); // history already loaded, as after opening Progress or an export
    st().gotoWeek('prev'); const prev = st().weekKey();
    useAppStore.setState(s => ({ ready: Object.fromEntries(Object.keys(s.ready).map(k => [k, true])) }));
    st().checkCard('A-d3s1', true);
    st().gotoWeek('today');
    const all = await st().allWeeks();
    expect(all[prev].done['A-d3s1']).toBe(true);
  });
});
