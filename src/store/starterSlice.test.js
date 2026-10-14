import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

let useAppStore, BUILTIN, BLANK, DEFAULT_CFG, slotsFor, exInfo;
const st = () => useAppStore.getState();

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN, BLANK, slotsFor, exInfo } = await import('../lib/data.js'));
  ({ DEFAULT_CFG } = await import('../lib/logic.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ programs: { A: BLANK.A, B: BLANK.B }, library: [], cfg: structuredClone(DEFAULT_CFG), edProg: null, edDay: 1, modal: null });
});

describe('applyStarter', () => {
  it('fills the empty program and adds the exercises to the library with their equipment and muscles', () => {
    expect(st().applyStarter('upperlower', 4)).toBeNull();
    const cards = slotsFor(st().programs.A);
    expect(cards.length).toBeGreaterThan(8);
    expect(new Set(cards.map(c => c.day))).toEqual(new Set([1, 2, 3, 4]));
    const bench = cards.find(c => exInfo(st().cfg, c.items[0].ex).n === 'Bench press').items[0].ex;
    expect(exInfo(st().cfg, bench).eq).toBe('barbell');
    expect(st().cfg.muscleMap[bench].p).toContain('chest');
  });

  it('refuses a board that already has cards, and changes nothing', () => {
    useAppStore.setState({ programs: { A: BUILTIN.A, B: BUILTIN.B } });
    expect(st().applyStarter('ppl', 3)).toMatch(/empty board/);
    expect(st().programs.A).toBe(BUILTIN.A);
  });

  it('refuses an unknown starter or a days-per-week it does not offer, writing nothing', () => {
    expect(st().applyStarter('nope', 3)).not.toBeNull();
    expect(st().applyStarter('fivebyfive', 6)).not.toBeNull();
    expect(slotsFor(st().programs.A)).toHaveLength(0);
    expect(Object.keys(st().cfg.ex)).toHaveLength(0);
  });

  it('a second apply is refused: the starter never stacks on itself', () => {
    expect(st().applyStarter('fullbody', 3)).toBeNull();
    const n = slotsFor(st().programs.A).length;
    expect(st().applyStarter('fullbody', 3)).not.toBeNull();
    expect(slotsFor(st().programs.A)).toHaveLength(n);
  });

  it('refuses when the shown week is not this one, and writes nothing', () => {
    useAppStore.setState({ week: { ...st().week } });
    const real = st().weekKey;
    useAppStore.setState({ weekKey: () => '2020-01-05' });
    expect(st().applyStarter('ppl', 3)).toMatch(/this week/);
    useAppStore.setState({ weekKey: real });
    expect(slotsFor(st().programs.A)).toHaveLength(0);
    expect(Object.keys(st().cfg.ex)).toHaveLength(0);
  });
});
