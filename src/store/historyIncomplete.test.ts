// A failed history load must never produce a partial result: allWeeks() reloads once and otherwise throws, and every caller
// (export, daily backup, import, erase) stops and leaves things as they were. The failure cannot be reached by a person, so it is made here.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { mem as memRaw, clearStorage } from '../test/browserStubs.js';
const mem = memRaw as Record<string, string>;

// No IndexedDB in the test environment: the daily copy's save is recorded instead.
vi.mock('../lib/autoBackup.js', async importOriginal => ({ ...(await importOriginal<object>()), saveDailyBackup: vi.fn(async () => 'saved') }));

let useAppStore: any, BUILTIN: any, DEFAULT_CFG: any, buildDataFile: any, HistoryIncompleteError: any;
const st = () => useAppStore.getState();
const OLD = '2020-01-05'; const OLDER = '2020-01-12';
const week = (done = {}) => ({ prog: null, done, skipped: {}, moved: {}, ph: {}, warm: {} });
const KEEP = ['loadHistory'] as const;
let kept: Record<string, unknown> = {};
let loads = 0;
// A load that read only part of the weeks and hit an error (what loadHistory leaves behind).
const failingLoad = () => { loads++; useAppStore.setState({ weekHist: { [OLD]: week({ a: true }) }, historyFailed: true, historyLoading: false }); return Promise.resolve(); };
const goodLoad = () => { loads++; useAppStore.setState({ weekHist: { [OLD]: week({ a: true }), [OLDER]: week({ b: true }) }, historyFailed: false, historyLoading: false }); return Promise.resolve(); };
const afterFirstFailure = (second: 'fail' | 'ok') => {
  useAppStore.setState({ weekHist: { [OLD]: week({ a: true }) }, historyFailed: true, loadHistory: second === 'fail' ? failingLoad : goodLoad });
};
const SAVED = 'Couldn’t read all your saved weeks, so nothing was ';

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ HistoryIncompleteError } = await import('./historyIncomplete.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG } = await import('../lib/logic.js'));
  ({ buildDataFile } = await import('../lib/export.js'));
  await st().init();
  KEEP.forEach(k => { kept[k] = st()[k]; });
});
beforeEach(() => {
  clearStorage(); loads = 0;
  useAppStore.setState({
    ...kept, cfg: structuredClone(DEFAULT_CFG), logs: {}, week: week(), weekHist: {}, historyFailed: false, body: [], library: [], experiments: [],
    programs: { A: BUILTIN.A, B: BUILTIN.B }, modal: null, importDraft: null, importBusy: false, importError: '', saveFlag: '', exporting: null,
  });
});
afterEach(() => { useAppStore.setState(kept); });

describe('allWeeks after a failed history load', () => {
  it('throws HistoryIncompleteError and returns no partial list when the second read fails too', async () => {
    afterFirstFailure('fail');
    await expect(st().allWeeks()).rejects.toBeInstanceOf(HistoryIncompleteError);
    expect(loads).toBe(1);
  });
  it('returns every week and clears the flag when the second read succeeds', async () => {
    afterFirstFailure('ok');
    const all = await st().allWeeks();
    expect(Object.keys(all).sort()).toEqual([OLD, OLDER, st().weekKey()].sort());
    expect(st().historyFailed).toBe(false);
  });
  it('does not reload when the last load was fine', async () => {
    useAppStore.setState({ weekHist: { [OLD]: week() }, historyFailed: false, loadHistory: failingLoad });
    expect(Object.keys(await st().allWeeks())).toContain(OLD);
    expect(loads).toBe(0);
  });
});

describe('export under a history failure', () => {
  const dl = () => ({ save: vi.fn(async () => undefined) });
  for (const [name, run] of [['JSON', () => st().downloadData()], ['Excel overall', () => st().downloadExcel('all')]] as const) {
    it(`${name}: no file is made and the message says why`, async () => {
      const d = dl(); useAppStore.setState({ dl: d }); afterFirstFailure('fail');
      await run();
      expect(d.save).not.toHaveBeenCalled();
      expect(st().saveFlag).toBe(SAVED + 'exported. Try again.');
      expect(st().exporting).toBeNull();
    });
  }
  it('a one-week export is unchanged', async () => {
    const d = dl(); useAppStore.setState({ dl: d }); afterFirstFailure('fail');
    await st().downloadExcel('week');
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(st().saveFlag).toBe('Exported');
  });
  it('JSON export after a good second read holds every week', async () => {
    const d = dl(); useAppStore.setState({ dl: d }); afterFirstFailure('ok');
    await st().downloadData();
    const { data } = (d.save.mock.calls[0] as any)[0];
    expect(Object.keys(JSON.parse(data).weeks)).toContain(OLDER);
  });
});

