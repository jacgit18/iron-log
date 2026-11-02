// EH-09 / EH-10: an action that writes several documents (a tick and its logged entries, a log sheet save, an import)
// happens all together or not at all. Each test makes the second write fail and checks nothing partial is left.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mem, clearStorage } from '../test/browserStubs.js';

let useAppStore: any, BUILTIN: any, DEFAULT_CFG: any, summarizeSets: any, buildDataFile: any;
const st = () => useAppStore.getState();
const boom = () => { throw new Error('injected: second write failed'); };
// The store functions the tests replace; put back after each test.
const KEEP = ['saveLog', 'saveWeek', 'saveCfg', 'mutateCfg'] as const;
let kept: Record<string, unknown> = {};
const failOnNth = (name: string, n: number) => {
  const real = st()[name]; let calls = 0;
  useAppStore.setState({ [name]: (...a: unknown[]) => { calls++; if (calls === n) boom(); return real(...a); } });
};
const countCalls = (name: string) => {
  const real = st()[name]; const c = { n: 0 };
  useAppStore.setState({ [name]: (...a: unknown[]) => { c.n++; return real(...a); } });
  return c;
};
const sheetEntry = (slot: string, extra = {}) => ({ d: st().weekKey(), ph: 'hyp', ...summarizeSets([{ w: 45, r: 12 }, { w: 45, r: 12 }], false), slot, wk: st().weekKey(), ...extra });
const FRESH_WEEK = () => ({ prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} });
const noWrites = () => expect(Object.keys(mem).filter(k => /logs\/|weeks\//.test(k))).toEqual([]);

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, summarizeSets } = await import('../lib/logic.js'));
  ({ buildDataFile } = await import('../lib/export.js'));
  await st().init();
  KEEP.forEach(k => { kept[k] = st()[k]; });
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({
    ...kept,
    cfg: structuredClone(DEFAULT_CFG), logs: {}, week: FRESH_WEEK(), weekHist: {}, body: [], library: [], experiments: [],
    programs: { A: BUILTIN.A, B: BUILTIN.B }, modal: null, importDraft: null, importBusy: false, importError: '', importCount: 0,
    saveFlag: '', uncheckNote: null, orderNote: null, moveNote: null,
  });
});
afterEach(() => { useAppStore.setState(kept); });

