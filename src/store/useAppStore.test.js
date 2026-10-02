import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mem, clearStorage, saved } from '../test/browserStubs.js';
import { FEATURES } from '../lib/features.js';

// Most tests cover the stretch feature as built; one block checks it switched off.
FEATURES.stretches = true;

let useAppStore, BUILTIN, DEFAULT_CFG, currentLayout, defaultLogDate, dayDate, tally, phaseOf;
const st = () => useAppStore.getState();

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, currentLayout, defaultLogDate, dayDate, tally, phaseOf } = await import('../lib/logic.js'));
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

  it('checking a whole day logs every card on it, and skipping a card removes its entry', () => {
    st().checkDay(3, true);
    const day3 = st().activeSlots().filter(s => s.day === 3);
    // An either/or card logs the one option it counts as done (the first, when none was picked).
    const exIds = [...new Set(day3.flatMap(s => (s.type === 'either' ? s.items.slice(0, 1) : s.items).map(i => i.ex)))];
    // Stretches (Desk Bands) have no weight or reps, so checking them off logs nothing.
    exIds.filter(id => id !== 'deskbands').forEach(id => expect(st().logs[id]?.length, id).toBe(1));
    expect(st().logs.deskbands).toBeUndefined();
    expect(st().logs.facepull).toBeUndefined();
    st().skipCard('A-d3s1');
    expect(st().logs.hack).toEqual([]);
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
    expect(st().week.rest).toBe(3);
    expect(saved('weeks/' + st().weekKey()).rest).toBe(3);
    expect(ids(3)).toEqual([]);
    expect(ids(4)).toContain('A-d3s1');
    expect(st().setRestDay(3)).toBe(true);
    expect(st().week.rest).toBeUndefined();
    expect(ids(3)).toContain('A-d3s1');
  });
  it('moves the rest day when another day is ticked', () => {
    st().setRestDay(3); st().setRestDay(2);
    expect(st().week.rest).toBe(2);
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
  it('keeps a warm-up tick with its workout when the rest day is toggled', () => {
    st().setRestDay(3);
    st().setWarm(4, 'shadow', true); // displayed Day 4 is program Day 3
    expect(st().week.warm[3]).toEqual({ shadow: true });
    st().setRestDay(3);
    expect(st().week.warm[3].shadow).toBe(true);
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
    expect(st().week.rest).toBe(2);
    expect(st().week.order).toBeUndefined();
    expect(st().swapDays(2, 1)).toBe(true); // rest at 2 <-> column 3 workout
    expect(st().week.rest).toBe(3);
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
  it('keeps a warm-up tick with its workout across a swap', () => {
    st().swapDays(6, 1);
    st().setWarm(7, 'shadow', true); // column 7 shows the Day 6 workout
    expect(st().week.warm[6]).toEqual({ shadow: true });
    st().swapDays(7, -1);
    expect(st().week.warm[6].shadow).toBe(true);
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
    st().setRestDay(2); // moves the rest day
    expect(st().week.rest).toBe(2);
    expect(st().week.restOn).toBe('2026-01-04');
    st().swapDays(2, 1); // the swap arrows move it too
    expect(st().week.rest).toBe(3);
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
  it('keeps a video link, equipment and stretch over a built-in exercise, and can clear them', async () => {
    const { exInfo } = await import('../lib/data.js');
    expect(exInfo(st().cfg, 'hack')).toMatchObject({ n: 'Hack Squat', eq: 'machine' });
    expect(st().saveExerciseDetails('hack', { url: 'https://example.com/v', eq: 'barbell', stretch: false, ph: '' })).toBeNull();
    expect(exInfo(st().cfg, 'hack')).toMatchObject({ n: 'Hack Squat', url: 'https://example.com/v', eq: 'barbell' });
    st().saveExerciseDetails('hack', { url: '', eq: '', stretch: false, ph: '' });
    expect(exInfo(st().cfg, 'hack').url).toBeFalsy();
    expect(exInfo(st().cfg, 'hack').eq).toBeFalsy();
    expect(st().saveExerciseDetails('hack', { url: 'nope', eq: '', stretch: false, ph: '' })).toMatch(/https/);
  });
  it('an exercise default phase applies to every card, but a slot default or a week pick still wins', () => {
    const sl = st().activeSlots(); const a = sl.find(s => s.id === 'A-d1s6'); const b = sl.find(s => s.id === 'A-d4s5'); // chest press: strength, then hypertrophy
    st().saveExerciseDetails('chestpress', { url: '', eq: '', stretch: false, ph: 'iso' });
    expect(phaseOf(st().cfg, st().week, a, 0)).toBe('iso');
    expect(phaseOf(st().cfg, st().week, b, 1)).toBe('iso');
    st().setPhase('A-d1s6', 0, 'exp');
    expect(phaseOf(st().cfg, st().week, a, 0)).toBe('exp');
    st().saveExerciseDetails('chestpress', { url: '', eq: '', stretch: false, ph: '' });
    expect(phaseOf(st().cfg, st().week, b, 1)).toBe('hyp');
  });
  it('adds an exercise or a new stretch to one day of this week only', () => {
    expect(st().addExerciseToDay(2, { ex: 'facepull', ph: 'hyp', note: 'light' })).toBeNull();
    expect(st().addExerciseToDay(2, { ex: '__new', nn: 'Hip 90/90', ne: 'bodyweight', ns: true, ph: 'hyp' })).toBeNull();
    const extras = st().activeSlots().filter(s => s.added);
    expect(extras).toHaveLength(2);
    expect(extras[0].items[0]).toMatchObject({ ex: 'facepull', ph: 'hyp' });
    expect(extras[1].items[0].ph).toBeNull(); // a stretch has no phase
    expect(st().addExerciseToDay(2, { ex: '', nn: '' })).toMatch(/Choose/);
    st().checkCard(extras[1].id, true);
    expect(st().logs['hip-90-90']).toBeUndefined(); // and nothing to log
    expect(st().week.done[extras[1].id]).toBe(true);
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
    st().saveExerciseDetails('canoe', { url: '', eq: '', stretch: false, ph: 'mob' });
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
  it('a one-week card keeps the phase picked when it was added, even with an exercise default', () => {
    st().saveExerciseDetails('chestpress', { url: '', eq: '', stretch: false, ph: 'iso' });
    st().addExerciseToDay(2, { ex: 'chestpress', ph: 'hyp' });
    const card = st().activeSlots().find(s => s.added);
    expect(phaseOf(st().cfg, st().week, card, 0)).toBe('hyp');
  });
  it('Mobility sets are held for time, like Isometric', async () => {
    const { planRows } = await import('../lib/logic.js');
    expect(planRows(st().cfg, {}, { ex: 'canoe' }, 'mob')).toEqual([{ w: null, sec: 30 }, { w: null, sec: 30 }]);
  });
  it('a stretch saved in Details keeps no hidden default phase', () => {
    st().saveExerciseDetails('hack', { url: '', eq: '', stretch: true, ph: 'iso' });
    expect(st().cfg.exPh.hack).toBeUndefined();
  });
  it('unchecking a card removes its check-off entry even after the exercise became a stretch', () => {
    st().checkCard('A-d3s1', true);
    expect(st().logs.hack).toHaveLength(1);
    st().saveExerciseDetails('hack', { url: '', eq: '', stretch: true, ph: '' });
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
    st().saveExerciseDetails('chestpress', { url: '', eq: '', stretch: false, ph: 'iso' });
    const s6 = st().activeSlots().find(s => s.id === 'A-d1s6');
    expect(phaseOf(st().cfg, st().week, s6, 0)).toBe('iso');
  });
  it('"default everywhere" on a one-week card shows the new default', () => {
    st().addExerciseToDay(2, { ex: 'chestpress', ph: 'hyp' });
    const card = st().activeSlots().find(s => s.added);
    st().submitLog(card.id, 0, { entry: { d: '2026-10-01', ph: 'strength', w: 35, s: 4, r: 6 }, ph: 'strength', makeExDefault: true });
    expect(phaseOf(st().cfg, st().week, st().slotById(card.id), 0)).toBe('strength');
  });
  it('built-in Canoe Stretch and Desk Bands are stretches but stay in their Home section', async () => {
    const { exInfo } = await import('../lib/data.js');
    expect(exInfo(st().cfg, 'canoe').stretch).toBe(true);
    expect(exInfo(st().cfg, 'deskbands').stretch).toBe(true);
    expect(st().activeSlots().filter(s => s.items[0].ex === 'canoe').every(s => s.sec === 'Home')).toBe(true);
  });
});

describe('stretch feature switched off', () => {
  it('Canoe Stretch and Desk Bands are normal cards that log, and Details leaves the hidden setting alone', async () => {
    const { exInfo } = await import('../lib/data.js');
    FEATURES.stretches = false;
    try {
      expect(exInfo(st().cfg, 'canoe').stretch).toBeUndefined();
      st().checkCard('A-d3s9', true); // Desk Bands, Day 3 (Home)
      expect(st().logs.deskbands).toHaveLength(1);
      st().saveExerciseDetails('canoe', { url: '', eq: 'barbell', stretch: false, ph: '' });
      expect(st().cfg.ex.canoe && st().cfg.ex.canoe.stretch).toBeFalsy(); // no override written
      expect(st().cfg.ex.canoe?.stretch).toBeUndefined();
    } finally { FEATURES.stretches = true; }
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