describe('daily backup under a history failure', () => {
  it('saves no file, then saves the full one after a good read', async () => {
    const { saveDailyBackup } = await import('../lib/autoBackup.js'); const save = vi.mocked(saveDailyBackup); save.mockClear();
    afterFirstFailure('fail');
    await st().backupNow();
    expect(save).not.toHaveBeenCalled();
    afterFirstFailure('ok');
    await st().backupNow();
    expect(save).toHaveBeenCalledTimes(1);
    expect(Object.keys((save.mock.calls[0] as any)[0].weeks)).toContain(OLDER);
  });
});

describe('import under a history failure', () => {
  for (const mode of ['merge', 'replace'] as const) {
    it(`${mode}: nothing changes and it says why`, async () => {
      const wk = st().weekKey();
      useAppStore.setState({ logs: { hack: [{ d: wk, ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk }] }, week: week({ 'A-d3s1': true }) });
      const text = JSON.stringify(buildDataFile(st().snapshot(), {}));
      const before = structuredClone({ logs: st().logs, week: st().week, body: st().body, cfg: st().cfg, library: st().library });
      await st().readImportFile({ name: 'd.json', arrayBuffer: async () => new TextEncoder().encode(text).buffer });
      useAppStore.setState({ logs: {}, week: week(), body: [] });
      const empty = structuredClone({ logs: st().logs, week: st().week, body: st().body, cfg: st().cfg, library: st().library });
      afterFirstFailure('fail'); clearStorage();
      await st().applyImport(mode);
      expect({ logs: st().logs, week: st().week, body: st().body, cfg: st().cfg, library: st().library }).toEqual(empty);
      expect(before.logs).not.toEqual(empty.logs);
      expect(st().saveFlag).toBe(SAVED + 'imported. Try again.');
      expect(Object.keys(mem).filter(k => /logs\/|weeks\//.test(k))).toEqual([]);
    });
  }
});

describe('erase under a history failure', () => {
  it('weeks chosen: nothing at all is deleted, other parts included, and the message shows', async () => {
    mem['ironlog:weeks/' + OLD] = JSON.stringify(week({ a: true })); mem['ironlog:weeks/' + OLDER] = JSON.stringify(week({ b: true }));
    useAppStore.setState({ logs: { hack: [{ d: OLD, w: 1, s: 1, r: 1 }] }, body: [{ wk: OLD, d: OLD, w: 180 }], week: week({ x: true }) });
    afterFirstFailure('fail');
    const r = await st().eraseData({ weeks: true, logs: true, body: true, programs: true, settings: true });
    expect(r).toBe(false);
    expect(st().saveFlag).toBe(SAVED + 'erased. Try again.');
    expect(Object.keys(st().logs)).toEqual(['hack']);
    expect(st().body).toHaveLength(1);
    expect(st().week.done).toEqual({ x: true });
    expect(mem['ironlog:weeks/' + OLD]).toBeDefined(); expect(mem['ironlog:weeks/' + OLDER]).toBeDefined();
  });
  it('weeks chosen, second read fine: erases every week', async () => {
    mem['ironlog:weeks/' + OLD] = JSON.stringify(week()); mem['ironlog:weeks/' + OLDER] = JSON.stringify(week());
    afterFirstFailure('ok');
    expect(await st().eraseData({ weeks: true })).toBe(true);
    expect(mem['ironlog:weeks/' + OLD]).toBeUndefined(); expect(mem['ironlog:weeks/' + OLDER]).toBeUndefined();
  });
});

describe('a reload already in flight', () => {
  // The real loadHistory, with a read that fails: two calls at once never see the partial list.
  const failRead = () => vi.spyOn(localStorage, 'key').mockImplementation(() => { throw new Error('storage read failed'); });
  it('two concurrent allWeeks() calls both throw', async () => {
    mem['ironlog:weeks/' + OLD] = JSON.stringify(week()); // so the loop over the stored keys runs and hits the failing read
    useAppStore.setState({ ...kept, weekHist: { [OLD]: week() }, historyFailed: true });
    const spy = failRead();
    try {
      const r = await Promise.allSettled([st().allWeeks(), st().allWeeks()]);
      expect(r.map(x => x.status)).toEqual(['rejected', 'rejected']);
      r.forEach(x => expect((x as PromiseRejectedResult).reason).toBeInstanceOf(HistoryIncompleteError));
    } finally { spy.mockRestore(); }
  });
  it('two concurrent calls both return the full list when the retry succeeds', async () => {
    mem['ironlog:weeks/' + OLD] = JSON.stringify(week()); mem['ironlog:weeks/' + OLDER] = JSON.stringify(week());
    useAppStore.setState({ ...kept, weekHist: { [OLD]: week() }, historyFailed: true });
    const r = await Promise.all([st().allWeeks(), st().allWeeks()]);
    r.forEach(all => expect(Object.keys(all)).toEqual(expect.arrayContaining([OLD, OLDER])));
  });
});
