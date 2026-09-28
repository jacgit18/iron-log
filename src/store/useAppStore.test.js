import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mem, clearStorage, saved } from '../test/browserStubs.js';

let useAppStore, BUILTIN, DEFAULT_CFG;
const st = () => useAppStore.getState();

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG } = await import('../lib/logic.js'));
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