describe('multi-document writes are all or nothing', () => {
  it('mutateChecks: a failure writing the second exercise log leaves the tick, the logs and the notice as they were', () => {
    // Sanity: ticking a whole day writes more than one exercise log, so a second one can fail.
    const probe = countCalls('saveLog'); st().checkDay(1, true);
    expect(probe.n).toBeGreaterThanOrEqual(2);
    st().checkDay(1, false); clearStorage();
    useAppStore.setState({ ...kept, logs: {}, week: FRESH_WEEK(), uncheckNote: null });
    const weekBefore = structuredClone(st().week);
    failOnNth('saveLog', 2);
    st().checkDay(1, true);
    expect(st().week).toEqual(weekBefore);
    expect(st().logs).toEqual({});
    noWrites();
    expect(st().saveFlag).toMatch(/nothing was changed/);
  });

  it('addEntry with a tick: a failure on the week write removes the entry too', () => {
    failOnNth('saveWeek', 1);
    expect(st().addEntry('A-d1s1', 0, sheetEntry('A-d1s1'), { check: true })).toBe(false);
    expect(st().logs).toEqual({});
    expect(st().week.done).toEqual({});
    noWrites();
  });

  it('addEntry without a tick still saves one entry (no behaviour change)', () => {
    expect(st().addEntry('A-d1s1', 0, sheetEntry('A-d1s1'))).toBe(true);
    expect(Object.values(st().logs).flat()).toHaveLength(1);
    expect(st().week.done).toEqual({});
  });

  it('submitLog: a failure in the config step leaves no entry, default or tick', () => {
    useAppStore.setState({ mutateCfg: boom });
    expect(st().submitLog('A-d1s1', 0, { entry: sheetEntry('A-d1s1'), ph: 'str', makeDefault: true, rm: 200, done: true })).toBe(false);
    expect(st().logs).toEqual({});
    expect(st().cfg).toEqual(DEFAULT_CFG);
    expect(st().week).toEqual(FRESH_WEEK());
    noWrites();
  });

  it('submitLog: a failure writing the week (the tick) leaves no entry or config change', () => {
    failOnNth('saveWeek', 1);
    expect(st().submitLog('A-d1s1', 0, { entry: sheetEntry('A-d1s1'), ph: 'str', makeDefault: true, rm: 200, done: true })).toBe(false);
    expect(st().logs).toEqual({});
    expect(st().cfg).toEqual(DEFAULT_CFG);
    expect(st().week.done).toEqual({});
    noWrites();
  });

  it('submitLog succeeds as before: entry, 1RM, phase default and tick all land', () => {
    expect(st().submitLog('A-d1s1', 0, { entry: sheetEntry('A-d1s1'), ph: 'str', makeDefault: true, rm: 200, done: true })).toBe(true);
    expect(Object.values(st().logs).flat()).toHaveLength(1);
    expect(Object.values(st().cfg.rm)).toContain(200);
    expect(st().week.done['A-d1s1']).toBeTruthy();
  });

  for (const mode of ['merge', 'replace'] as const) {
    it(`applyImport ${mode}: a failure on a later document leaves the app untouched and says so`, async () => {
      const wk = st().weekKey();
      // A backup holding two exercises' logs and a ticked card.
      useAppStore.setState({ logs: { hack: [{ d: wk, ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk }], latpd: [{ d: wk, ph: 'hyp', w: 90, s: 3, r: 12, slot: 'A-d1s1', wk }] }, week: { ...FRESH_WEEK(), done: { 'A-d3s1': true } } });
      const text = JSON.stringify(buildDataFile(st().snapshot(), {}));
      useAppStore.setState({ logs: {}, week: FRESH_WEEK() });
      clearStorage();
      await st().readImportFile({ name: 'd.json', arrayBuffer: async () => new TextEncoder().encode(text).buffer });
      expect(st().importDraft).toBeTruthy();
      if (mode === 'merge') failOnNth('saveLog', 2); else failOnNth('saveWeek', 1); // merge writes the logs one by one; replace writes the week first
      await st().applyImport(mode);
      expect(st().logs).toEqual({});
      expect(st().week).toEqual(FRESH_WEEK());
      expect(st().importBusy).toBe(false);
      expect(st().saveFlag).toBe('Import failed');
      expect(st().importDraft).toBeTruthy(); // the file stays open so the person can try again
      noWrites();
    });
  }

  it('applyImport merge still adds the file\'s data when nothing fails', async () => {
    const wk = st().weekKey();
    useAppStore.setState({ logs: { hack: [{ d: wk, ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk }] } });
    const text = JSON.stringify(buildDataFile(st().snapshot(), {}));
    useAppStore.setState({ logs: {} });
    await st().readImportFile({ name: 'd.json', arrayBuffer: async () => new TextEncoder().encode(text).buffer });
    await st().applyImport('merge');
    expect(st().logs.hack).toHaveLength(1);
    expect(st().saveFlag).toBe('Data added');
  });
  it('applyImport replace with a grocery list: a full storage keeps the old grocery months', async () => {
    const list = { stores: ['Costco'], items: [{ id: 'rice', n: 'Rice', store: 'Costco', qty: 1, cents: 100, every: true, out: false }], months: { '2026-01': { lines: { rice: { got: true } }, pulled: [] } } };
    useAppStore.setState({ grocery: { stores: ['Costco'], items: list.items }, groceryMonths: { '2026-01': list.months['2026-01'] } });
    const text = JSON.stringify(buildDataFile(st().snapshot(), {}));
    const old = { lines: { milk: { got: true } }, pulled: [] };
    useAppStore.setState({ groceryMonths: { '2025-12': old } }); st().saveDoc('grocery/2025-12', old);
    await st().readImportFile({ name: 'd.json', arrayBuffer: async () => new TextEncoder().encode(text).buffer });
    const setItem = localStorage.setItem; localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try { await st().applyImport('replace'); } finally { localStorage.setItem = setItem; }
    expect(Object.keys(mem).some(k => k.endsWith('grocery/2025-12'))).toBe(true); // not removed
  });
});
