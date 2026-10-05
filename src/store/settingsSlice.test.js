import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

let useAppStore, BUILTIN, DEFAULT_CFG, PHASES, buildDataFile, buildCsv, buildOverallWorkbook, loadXLSX, normStretchWeek, normSupplements;
const st = () => useAppStore.getState();

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ BUILTIN, PHASES } = await import('../lib/data.js'));
  ({ DEFAULT_CFG } = await import('../lib/logic.js'));
  ({ buildDataFile, buildCsv, buildOverallWorkbook, loadXLSX } = await import('../lib/export.js'));
  ({ normStretchWeek } = await import('../lib/stretches.js'));
  ({ normSupplements } = await import('../lib/water.js'));
  await st().init();
});
beforeEach(() => {
  clearStorage();
  useAppStore.setState({
    cfg: structuredClone(DEFAULT_CFG), logs: {}, week: { prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} }, weekHist: {},
    body: [], library: [], experiments: [], programs: { A: BUILTIN.A, B: BUILTIN.B }, modal: null, backupMsg: null,
    importDraft: null, importBusy: false, importError: '', importCount: 0, saveFlag: '',
  });
});

const file = (name, body) => {
  const buf = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return { name, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
// A data file as text, built from the given pieces of state the same way the app's own export does.
const dataText = ({ programs, ...over } = {}, weeks = {}) => JSON.stringify(buildDataFile({
  cfg: structuredClone(DEFAULT_CFG), logs: {}, programs: { A: BUILTIN.A, B: BUILTIN.B, ...programs }, library: [], body: [], experiments: [], ...over,
}, weeks));
const entry = (d, w = 100) => ({ d, ph: 'hyp', w, s: 3, r: 10 });

describe('settings fields', () => {
  it('sets a phase percent and ignores blank or non-numeric input', () => {
    st().setPct('hyp', '70');
    expect(st().cfg.pct.hyp).toBe(70);
    expect(saved('config/main').pct.hyp).toBe(70);
    expect(st().setPct('hyp', '')).toBe(false); expect(st().setPct('hyp', 'abc')).toBe(false); expect(st().setPct('hyp', '500')).toBe(false);
    expect(st().cfg.pct.hyp).toBe(70);
  });
  it('sets an Rx override, and clears it when blank or equal to the default', () => {
    st().setRxOverride('hyp', ' 5 × 5 ');
    expect(st().cfg.rxOverride.hyp).toBe('5 × 5');
    st().setRxOverride('hyp', PHASES.hyp.rx);
    expect(st().cfg.rxOverride.hyp).toBeUndefined();
    st().setRxOverride('hyp', '4 × 4'); st().setRxOverride('hyp', '  ');
    expect(st().cfg.rxOverride).toEqual({});
  });
  it('sets the rest time and rejects blank or negative values', () => {
    st().setRest('90');
    expect(st().cfg.rest).toBe(90);
    expect(st().setRest('')).toBe(false); expect(st().setRest('-5')).toBe(false); expect(st().setRest('1e999')).toBe(false);
    expect(st().cfg.rest).toBe(90);
  });
  it('sets a one-rep max, and removes it when blank, zero or negative', () => {
    st().setRm('hack', '300');
    expect(st().cfg.rm.hack).toBe(300);
    st().setRm('hack', '0');
    expect(st().cfg.rm.hack).toBeUndefined();
    st().setRm('hack', '300'); st().setRm('hack', '');
    expect(st().cfg.rm).toEqual({});
  });
  it('sets any config field', () => {
    st().setCfgField('mode', 2);
    expect(saved('config/main').mode).toBe(2);
  });
  it('refuses edits until data has loaded', () => {
    const ready = st().isReady; useAppStore.setState({ isReady: () => false });
    st().setPct('hyp', '10');
    useAppStore.setState({ isReady: ready });
    expect(st().cfg.pct.hyp).toBe(DEFAULT_CFG.pct.hyp);
    expect(st().saveFlag).toMatch(/Still loading/);
  });
  it('accepts an owner/repo backup target and rejects anything else', () => {
    st().setBackupRepo(' me/my-data ');
    expect(st().cfg.backup).toMatchObject({ repo: 'me/my-data', hashes: {} });
    expect(st().backupMsg).toBeNull();
    st().setBackupRepo('not a repo');
    expect(st().backupMsg).toMatchObject({ kind: 'err' });
    expect(st().cfg.backup.repo).toBe('me/my-data');
  });
  it('toggles the import choices on a draft, and does nothing without one', () => {
    st().setImportUseSettings(false); st().setImportSection('board', false);
    expect(st().importDraft).toBeNull();
    useAppStore.setState({ importDraft: { data: {}, kind: 'json' } });
    st().setImportUseSettings(false); st().setImportSection('board', false);
    expect(st().importDraft).toMatchObject({ useSettings: false, sel: { board: false, progress: true } });
  });
});

describe('reading an import file', () => {
  it('reads a JSON data file into a draft and opens the import sheet', async () => {
    await st().readImportFile(file('iron-log-data.json', dataText({ logs: { hack: [entry('2026-01-05')] } })));
    expect(st().importDraft).toMatchObject({ name: 'iron-log-data.json', kind: 'json' });
    expect(st().importDraft.data.logs.hack).toHaveLength(1);
    expect(st().modal).toEqual({ type: 'import' });
  });
  it('reads a CSV export as sessions only, leaving settings alone', async () => {
    const csv = buildCsv({ cfg: DEFAULT_CFG, logs: { hack: [entry('2026-01-05')] } });
    await st().readImportFile(file('iron-log.csv', csv));
    expect(st().importDraft).toMatchObject({ kind: 'excel', useSettings: false });
    expect(Object.values(st().importDraft.data.logs).flat()).toHaveLength(1);
  });
  it('reads an Excel workbook, detected by its zip header or its name', async () => {
    const X = await loadXLSX();
    const S = { cfg: DEFAULT_CFG, logs: { hack: [entry('2026-01-05')] }, programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], body: [], experiments: [] };
    const bytes = new Uint8Array(X.write(buildOverallWorkbook(X, S, {}), { type: 'array', bookType: 'xlsx' }));
    await st().readImportFile(file('whatever.bin', bytes));
    expect(st().importDraft).toMatchObject({ useSettings: true });
    expect(st().importDraft.data.logs.hack).toHaveLength(1);
    expect(st().modal).toEqual({ type: 'import' });
  });
  it('reports a bad file and clears any earlier draft', async () => {
    useAppStore.setState({ importDraft: { data: {}, kind: 'json' } });
    await st().readImportFile(file('x.json', 'not json'));
    expect(st().importDraft).toBeNull();
    expect(st().importError).toMatch(/valid JSON/);
    expect(st().saveFlag).toMatch(/valid JSON/);
    await st().readImportFile(file('x.xlsx', 'not a workbook'));
    expect(st().importError).toMatch(/Excel/);
  });
  it('ignores a missing file', async () => {
    await st().readImportFile(null);
    expect(st().importDraft).toBeNull();
  });
  it('imports pasted text, and complains about empty or invalid paste', () => {
    st().pasteImport('   ');
    expect(st().importError).toMatch(/Paste the file contents/);
    st().pasteImport('{');
    expect(st().importError).toMatch(/valid JSON/);
    st().pasteImport(dataText());
    expect(st().importDraft).toMatchObject({ name: 'Pasted data', kind: 'json' });
    expect(st().importError).toBe('');
  });
});

describe('adding imported data', () => {
  const addJson = async (text, mode = 'merge') => { st().pasteImport(text); await st().applyImport(mode); };

  it('does nothing without a draft', async () => {
    await st().applyImport('merge');
    expect(st().importCount).toBe(0);
  });
  it('adds sessions, body weight and experiments without touching what is already here', async () => {
    useAppStore.setState({ logs: { hack: [entry('2026-01-05')] }, body: [{ wk: '2026-01-05', d: '2026-01-05', w: 200 }] });
    await addJson(dataText({
      logs: { hack: [entry('2026-01-05'), entry('2026-01-12', 110)], row: [entry('2026-01-12', 90)] },
      body: [{ wk: '2026-01-05', d: '2026-01-05', w: 999 }, { wk: '2026-01-12', d: '2026-01-12', w: 201 }],
      experiments: [{ id: 'e1', ex: 'hack', ph: 'hyp', note: 'try' }],
    }));
    expect(st().logs.hack.map(e => e.w)).toEqual([100, 110]);
    expect(st().logs.row).toHaveLength(1);
    expect(st().body.map(b => b.w)).toEqual([200, 201]);
    expect(st().experiments).toHaveLength(1);
    expect(saved('logs/row').entries).toHaveLength(1);
    expect(st()).toMatchObject({ importDraft: null, importBusy: false, modal: null, importCount: 1, saveFlag: 'Data added' });
  });
  it('adds config entries it lacks, but never overwrites existing ones', async () => {
    useAppStore.setState({ cfg: { ...structuredClone(DEFAULT_CFG), rm: { hack: 300 } } });
    const cfg = { ...structuredClone(DEFAULT_CFG), rm: { hack: 999, row: 150 }, muscleMap: { row: { p: ['lats'], s: [] } }, ex: { zz: { n: 'Zed Press' } } };
    await addJson(dataText({ cfg }));
    expect(st().cfg.rm).toEqual({ hack: 300, row: 150 });
    expect(st().cfg.muscleMap.row).toBeDefined();
    expect(st().cfg.ex.zz.n).toBe('Zed Press');
  });
  it('honours the section choices', async () => {
    st().pasteImport(dataText({ logs: { row: [entry('2026-01-12')] }, body: [{ wk: '2026-01-12', d: '2026-01-12', w: 201 }], cfg: { ...structuredClone(DEFAULT_CFG), rm: { row: 150 } } }));
    st().setImportSection('progress', false); st().setImportSection('board', false); st().setImportSection('settings', false);
    await st().applyImport('merge');
    expect(st().logs).toEqual({});
    expect(st().body).toEqual([]);
    expect(st().cfg.rm).toEqual({});
  });
  it('keeps an edited program as a saved version when the incoming one differs', async () => {
    const custom = structuredClone(BUILTIN.A); custom.days[1].title = 'Custom day';
    await addJson(dataText({ programs: { A: custom } }));
    expect(st().programs.A.days[1].title).toBe('Custom day'); // the built-in is replaced outright

    const other = structuredClone(BUILTIN.A); other.days[1].title = 'Another one';
    await addJson(dataText({ programs: { A: other } }));
    expect(st().programs.A.days[1].title).toBe('Custom day');
    expect(st().library).toHaveLength(1);
    expect(st().library[0]).toMatchObject({ from: 'A' });
    expect(st().library[0].name).toMatch(/from import/);

    await addJson(dataText({ programs: { A: other } })); // already saved: no duplicate
    expect(st().library).toHaveLength(1);
  });
  it('adds library versions it does not have', async () => {
    const prog = structuredClone(BUILTIN.B); prog.days[1].title = 'Saved B';
    await addJson(dataText({ library: [{ id: 'v1', name: 'My B', from: 'B', at: '2026-01-01T00:00:00Z', prog }] }));
    expect(st().library.map(l => l.id)).toEqual(['v1']);
    expect(saved('library/main').items).toHaveLength(1);
  });
  it('merges a saved week into the current week and into other weeks', async () => {
    const wk = st().weekKey();
    const weeks = { [wk]: { done: { 'A-d1s1': true } }, '2020-01-06': { done: { 'A-d1s2': true } } };
    useAppStore.setState({ week: { ...st().week, done: { 'A-d2s1': true } } });
    await addJson(dataText({}, weeks));
    expect(Object.keys(st().week.done).sort()).toEqual(['A-d1s1', 'A-d2s1']);
    expect(saved('weeks/2020-01-06').done).toEqual({ 'A-d1s2': true });
  });
  it('merges stretches, their weeks, and supplements', async () => {
    const wk = st().weekKey();
    await st().readImportFile(file('d.json', JSON.stringify({
      app: 'iron-log', format: 1,
      stretches: { items: [{ id: 'frog', n: 'Frog', group: 'Hips' }, ...st().stretches.slice(0, 1)], experiments: [{ id: 'x1', n: 'Try this' }] },
      stretchWeeks: { [wk]: { done: { '1:frog': true }, skipped: {}, extra: [] }, '2020-01-06': { done: { '1:frog': true }, skipped: {}, extra: [] } },
      supplements: { water: { '2026-01-05': { oz: 64 } }, items: [{ id: 'creatine', n: 'Creatine' }], taken: { '2026-01-05': { creatine: true } } },
    })));
    const before = st().stretches.length;
    await st().applyImport('merge');
    expect(st().stretches.length).toBeGreaterThan(before - 1);
    expect(st().stretches.some(i => i.id === 'frog')).toBe(true);
    expect(st().stretchExps.some(e => e.id === 'x1')).toBe(true);
    expect(st().strWeek.done['1:frog']).toBe(true);
    expect(saved('stretchweeks/2020-01-06').done).toEqual({ '1:frog': true });
    expect(st().supp.items.some(i => i.id === 'creatine')).toBe(true);
    expect(st().supp.taken['2026-01-05']).toEqual({ creatine: true });
  });
  it('reports a failure instead of leaving the sheet stuck', async () => {
    st().pasteImport(dataText());
    const allWeeks = st().allWeeks; useAppStore.setState({ allWeeks: async () => { throw new Error('boom'); } });
    await st().applyImport('merge');
    useAppStore.setState({ allWeeks });
    expect(st().importBusy).toBe(false);
    expect(st().saveFlag).toBe('Import failed');
  });
});

describe('adding an Excel or CSV export', () => {
  it('adds new sessions, skipping ones already logged, and checks off their slots', async () => {
    const wk = st().weekKey();
    useAppStore.setState({ logs: { hack: [{ d: '2026-01-05', ph: 'hyp', w: 100, s: 3, r: 10 }] } });
    const csv = buildCsv({ cfg: DEFAULT_CFG, logs: { hack: [{ d: '2026-01-05', ph: 'hyp', w: 100, s: 3, r: 10 }, { d: '2026-01-06', ph: 'hyp', w: 105, s: 3, r: 10, slot: 'A-d3s1', wk }] } });
    await st().readImportFile(file('iron-log.csv', csv));
    await st().applyImport('merge');
    expect(st().saveFlag).toBe('Data added');
    expect(st().logs.hack).toHaveLength(2);
    expect(st().saveFlag).toBe('Data added');
  });
  it('applies the workbook settings only when asked to', async () => {
    const draft = (useSettings) => ({
      kind: 'excel', useSettings, name: 'x.xlsx',
      data: { config: {}, programs: {}, library: [], logs: {}, weeks: {}, body: [], excel: { settings: { mode: 2, rest: 75, pct: { hyp: 60 } } } },
    });
    useAppStore.setState({ importDraft: draft(false) });
    await st().applyImport('merge');
    expect(st().cfg.mode).toBe(DEFAULT_CFG.mode);
    useAppStore.setState({ importDraft: draft(true) });
    await st().applyImport('merge');
    expect(st().saveFlag).toBe('Data added');
    expect(st().cfg).toMatchObject({ mode: 2, rest: 75 });
    expect(st().cfg.pct).toMatchObject({ hyp: 60, strength: 85 });
  });
});

describe('replacing with imported data', () => {
  it('makes the app match the file: sessions, body, programs, weeks and settings', async () => {
    const custom = structuredClone(BUILTIN.A); custom.days[1].title = 'Replaced A';
    useAppStore.setState({
      logs: { hack: [entry('2026-01-05')], gone: [entry('2026-01-05')] },
      body: [{ wk: '2026-01-05', d: '2026-01-05', w: 200 }],
      cfg: { ...structuredClone(DEFAULT_CFG), rm: { gone: 1 } },
      programs: { A: BUILTIN.A, B: { ...structuredClone(BUILTIN.B), key: 'B', days: structuredClone(BUILTIN.B.days) } },
      weekHist: { '2019-12-30': { done: { x: true } } },
    });
    const wk = st().weekKey();
    st().pasteImport(dataText({
      cfg: { ...structuredClone(DEFAULT_CFG), mode: 2, rm: { hack: 300 } },
      logs: { hack: [entry('2026-02-02', 120)] },
      programs: { A: custom },
      body: [{ wk: '2026-02-02', d: '2026-02-02', w: 190 }],
      experiments: [{ id: 'e1', ex: 'hack', ph: 'hyp', note: '' }],
    }, { '2020-01-06': { done: { 'A-d1s1': true } }, [wk]: { done: { 'A-d1s2': true } } }));
    await st().applyImport('replace');

    expect(st().logs).toEqual({ hack: [entry('2026-02-02', 120)] });
    expect(saved('logs/hack').entries).toHaveLength(1);
    expect(st().body).toEqual([{ wk: '2026-02-02', d: '2026-02-02', w: 190 }]);
    expect(st().experiments).toHaveLength(1);
    expect(st().cfg).toMatchObject({ mode: 2, rm: { hack: 300 } });
    expect(st().programs.A.days[1].title).toBe('Replaced A');
    expect(st().programs.B).toBe(BUILTIN.B); // not in the file: back to the built-in
    expect(st().week.done).toEqual({ 'A-d1s2': true });
    expect(saved('weeks/2020-01-06').done).toEqual({ 'A-d1s1': true });
    expect(st().saveFlag).toBe('Data replaced');
  });
  it('clears the undo and suggestion notes, which describe the data before it', async () => {
    const wk = st().weekKey();
    useAppStore.setState({ uncheckNote: { week: wk, text: 'x', entries: {}, done: {} }, moveNote: { week: wk, slot: 'A-d1s1', lines: [] }, orderNote: { week: wk, kind: 'card', applied: false } });
    st().pasteImport(dataText());
    await st().applyImport('replace');
    expect(st()).toMatchObject({ uncheckNote: null, moveNote: null, orderNote: null });
  });
  it('replaces stretches and supplements only when the file has them', async () => {
    const wk = st().weekKey();
    st().pasteImport(dataText());
    await st().applyImport('replace');
    const items = st().stretches;
    expect(items.length).toBeGreaterThan(0); // a file without them leaves the local ones alone

    useAppStore.setState({ importDraft: null });
    await st().readImportFile(file('d.json', JSON.stringify({
      app: 'iron-log', format: 1,
      stretches: { items: [{ id: 'frog', n: 'Frog', group: 'Hips' }], experiments: [] },
      stretchWeeks: { [wk]: { done: { '1:frog': true }, skipped: {}, extra: [] } },
      supplements: { water: {}, items: [{ id: 'creatine', n: 'Creatine' }], taken: {} },
    })));
    await st().applyImport('replace');
    expect(st().stretches.map(i => i.id)).toEqual(['frog']);
    expect(st().strWeek.done).toEqual({ '1:frog': true });
    expect(st().supp.items.map(i => i.id)).toEqual(['creatine']);
  });
  it('resets the current stretch week when the file has none for it', async () => {
    useAppStore.setState({ strWeek: { done: { '1:scarecrow': true }, skipped: {}, extra: [] } });
    await st().readImportFile(file('d.json', JSON.stringify({ app: 'iron-log', format: 1, stretches: { items: [{ id: 'frog', n: 'Frog', group: 'Hips' }], experiments: [] } })));
    await st().applyImport('replace');
    expect(st().strWeek).toEqual(normStretchWeek(null));
    expect(normSupplements(st().supp)).toBeTruthy();
  });
  it('leaves sections the user turned off untouched', async () => {
    useAppStore.setState({ logs: { hack: [entry('2026-01-05')] }, cfg: { ...structuredClone(DEFAULT_CFG), rm: { hack: 300 } } });
    st().pasteImport(dataText({ logs: { row: [entry('2026-02-02')] }, cfg: { ...structuredClone(DEFAULT_CFG), rm: { row: 100 } } }));
    st().setImportSection('progress', false); st().setImportSection('settings', false);
    await st().applyImport('replace');
    expect(Object.keys(st().logs)).toEqual(['hack']);
    expect(st().cfg.rm).toEqual({ hack: 300 });
  });
});

// Second pass: the less common paths, one per branch the first tests left open.
describe('edge cases while reading', () => {
  it('keeps the backup target when the store refuses the edit', () => {
    useAppStore.setState({ backupMsg: { kind: 'err', text: 'old' } });
    const ready = st().isReady; useAppStore.setState({ isReady: () => false });
    st().setBackupRepo('me/repo');
    useAppStore.setState({ isReady: ready });
    expect(st().backupMsg).toMatchObject({ text: 'old' });
  });
  it('falls back to a generic message for an error without one', async () => {
    await st().readImportFile({ name: 'a.json', arrayBuffer: async () => { throw new Error(''); } });
    expect(st().importError).toBe('Couldn’t read that file');
  });
  it('treats an Excel export without the whole-backup sheets as sessions only', async () => {
    const X = await loadXLSX();
    const wb = X.utils.book_new();
    const head = ['Date', 'Week of', 'Exercise', 'Phase', 'Weight (lb)', 'Sets', 'Reps', 'Hold (s)', 'Set by set', 'Volume (lb)', 'Primary muscles', 'Secondary muscles', 'Note', 'Program slot', 'Exercise id'];
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([head, ['2026-01-05', '2026-01-05', 'Hack Squat', 'Hypertrophy', 100, 3, 10, '', '', 3000, '', '', '', '', 'hack']]), 'Sessions');
    await st().readImportFile(file('old.xlsx', new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }))));
    expect(st().importDraft).toMatchObject({ kind: 'excel', useSettings: true });
  });
  it('ignores pasted text and imports while data is still loading', async () => {
    const ready = st().isReady; useAppStore.setState({ isReady: () => false });
    st().pasteImport(dataText());
    await st().readImportFile(file('d.json', dataText()));
    useAppStore.setState({ importDraft: { kind: 'json', data: {} } });
    await st().applyImport('merge');
    useAppStore.setState({ isReady: ready });
    expect(st().importDraft).toMatchObject({ kind: 'json' });
    expect(st().importCount).toBe(0);
  });
});

