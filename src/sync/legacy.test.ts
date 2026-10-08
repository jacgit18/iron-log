import { describe, expect, it } from 'vitest';
import { dataFileDocs, describeLegacy, legacyDocs, planLegacy } from './legacy.js';

const e = (over: object = {}) => ({ d: '2026-09-28', ph: 'strength', w: 100, s: 3, r: 8, ...over });
const logs = (...entries: object[]) => ({ schema: 1, entries });
const program = { days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `A-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: 135 }] }] })) };
const ids = (docs: Map<string, unknown>) => planLegacy(docs).commands.filter(c => c.table === 'log_entries').map(c => c.clientId);

describe('legacyDocs', () => {
  it('takes only the documents the sync knows, from the browser\'s keys', () => {
    const store: Record<string, unknown> = { 'logs/squat': logs(e()), 'weeks/2026-10-04': { prog: 'A' }, appearance: { theme: 'dark' }, hidetip: 1, 'sync/mirror': { v: 1 }, 'logs/empty': null };
    const docs = legacyDocs(Object.keys(store), p => store[p]);
    expect([...docs.keys()]).toEqual(['logs/squat', 'weeks/2026-10-04']);
  });
});

describe('planLegacy', () => {
  it('turns every kind of document into creates, each with no base version', () => {
    const docs = new Map<string, unknown>([
      ['logs/squat', logs(e({ id: 'u1' }), e({ d: '2026-09-29' }))],
      ['body/main', { entries: [{ wk: '2026-09-27', d: '2026-09-28', w: 180 }] }],
      ['weeks/2026-09-27', { prog: 'A', done: {}, skipped: {}, moved: {}, ph: {}, warm: {} }],
      ['programs/A', program],
      ['config/main', { mode: 2 }],
    ]);
    const plan = planLegacy(docs);
    expect(plan.commands.every(c => c.baseVersion === null)).toBe(true);
    expect(plan.commands.map(c => c.name).sort()).toEqual(['log-body-weight', 'log-session', 'log-session', 'save-config', 'save-program', 'save-week']);
    expect(plan.summary).toMatchObject({ entries: 2, checkOffs: 0, bodyWeights: 1, weeks: 1, programs: 1, config: 1 });
    expect(plan.commands.find(c => c.name === 'log-session' && c.clientId === 'u1')).toBeTruthy();
  });

  it('keeps the id an entry had, and gives an old one the hash it always had', () => {
    const [a, b] = ids(new Map([['logs/squat', logs(e({ id: 'mine' }), e({ d: '2026-09-30' }))]]));
    expect(a).toBe('mine');
    expect(b).toMatch(/^k[0-9a-z]+$/);
  });

  it('two exercises with identical old entries both survive: the later one is renamed, the same way every time', () => {
    const docs = new Map<string, unknown>([['logs/kneeraise', logs(e())], ['logs/dip', logs(e())]]);
    const first = planLegacy(docs);
    expect(first.renamed).toBe(1);
    const got = first.commands.map(c => [(c.input as { exerciseId: string }).exerciseId, c.clientId]);
    expect(got[0]![1]).toMatch(/^k[0-9a-z]+$/); // dip, first in path order, keeps the plain hash
    expect(got[1]).toEqual(['kneeraise', `${got[0]![1]}-2`]);
    expect(planLegacy(docs).commands.map(c => c.clientId)).toEqual(first.commands.map(c => c.clientId));
    expect(new Set(first.commands.map(c => c.clientId)).size).toBe(2);
  });

  it('a third identical entry becomes -3', () => {
    const docs = new Map<string, unknown>([['logs/a', logs(e())], ['logs/b', logs(e())], ['logs/c', logs(e())]]);
    const out = ids(docs);
    expect(out[1]).toBe(`${out[0]}-2`);
    expect(out[2]).toBe(`${out[0]}-3`);
  });

  it('leaves out a check-off that a session logged by hand already replaces, and a second check-off for the same card and week', () => {
    const card = { slot: 'A-d1s1', wk: '2026-09-27' };
    const docs = new Map<string, unknown>([
      ['logs/squat', logs(e({ id: 'hand', ...card }), e({ id: 'tick', ...card, auto: true }))],
      ['logs/bench', logs(e({ id: 't1', slot: 'A-d2s1', wk: '2026-09-27', auto: true }), e({ id: 't2', slot: 'A-d2s1', wk: '2026-09-27', auto: true, d: '2026-09-29' }))],
    ]);
    const plan = planLegacy(docs);
    expect(plan.skipped).toBe(2);
    expect(plan.commands.map(c => c.clientId).sort()).toEqual(['hand', 't1']);
    expect(plan.summary).toMatchObject({ entries: 1, checkOffs: 1 });
  });

  it('the same card and week on different exercises are different cards', () => {
    const card = { slot: 'A-d1s1', wk: '2026-09-27', auto: true };
    const docs = new Map<string, unknown>([['logs/squat', logs(e({ id: 'a', ...card }))], ['logs/bench', logs(e({ id: 'b', ...card }))]]);
    expect(planLegacy(docs).skipped).toBe(0);
  });

  it('never carries the GitHub backup settings, which may hold a token', () => {
    const plan = planLegacy(new Map([['config/main', { mode: 2, ghBackup: { repo: 'x/y', token: 'ghp_secret' }, backup: { token: 'secret' } }]]));
    expect(JSON.stringify(plan.commands)).not.toMatch(/ghp_secret|secret|ghBackup/);
    expect(plan.summary.config).toBe(1);
  });

  it('water goal and mode, which live in the config row, survive both documents being uploaded', () => {
    const docs = new Map<string, unknown>([['supplements/main', { waterGoal: 120, waterMode: 'fixed', water: {}, boost: {}, taken: {}, items: [] }], ['config/main', { mode: 2 }]]);
    const configs = planLegacy(docs).commands.filter(c => c.name === 'save-config');
    expect(configs).toHaveLength(1);
    expect(configs[0]!.input).toMatchObject({ config: { mode: 2, waterGoal: 120, waterMode: 'fixed' } });
  });

  it('nothing to upload is an empty plan', () => {
    expect(planLegacy(new Map()).commands).toEqual([]);
  });
});

describe('describeLegacy', () => {
  it('says what is in it, singular and plural', () => {
    expect(describeLegacy({ entries: 34, checkOffs: 19, bodyWeights: 1, weeks: 2, stretchWeeks: 0, supplementDays: 0, programs: 2, library: 0, lists: 4, config: 1 })).toBe('34 logged sessions, 19 check-offs, 1 body weight, 2 weeks, 2 programs');
    expect(describeLegacy({ entries: 0, checkOffs: 0, bodyWeights: 0, weeks: 0, stretchWeeks: 0, supplementDays: 0, programs: 0, library: 0, lists: 2, config: 1 })).toBe('your settings and lists');
  });
});

describe('dataFileDocs', () => {
  const file = JSON.stringify({
    app: 'iron-log', format: 1, exportedAt: '2026-10-07T15:20:41.590Z',
    config: { mode: 2, ghBackup: { repo: 'a/b', token: 'ghp_secret' } },
    programs: { A: program },
    library: [],
    logs: { dip: [e()], kneeraise: [e()], squat: [e({ id: 'mine', d: '2026-09-29' })] },
    weeks: { '2026-09-27': { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} } },
    body: [{ wk: '2026-09-27', d: '2026-09-28', w: 180.5 }],
    experiments: [],
    stretches: { items: [{ id: 'sc', n: 'Scarecrow', group: 'Bands', tier: 'primary' }], experiments: [] },
    stretchWeeks: {},
    supplements: { waterGoal: 80, waterMode: 'fixed', water: { '2026-09-28': [16] }, boost: {}, items: [], taken: {} },
  });

  it('plans an export file the same way as an old browser, with the colliding entries kept apart', async () => {
    const { parseDataFile } = await import('../lib/export.js');
    const plan = planLegacy(dataFileDocs(parseDataFile(file)));
    expect(plan.summary).toMatchObject({ entries: 3, bodyWeights: 1, weeks: 1, programs: 1, supplementDays: 1, config: 1 });
    expect(plan.renamed).toBe(1);
    expect(plan.commands.every(c => c.baseVersion === null)).toBe(true);
    expect(JSON.stringify(plan.commands)).not.toMatch(/ghp_secret|ghBackup/);
    expect(new Set(plan.commands.filter(c => c.table === 'log_entries').map(c => c.clientId)).size).toBe(3);
  });

  it('an empty file plans nothing', async () => {
    const { parseDataFile } = await import('../lib/export.js');
    const empty = JSON.stringify({ app: 'iron-log', format: 1, config: {}, programs: {}, library: [], logs: {}, weeks: {}, body: [], experiments: [] });
    expect(planLegacy(dataFileDocs(parseDataFile(empty))).commands).toEqual([]);
  });
});
