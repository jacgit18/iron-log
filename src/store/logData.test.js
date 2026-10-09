// Workout log integrity: nothing duplicated, lost, or logged that wasn't done. One test per way it went wrong.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { mem, clearStorage, saved } from '../test/browserStubs.js';

let useAppStore, fromOtherTab, BUILTIN, DEFAULT_CFG, mergeEntries, buildDataFile, buildOverallWorkbook, loadXLSX, summarizeSets, isItemDone, phaseOf;
const st = () => useAppStore.getState();
const file = (name, body) => {
  const buf = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return { name, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const total = () => Object.values(st().logs).reduce((a, l) => a + l.length, 0);
const forCard = (ex, slot) => (st().logs[ex] || []).filter(e => e.slot === slot && e.wk === st().weekKey());
// The entry the log sheet builds (LogSheet.jsx submit).
const sheetEntry = (slot, sets, extra = {}) => ({ d: st().weekKey(), ph: 'hyp', ...summarizeSets(sets, false), slot, wk: st().weekKey(), ...extra });

beforeAll(async () => {
  ({ useAppStore, fromOtherTab } = await import('./useAppStore.js'));
  ({ BUILTIN } = await import('../lib/data.js'));
  ({ DEFAULT_CFG, summarizeSets, isItemDone, phaseOf } = await import('../lib/logic.js'));
  ({ buildDataFile, buildOverallWorkbook, loadXLSX, mergeEntries } = await import('../lib/export.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({
    cfg: structuredClone(DEFAULT_CFG), logs: {}, week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} }, weekHist: {},
    body: [], library: [], experiments: [], programs: { A: BUILTIN.A, B: BUILTIN.B }, modal: null, backupMsg: null,
    importDraft: null, importBusy: false, importError: '', importCount: 0, saveFlag: '', uncheckNote: null, orderNote: null, moveNote: null,
  });
});