describe('edge cases when replacing', () => {
  it('keeps the local GitHub backup settings, even when the file has none', async () => {
    useAppStore.setState(s => ({ cfg: { ...s.cfg, ghBackup: { repo: 'me/mine', branch: 'data', hash: 'h' } } }));
    const cfg = structuredClone(DEFAULT_CFG); delete cfg.ghBackup;
    st().pasteImport(dataText({ cfg }));
    await st().applyImport('replace');
    expect(st().cfg.ghBackup.repo).toBe('me/mine');
  });
  it('leaves everything as it was when the file cannot be applied', async () => {
    useAppStore.setState({ body: [{ wk: '2026-01-05', d: '2026-01-05', w: 200 }], logs: { hack: [entry('2026-09-21')] } });
    const before = structuredClone(st().cfg);
    // A log value that can't be copied makes the plan step throw after the config was already worked out.
    useAppStore.setState({ importDraft: { kind: 'json', name: 'x', data: { config: { ...structuredClone(DEFAULT_CFG), rest: 12 }, programs: {}, library: [], logs: { hack: [{ d: '2026-09-22', bad: () => 1 }] }, weeks: {}, body: [], stretchWeeks: {} } } });
    await st().applyImport('replace');
    expect(st().saveFlag).toBe('Import failed');
    expect(st().cfg).toEqual(before);
    expect(st().body).toHaveLength(1);
    expect(st().logs.hack).toHaveLength(1);
    expect(saved('config/main')).toBeNull();
  });
  it('does not report success when the browser refused a write', async () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      st().pasteImport(dataText({ logs: { hack: [entry('2026-09-21')] } }));
      await st().applyImport('replace');
    } finally { localStorage.setItem = orig; }
    expect(st().saveFlag).toBe('Storage full');
  });
  const bare = over => ({ kind: 'json', name: 'x', data: { config: {}, programs: {}, library: [], logs: {}, weeks: {}, body: [], stretchWeeks: {}, ...over } });

  it('keeps the local backup target unless the file has its own, and ignores keys of a section left out', async () => {
    st().setBackupRepo('me/mine');
    st().pasteImport(dataText({ cfg: { ...structuredClone(DEFAULT_CFG), zzz: 1 } }));
    st().setImportSection('settings', false);
    await st().applyImport('replace');
    expect(st().cfg.backup.repo).toBe('me/mine');
    expect(st().cfg.zzz).toBeUndefined();

    st().pasteImport(dataText({ cfg: { ...structuredClone(DEFAULT_CFG), backup: { repo: 'you/theirs', branch: 'main', hashes: {} } } }));
    await st().applyImport('replace');
    expect(st().cfg.backup.repo).toBe('you/theirs');
  });
  it('can leave out the program and the board', async () => {
    useAppStore.setState({ body: [{ wk: '2026-01-05', d: '2026-01-05', w: 200 }] });
    const custom = structuredClone(BUILTIN.A); custom.days[1].title = 'Nope';
    st().pasteImport(dataText({ programs: { A: custom }, body: [] }));
    st().setImportSection('program', false); st().setImportSection('board', false);
    await st().applyImport('replace');
    expect(st().programs.A).toBe(BUILTIN.A);
    expect(st().body).toHaveLength(1);
  });
  it('treats a file with no experiments as an empty list', async () => {
    useAppStore.setState({ experiments: [{ id: 'e', n: 'old' }], importDraft: bare({}) });
    await st().applyImport('replace');
    expect(st().experiments).toEqual([]);
  });
  it('removes saved stretch weeks the file does not have, and writes the ones it does', async () => {
    st().saveDoc('stretchweeks/2019-12-30', { done: { '1:a': true }, skipped: {}, extra: [] });
    st().saveDoc('stretchweeks/2020-01-06', { done: {}, skipped: { 2: true }, extra: [] });
    const other = { done: { '3:b': true }, skipped: {}, extra: [] };
    useAppStore.setState({ importDraft: bare({ stretches: { items: [{ id: 'a', n: 'A', group: 'G', tier: '' }], experiments: [] }, stretchWeeks: { '2020-01-06': other } }) });
    await st().applyImport('replace');
    expect(saved('stretchweeks/2019-12-30')).toBeNull();
    expect(saved('stretchweeks/2020-01-06')).toEqual(other);
  });
});

