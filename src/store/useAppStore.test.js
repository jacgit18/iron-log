import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mem, clearStorage, saved } from '../test/browserStubs.js';

let useAppStore, BUILTIN, DEFAULT_CFG, currentLayout, defaultLogDate, dayDate;
const st = () => useAppStore.getState();

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, currentLayout, defaultLogDate, dayDate } = await import('../lib/logic.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ logs: {}, week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} }, body: [], library: [], cfg: structuredClone(DEFAULT_CFG), programs: { A: BUILTIN.A, B: BUILTIN.B }, weekHist: null });
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
    // Unchecking now leaves what you logged alone.
    st().checkCard('A-d3s1', false);
    expect(st().logs.hack).toHaveLength(1);
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
  it('make-up pulls in workouts by position, not program day', () => {
    st().swapDays(4, 1); // Day 4 workout now sits after the make-up column
    st().pullUnfinished();
    expect(st().week.moved['A-d4s1']).toBeUndefined();
    expect(st().week.moved['A-d1s1']).toBe(5);
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