describe('log data', () => {
  // A-d3s1 = Hack Squat (single). A-d1s1 = Lat pulldown (single). A-d2s2 = either Rear delt / Face pull.
  it('F1 merge-importing a whole-backup Excel workbook of the same data adds no entries (key-order dedupe)', async () => {
    st().checkCard('A-d3s1', true); // check-off entry (auto)
    st().submitLog('A-d1s1', 0, { entry: sheetEntry('A-d1s1', [{ w: 45, r: 12 }, { w: 45, r: 12 }], { n: 'felt good' }), ph: 'hyp', done: true });
    st().quickLog('A-d3s2', 0); // "Same as last" on the other lat pulldown card
    const before = total();
    expect(before).toBe(3);
    const X = await loadXLSX();
    const S = await st().fullSnapshot();
    const bytes = new Uint8Array(X.write(buildOverallWorkbook(X, S, await st().allWeeks()), { type: 'array', bookType: 'xlsx' }));
    await st().readImportFile(file('iron-log.xlsx', bytes));
    expect(st().importDraft.data.excel.complete).toBe(true);
    await st().applyImport('merge');
    expect(total()).toBe(before);
  });

  it('F2 merge-importing an older backup does not bring back the pre-edit copy of an edited entry', async () => {
    const wk = st().weekKey();
    useAppStore.setState({ logs: { hack: [{ d: wk, ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk }] } });
    const backup = JSON.stringify(buildDataFile(st().snapshot(), {}));
    st().updateLog('hack', st().logs.hack[0], { slot: 'A-d3s1', wk, d: wk, ph: 'hyp', w: 275, s: 4, r: 15 }); // fixed a typo in the weight
    await st().readImportFile(file('d.json', backup));
    await st().applyImport('merge');
    expect(st().logs.hack).toHaveLength(1);
  });

  it('F3 merge-importing another device\'s check-off of the same card/week does not double it', async () => {
    const wk = st().weekKey();
    st().checkCard('A-d3s1', true); // this device: check-off dated today
    const other = { ...st().logs.hack[0], d: wk }; // other device ticked the same card on a different day
    const text = JSON.stringify(buildDataFile({ ...st().snapshot(), logs: { hack: [other] } }, { [wk]: { done: { 'A-d3s1': true } } }));
    await st().readImportFile(file('d.json', text));
    await st().applyImport('merge');
    expect(forCard('hack', 'A-d3s1')).toHaveLength(1);
  });

  it('F3b merge-importing a check-off for a card already logged by hand does not add a phantom auto entry', async () => {
    const wk = st().weekKey();
    st().submitLog('A-d3s1', 0, { entry: sheetEntry('A-d3s1', [{ w: 280, r: 12 }]), ph: 'hyp', done: true });
    const auto = { d: wk, ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk, auto: true };
    const text = JSON.stringify(buildDataFile({ ...st().snapshot(), logs: { hack: [auto] } }, { [wk]: { done: { 'A-d3s1': true } } }));
    await st().readImportFile(file('d.json', text));
    await st().applyImport('merge');
    expect(forCard('hack', 'A-d3s1').filter(e => e.auto)).toHaveLength(0);
  });

  it('F4 tapping "Same as last" twice does not log the card twice', () => {
    useAppStore.setState({ logs: { hack: [{ d: '2026-01-05', ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk: '2026-01-04' }] } });
    st().quickLog('A-d3s1', 0);
    st().quickLog('A-d3s1', 0); // double tap: the button stays on the card
    expect(forCard('hack', 'A-d3s1')).toHaveLength(1);
  });

  it('F5 logging the other option of an either/or card from the log sheet removes the first option\'s check-off entry', () => {
    st().checkItem('A-d2s2', 0, true); // rear delt ticked: auto entry
    expect(forCard('reardelt', 'A-d2s2')).toHaveLength(1);
    st().submitLog('A-d2s2', 1, { entry: sheetEntry('A-d2s2', [{ w: 30, r: 15 }]), ph: 'hyp', done: true }); // did face pulls instead
    const s = st().slotById('A-d2s2');
    expect(isItemDone(s, 0, st().week)).toBe(false); // the board now shows rear delt as not done...
    expect(forCard('reardelt', 'A-d2s2')).toHaveLength(0); // ...so its check-off entry must go
  });

  it('F6 Undo of an uncheck after the card was logged again does not duplicate the session', () => {
    st().submitLog('A-d3s1', 0, { entry: sheetEntry('A-d3s1', [{ w: 280, r: 12 }]), ph: 'hyp', done: true });
    st().checkCard('A-d3s1', false); // removes the logged entry, leaves an Undo notice
    st().submitLog('A-d3s1', 0, { entry: sheetEntry('A-d3s1', [{ w: 285, r: 10 }]), ph: 'hyp', done: true }); // logged again
    expect.soft(st().uncheckNote).toBeNull(); // the notice should be gone once the card was re-logged...
    st().undoUncheck(); // ...or Undo must not add the old one back next to the new one
    expect(forCard('hack', 'A-d3s1')).toHaveLength(1);
  });

  it('F7 changing a ticked card\'s phase updates its check-off entry', () => {
    st().checkCard('A-d3s1', true);
    st().setPhase('A-d3s1', 0, 'strength');
    const s = st().slotById('A-d3s1');
    expect(forCard('hack', 'A-d3s1').map(e => e.ph)).toEqual([phaseOf(st().cfg, st().week, s, 0)]);
  });

  it('F8 replacing the exercise on a ticked card does not orphan its check-off entry', () => {
    st().checkCard('A-d3s1', true); // hack squat auto entry
    const prog = structuredClone(st().programs.A); delete prog.key;
    prog.days[2].slots.find(x => x.id === 'A-d3s1').items[0].ex = 'legext';
    st().saveProgram('A', prog); // Program tab: swap the exercise on that card
    st().checkCard('A-d3s1', false); // untick the card
    const orphans = Object.values(st().logs).flat().filter(e => e.auto && e.slot === 'A-d3s1' && e.wk === st().weekKey());
    expect(orphans).toHaveLength(0);
  });

  it('F9 editing an entry by index edits that entry even if the list changed meanwhile (remote snapshot)', () => {
    const a = { d: '2026-01-06', ph: 'hyp', w: 250, s: 4, r: 12 }; const b = { d: '2026-01-13', ph: 'hyp', w: 260, s: 4, r: 12 };
    useAppStore.setState({ logs: { hack: [a, b] } });
    const open = st().logs.hack[1]; // the Detail sheet's edit form opened on b
    useAppStore.setState({ logs: { hack: [{ d: '2026-01-01', ph: 'hyp', w: 240, s: 4, r: 12 }, structuredClone(a), structuredClone(b)] } }); // another device's earlier session arrives
    expect(st().updateLog('hack', open, { ...b, w: 265 })).toBe(true);
    expect(st().logs.hack.map(e => e.w).sort()).toEqual([240, 250, 265]);
    // Changed on the other device meanwhile: refused, nothing overwritten.
    useAppStore.setState({ logs: { hack: [{ ...a, w: 251 }] } });
    expect(st().updateLog('hack', a, { ...a, w: 999 })).toBe(false);
    expect(st().logs.hack.map(e => e.w)).toEqual([251]);
  });

  it('F9b deleting an entry by index deletes that entry even if the list changed meanwhile', () => {
    const a = { d: '2026-01-06', ph: 'hyp', w: 250, s: 4, r: 12 }; const b = { d: '2026-01-13', ph: 'hyp', w: 260, s: 4, r: 12 };
    useAppStore.setState({ logs: { hack: [a, b] } });
    const armed = st().logs.hack[1]; // "Delete?" was armed on b
    useAppStore.setState({ logs: { hack: [{ d: '2026-01-01', ph: 'hyp', w: 240, s: 4, r: 12 }, structuredClone(a), structuredClone(b)] } });
    st().deleteLog('hack', armed);
    expect(st().logs.hack.map(e => e.w)).toEqual([240, 250]);
  });

  it('F12 a second tab (local mode) does not overwrite entries the first tab saved for the same exercise', () => {
    const wk = st().weekKey();
    const other = { d: wk, ph: 'hyp', w: 280, s: 4, r: 12, slot: 'A-d5s3', wk };
    mem['ironlog:logs/hack'] = JSON.stringify({ entries: [other] }); // the other tab (or the installed app) saved this
    fromOtherTab({ key: 'ironlog:logs/hack', newValue: mem['ironlog:logs/hack'] }); // the browser tells this tab
    st().checkCard('A-d3s1', true);
    expect(saved('logs/hack').entries).toContainEqual(other);
  });

  it('F10 erasing logged sessions drops the Undo notice so it can\'t bring entries back', async () => {
    st().submitLog('A-d3s1', 0, { entry: sheetEntry('A-d3s1', [{ w: 280, r: 12 }]), ph: 'hyp', done: true });
    st().checkCard('A-d3s1', false);
    await st().eraseData({ logs: true });
    st().undoUncheck();
    expect(total()).toBe(0);
  });
});