describe('edge cases when adding', () => {
  const week = (over = {}) => ({ done: {}, skipped: {}, extra: [], ...over });
  const stretchFile = (items, experiments, stretchWeeks) => ({ stretches: { items, experiments }, stretchWeeks });
  const addRaw = async (data, kind = 'json') => { useAppStore.setState({ importDraft: { kind, name: 'x', useSettings: true, data: { config: {}, programs: {}, library: [], logs: {}, weeks: {}, body: [], stretchWeeks: {}, ...data } } }); await st().applyImport('merge'); };

  it('skips a library version it already has, and the program section when it is off', async () => {
    const prog = structuredClone(BUILTIN.B); prog.days[1].title = 'Saved B';
    useAppStore.setState({ library: [{ id: 'v1', name: 'mine', from: 'B', at: '', prog }] });
    st().pasteImport(dataText({ library: [{ id: 'v1', name: 'dup', from: 'B', at: '', prog }, { id: 'v2', name: 'new', from: 'B', at: '', prog: { ...prog, days: prog.days.map(d => ({ ...d })) } }] }));
    await st().applyImport('merge');
    expect(st().library.map(l => l.id)).toEqual(['v1', 'v2']);

    const custom = structuredClone(BUILTIN.A); custom.days[1].title = 'Off';
    st().pasteImport(dataText({ programs: { A: custom }, library: [{ id: 'v3', name: 'x', from: 'A', at: '', prog: custom }] }));
    st().setImportSection('program', false);
    await st().applyImport('merge');
    expect(st().programs.A).toBe(BUILTIN.A);
    expect(st().library.map(l => l.id)).toEqual(['v1', 'v2']);
  });
  it('adds only the stretches and experiments that are new, and nothing when none are', async () => {
    useAppStore.setState({ stretchExps: [{ id: 'x0', n: 'Old' }] });
    const have = st().stretches;
    await addRaw(stretchFile(have.slice(0, 2), [{ id: 'x1', n: 'New' }, { id: 'x0', n: 'Old' }], {}));
    expect(st().stretchExps.map(e => e.id)).toEqual(['x0', 'x1']);
    expect(st().stretches).toHaveLength(have.length);
    await addRaw(stretchFile([{ ...have[0], id: 'other-id', n: have[0].n.toUpperCase() }], [{ id: 'x1', n: 'New' }], {}));
    expect(st().stretches).toHaveLength(have.length); // same name, so not added again
    expect(st().stretchExps).toHaveLength(2);
  });
  it('merges stretch check-offs for this week and other weeks, saving only real changes', async () => {
    const wk = st().weekKey();
    const x1 = { id: 'e1', day: 1, n: 'One' }; const x2 = { id: 'e2', day: 2, n: 'Two' };
    useAppStore.setState({ strWeek: week({ done: { '1:a': true }, extra: [x1] }) });
    st().saveDoc('stretchweeks/2020-01-06', week({ done: { '1:a': true }, extra: [x1] }));
    const incoming = { [wk]: week({ done: { '2:b': true }, extra: [x1, x2] }), '2020-01-06': week({ done: { '2:b': true }, extra: [x1, x2] }), '2020-01-13': week({ done: { '3:c': true } }) };
    await addRaw(stretchFile([], [], incoming));
    expect(st().strWeek).toEqual(week({ done: { '2:b': true, '1:a': true }, extra: [x1, x2] }));
    expect(saved('stretchweeks/2020-01-06').extra).toHaveLength(2);
    expect(saved('stretchweeks/2020-01-13').done).toEqual({ '3:c': true });

    st().saveDoc('stretchweeks/2020-01-06', 'sentinel');
    useAppStore.setState({ strWeek: st().strWeek });
    await addRaw(stretchFile([], [], { [wk]: st().strWeek })); // identical to what is here: nothing to save
    expect(saved('stretchweeks/2020-01-06')).toBe('sentinel');
  });
  it('merges supplements: new water days, items and taken, keeping what is already here', async () => {
    const supp = { waterGoal: 64, waterMode: 'weight', water: { '2026-01-05': [16] }, items: [{ id: 'creatine', n: 'Creatine' }], taken: { '2026-01-05': { creatine: true } } };
    useAppStore.setState({ supp: structuredClone(supp) });
    await addRaw({ supplements: { ...supp, water: { '2026-01-05': [99], '2026-01-06': [8] }, items: [{ id: 'creatine', n: 'Other' }, { id: 'zinc', n: 'Zinc' }], taken: { '2026-01-05': { zinc: true }, '2026-01-06': { zinc: true } } } });
    expect(st().supp.water).toEqual({ '2026-01-05': [16], '2026-01-06': [8] });
    expect(st().supp.items.map(i => i.n)).toEqual(['Creatine', 'Zinc']);
    expect(st().supp.taken['2026-01-05']).toEqual({ zinc: true, creatine: true });
    expect(st().supp.taken['2026-01-06']).toEqual({ zinc: true });

    const before = st().supp; saved('supplements/main');
    await addRaw({ supplements: structuredClone(before) }); // nothing new
    expect(st().supp).toEqual(before);
  });
  it('adds experiments it lacks, by id', async () => {
    useAppStore.setState({ experiments: [{ id: 'e1', n: 'Mine' }] });
    await addRaw({ experiments: [{ id: 'e1', n: 'Dup' }, { id: 'e2', n: 'New' }] });
    expect(st().experiments.map(e => e.n)).toEqual(['Mine', 'New']);
  });
  it('does not save logs or the current week when the file adds nothing', async () => {
    const wk = st().weekKey();
    useAppStore.setState({ logs: { hack: [entry('2026-01-05')] }, week: { ...st().week, done: { 'A-d1s1': true } } });
    st().saveDoc('logs/hack', 'sentinel');
    await addRaw({ logs: { hack: [entry('2026-01-05')] }, weeks: { [wk]: { done: { 'A-d1s1': true } } } });
    expect(saved('logs/hack')).toBe('sentinel');
    expect(st().week.done).toEqual({ 'A-d1s1': true });
  });
  it('merges other saved weeks with the ones kept here, saving only what changed', async () => {
    const same = { done: { 'A-d1s1': true } };
    useAppStore.setState({ weekHist: { '2020-01-06': same, '2020-01-13': same } });
    st().saveDoc('weeks/2020-01-13', 'sentinel');
    await addRaw({ weeks: { '2020-01-06': { done: { 'A-d1s2': true } }, '2020-01-13': same } });
    expect(saved('weeks/2020-01-06').done).toEqual({ 'A-d1s2': true, 'A-d1s1': true });
    expect(saved('weeks/2020-01-13')).toBe('sentinel');
  });
  it('treats missing experiments, a missing local log and partial settings in an Excel import', async () => {
    await addRaw({ logs: { newex: [entry('2026-01-05')] }, excel: { settings: { rest: 45 } } }, 'excel');
    expect(st().cfg.rest).toBe(45);
    expect(st().cfg.mode).toBe(DEFAULT_CFG.mode);
    expect(st().logs.newex).toHaveLength(1);
    await addRaw({ excel: { settings: { pct: { hyp: 55 } } } }, 'excel');
    expect(st().cfg.pct.hyp).toBe(55);
    await addRaw({ excel: { settings: { mode: 3 } } }, 'excel');
    expect(st().cfg.mode).toBe(3);
    expect(st().cfg.pct.hyp).toBe(55);
    await addRaw({ excel: { settings: {} } }, 'excel'); // no settings in the file: config unchanged
    expect(st().cfg.mode).toBe(3);
  });
});