describe('log data: saves that are refused', () => {
  // Storage refuses every write while fn runs (awaited, for async fn).
  const full = async fn => { const set = localStorage.setItem; localStorage.setItem = () => { throw new Error('QuotaExceededError'); }; try { return await fn(); } finally { localStorage.setItem = set; } };
  it('a refused write stays listed as unsaved until a retry succeeds', async () => {
    await full(() => st().checkCard('A-d3s1', true));
    expect(st().unsaved).toEqual(expect.arrayContaining(['logs/hack']));
    expect(saved('logs/hack')).toBeNull();
    st().retryUnsaved();
    expect(st().unsaved).toEqual([]);
    expect(saved('logs/hack').entries).toHaveLength(1);
  });
  it('replace-import keeps the old data when the file\'s data couldn\'t be written', async () => {
    const old = { d: '2026-01-06', ph: 'hyp', w: 250, s: 4, r: 12 };
    useAppStore.setState({ logs: { hack: [old] } }); st().saveLog('hack');
    st().pasteImport(JSON.stringify(buildDataFile({ ...st().snapshot(), logs: { legext: [{ d: '2026-01-07', ph: 'hyp', w: 90, s: 3, r: 12 }] } }, {})));
    await full(() => st().applyImport('replace'));
    expect(saved('logs/hack').entries).toEqual([old]); // not deleted, since the new data wasn't saved
    st().retryUnsaved();
  });
  it('merge keeps one check-off per card and week, and a session logged by hand replaces it', () => {
    const wk = '2026-01-04';
    const auto = { d: '2026-01-05', ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk, auto: true };
    const real = { d: '2026-01-06', ph: 'hyp', w: 280, s: 4, r: 12, slot: 'A-d3s1', wk };
    expect(mergeEntries([auto], [real])).toEqual([real]);
    expect(mergeEntries([real], [auto])).toEqual([real]);
    expect(mergeEntries([auto], [{ ...auto, d: '2026-01-07' }])).toEqual([auto]);
  });
  it('"Same as last" says so instead of logging twice', () => {
    useAppStore.setState({ logs: { hack: [{ d: '2026-01-05', ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1', wk: '2026-01-04' }] } });
    st().quickLog('A-d3s1', 0); st().quickLog('A-d3s1', 0);
    expect(st().saveFlag).toBe('Already logged this week');
  });
});

// A Firestore-like db with Firestore's default listener semantics: a local write fires a snapshot with
// hasPendingWrites = true, and the server ack (metadata only) fires nothing.
function fakeDb() {
  const docs = new Map(); const listeners = []; let pending = [];
  const colOf = p => p.split('/')[0];
  const hasPend = l => pending.some(w => (l.kind === 'col' ? colOf(w.path) === l.name : w.path === l.name));
  const snap = l => (l.kind === 'col'
    ? { metadata: { hasPendingWrites: hasPend(l) }, docs: [...docs].filter(([p]) => colOf(p) === l.name).map(([p, v]) => ({ id: p.slice(l.name.length + 1), exists: true, data: () => structuredClone(v) })) }
    : { metadata: { hasPendingWrites: hasPend(l) }, exists: docs.has(l.name), data: () => structuredClone(docs.get(l.name)) });
  const notify = path => listeners.forEach(l => { if (l.on && (l.kind === 'col' ? l.name === colOf(path) : l.name === path)) l.cb(snap(l)); });
  const listen = (kind, name) => cb => { const l = { kind, name, cb, on: true }; listeners.push(l); cb(snap(l)); return () => { l.on = false; }; };
  const write = (path, fn) => new Promise(res => { fn(); pending.push({ path, res }); notify(path); });
  return {
    docs,
    collection: name => ({ onSnapshot: listen('col', name), get: async () => snap({ kind: 'col', name }) }),
    doc: path => ({ onSnapshot: listen('doc', path), set: data => write(path, () => docs.set(path, structuredClone(data))), delete: () => write(path, () => docs.delete(path)) }),
    ack() { const p = pending; pending = []; p.forEach(w => w.res()); },
    remoteSet(path, data) { docs.set(path, structuredClone(data)); notify(path); },
  };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('log data: db sync', () => {
  it('F11 a remote log change that arrives while a local write is pending is not lost or overwritten', async () => {
    const fdb = fakeDb();
    fdb.docs.set('programs/A', structuredClone(BUILTIN.A)); fdb.docs.set('programs/B', structuredClone(BUILTIN.B)); // an account that already has its program (a blank new one has no card to tick)
    vi.resetModules();
    globalThis.claude = { use: async n => (n === 'db' ? fdb : null) };
    try {
      const { useAppStore: S2 } = await import('./useAppStore.js');
      const s2 = () => S2.getState();
      await s2().init(); await tick();
      expect(s2().isReady()).toBe(true);
      const wk = s2().weekKey();
      s2().checkCard('A-d1s1', true); // this device: writes logs/latpd + the week (pending)
      const remote = { d: wk, ph: 'hyp', w: 280, s: 4, r: 12, slot: 'A-d5s3', wk };
      fdb.remoteSet('logs/hack', { entries: [remote] }); // other device logs hack squat; event has hasPendingWrites
      fdb.ack(); await tick(); // our writes acked: Firestore sends no new event
      expect.soft(s2().logs.hack).toEqual([remote]); // state should show the other device's entry
      s2().checkCard('A-d3s1', true); // tick the other hack squat card here
      await tick(); fdb.ack(); await tick();
      expect(fdb.docs.get('logs/hack').entries).toContainEqual(remote); // and must not overwrite it in the db
    } finally { delete globalThis.claude; }
  });

  it('V1 a session with an impossible date is refused at add and edit, and out-of-range numbers are cleaned', () => {
    expect(st().submitLog('A-d1s1', 0, { entry: sheetEntry('A-d1s1', [{ w: 45, r: 12 }], { d: '2026-02-31' }), ph: 'hyp', done: false })).toBeFalsy();
    expect(total()).toBe(0);
    st().submitLog('A-d1s1', 0, { entry: sheetEntry('A-d1s1', [{ w: 45, r: 99999 }]), ph: 'hyp', done: false });
    const e = st().logs['lat-pulldown'] ? st().logs['lat-pulldown'][0] : Object.values(st().logs)[0][0];
    expect(e.r).toBeNull();
    expect(st().updateLog(Object.keys(st().logs)[0], e, { ...e, d: 'nope' })).toBe(false);
  });

  it('V2 a partial Excel import cleans sessions and settings', async () => {
    const X = await loadXLSX();
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Date', 'Week of', 'Exercise', 'Phase', 'Weight (lb)', 'Sets', 'Reps', 'Hold (s)', 'Set detail', '', 'Primary', 'Secondary', 'Note', 'Slot', 'Id'],
      ['2026-10-05', '2026-10-05', 'Bench Press', '', 135, 3, 8, '', '', '', '', '', '', '', ''],
      ['2026-02-31', '2026-10-05', 'Bench Press', '', 135, 3, 8, '', '', '', '', '', '', '', '']]), 'Sessions');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Setting', 'Value'], ['Rest between sets (s)', 999999], ['Mode', 7]]), 'Settings');
    const bytes = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
    await st().readImportFile(file('iron-log.xlsx', bytes));
    const d = st().importDraft.data;
    expect(Object.values(d.logs).flat()).toHaveLength(1);
    expect(d.excel.skipped).toBe(1);
    expect(d.excel.settings.rest).toBeUndefined();
    expect(d.excel.settings.mode).toBeUndefined();
  });

  it('M1 merge-import keeps this device\'s body weight, stretches, water and settings, and adds only what is missing', async () => {
    const supp = { waterGoal: 64, waterMode: 'weight', water: { '2026-10-05': [8, 8] }, items: [], taken: {} };
    useAppStore.setState(s => ({
      body: [{ wk: '2026-10-05', d: '2026-10-06', w: 180 }],
      stretches: [{ id: 's1', n: 'Hamstring', group: 'Legs', tier: '' }],
      supp,
      cfg: { ...s.cfg, rm: { bench: 200 }, rest: 90 },
    }));
    const text = JSON.stringify({
      app: 'iron-log', format: 1,
      config: { rm: { bench: 300, squat: 400 }, rest: 45 },
      body: [{ wk: '2026-10-05', d: '2026-10-07', w: 190 }, { wk: '2026-10-12', d: '2026-10-13', w: 185 }],
      stretches: { items: [{ id: 's9', n: 'hamstring', group: 'Legs' }, { id: 's2', n: 'Calf', group: 'Legs' }], experiments: [] },
      supplements: { water: { '2026-10-05': [16], '2026-10-06': [8] }, items: [], taken: {} },
    });
    await st().readImportFile(file('iron-log-data.json', text));
    await st().applyImport('merge');
    expect(st().body).toEqual([{ wk: '2026-10-05', d: '2026-10-06', w: 180 }, { wk: '2026-10-12', d: '2026-10-13', w: 185 }]); // this device's week wins; a new week is added
    expect(st().stretches.map(x => x.n)).toEqual(['Hamstring', 'Calf']); // same name (any case) is not added twice
    expect(st().supp.water).toEqual({ '2026-10-05': [8, 8], '2026-10-06': [8] }); // a day this device has stays as it is
    expect(st().cfg.rm).toEqual({ bench: 200, squat: 400 }); // only missing 1RMs are added
    expect(st().cfg.rest).toBe(90); // other settings are not touched by a merge
  });

  it('T1 a session is stamped when added and again when edited, keeps its id, and is saved with the schema version', async () => {
    const { saved } = await import('../test/browserStubs.js');
    st().submitLog('A-d1s1', 0, { entry: sheetEntry('A-d1s1', [{ w: 45, r: 12 }]), ph: 'hyp', done: false });
    const exId = Object.keys(st().logs)[0]; const e = st().logs[exId][0];
    expect(e.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(e.id).toBeTruthy();
    await new Promise(r => setTimeout(r, 5));
    expect(st().updateLog(exId, e, { ...e, n: 'felt good' })).toBe(true);
    const e2 = st().logs[exId][0];
    expect(e2.id).toBe(e.id); expect(e2.n).toBe('felt good');
    expect(Date.parse(e2.updatedAt)).toBeGreaterThan(Date.parse(e.updatedAt));
    expect(saved('logs/' + exId).schema).toBe(1);
  });

  it('T2 a body weight is stamped, and check-offs are stamped', () => {
    st().saveBodyWeight(180);
    expect(st().body[0].updatedAt).toMatch(/^\d{4}-/);
    st().checkCard('A-d3s1', true);
    expect(Object.values(st().logs).flat()[0].updatedAt).toMatch(/^\d{4}-/);
  });
});

// ADR 016: a brand-new signed-in account starts with a blank board; an account that already has data keeps the program it has been using.
describe('log data: what a new account starts with (ADR 016)', () => {
  const boot = async fdb => {
    vi.resetModules();
    globalThis.claude = { use: async n => (n === 'db' ? fdb : null) };
    const { useAppStore: S2 } = await import('./useAppStore.js');
    const data = await import('../lib/data.js');
    await S2.getState().init(); await tick();
    return { S2, s2: () => S2.getState(), ...data };
  };
  const cards = (s2, slotsFor, k) => slotsFor(s2().programs[k]).length;
  const entry = { d: '2026-10-05', ph: 'hyp', w: 45, s: 4, r: 12, slot: 'A-d1s1', wk: '2026-10-05' };

  it('P1 an account with no program and no log entries gets seven empty days, and none of the built-in cards', async () => {
    try {
      const { s2, BLANK, BUILTIN, slotsFor } = await boot(fakeDb());
      expect(s2().isReady()).toBe(true);
      expect(s2().programs.A).toBe(BLANK.A); expect(s2().programs.B).toBe(BLANK.B);
      expect(s2().programs.A).not.toBe(BUILTIN.A);
      expect(s2().programs.A.days).toHaveLength(7);
      expect(cards(s2, slotsFor, 'A')).toBe(0); expect(cards(s2, slotsFor, 'B')).toBe(0);
    } finally { delete globalThis.claude; }
  });

  it('P2 an account with log entries and no saved program keeps the built-in plan its entries point at', async () => {
    const fdb = fakeDb(); fdb.docs.set('logs/latpd', { entries: [entry] });
    try {
      const { s2, BUILTIN, slotsFor } = await boot(fdb);
      expect(s2().programs.A).toBe(BUILTIN.A); expect(s2().programs.B).toBe(BUILTIN.B);
      expect(cards(s2, slotsFor, 'A')).toBeGreaterThan(0);
    } finally { delete globalThis.claude; }
  });

  it('P3 logs that arrive after the programs bring the built-in plan back, so a late device never leaves an existing account blank', async () => {
    const fdb = fakeDb();
    try {
      const { s2, BLANK, BUILTIN } = await boot(fdb);
      expect(s2().programs.A).toBe(BLANK.A); // nothing here yet
      fdb.remoteSet('logs/latpd', { entries: [entry] }); await tick(); // the account's entries arrive
      expect(s2().programs.A).toBe(BUILTIN.A); expect(s2().programs.B).toBe(BUILTIN.B);
    } finally { delete globalThis.claude; }
  });

  it('P4 a saved program is used as saved, with or without log entries', async () => {
    const fdb = fakeDb(); const mine = structuredClone(BUILTIN.A); mine.days[0].title = 'Push';
    fdb.docs.set('programs/A', mine);
    try {
      const { s2, BLANK, BUILTIN: B2 } = await boot(fdb);
      expect(s2().programs.A.days[0].title).toBe('Push'); // A: saved
      expect(s2().programs.B).toBe(BLANK.B); // B: none saved, no entries
      fdb.remoteSet('logs/latpd', { entries: [entry] }); await tick();
      expect(s2().programs.A.days[0].title).toBe('Push'); // still the saved one
      expect(s2().programs.B).toBe(B2.B);
    } finally { delete globalThis.claude; }
  });

  it('P5 a program a new account has just edited is never swapped back by a later settle', async () => {
    const fdb = fakeDb();
    try {
      const { s2, BLANK } = await boot(fdb);
      const mine = { ...structuredClone(BLANK.A), days: structuredClone(BLANK.A.days) }; mine.days[0].title = 'Mine';
      s2().saveProgram('A', mine); await tick();
      expect(s2().programs.A.days[0].title).toBe('Mine');
      fdb.remoteSet('logs/latpd', { entries: [entry] }); await tick(); // a settle runs: the edited program is neither built-in nor blank
      expect(s2().programs.A.days[0].title).toBe('Mine');
    } finally { delete globalThis.claude; }
  });

  it('P6 the board is never ready with the built-in plan on its way to blank: the choice is made in the same update that marks it ready', async () => {
    vi.resetModules();
    globalThis.claude = { use: async n => (n === 'db' ? fakeDb() : null) };
    try {
      const { useAppStore: S2 } = await import('./useAppStore.js');
      const { BLANK, BUILTIN } = await import('../lib/data.js');
      const readyPrograms = [];
      S2.subscribe(state => { if (state.isReady()) readyPrograms.push(state.programs.A); });
      await S2.getState().init(); await tick();
      expect(readyPrograms.length).toBeGreaterThan(0);
      expect(readyPrograms.every(p => p === BLANK.A)).toBe(true);
      expect(readyPrograms.includes(BUILTIN.A)).toBe(false);
    } finally { delete globalThis.claude; }
  });
});
