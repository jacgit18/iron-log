import { describe, expect, it } from 'vitest';
import { entryId } from '../lib/export.js';
import { normWeek } from '../shared/week.js';
import { parsePath, type PathKind } from './documents.js';
import { planCommands, planDelete } from './plan.js';
import { asRow, mirrorOf, withRow } from './testing.js';
import type { DesiredRow, Mirror, PlannedCommand } from './types.js';

const kind = (path: string) => parsePath(path) as PathKind;
const names = (cmds: PlannedCommand[]) => cmds.map(c => c.name);
const plan = (path: string, doc: unknown, mirror: Mirror = new Map()) => planCommands(kind(path), doc, mirror);

const entry = (id: string, over: object = {}) => ({ id, d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5, ...over });
const logRow = (e: ReturnType<typeof entry>, exerciseId = 'squat'): DesiredRow => ({ table: 'log_entries', key: e.id, exerciseId, entry: e as never });

describe('planCommands: log entries', () => {
  it('sends a create for each new entry: log-session for a session, tick-card for a check-off', () => {
    const cmds = plan('logs/squat', { entries: [entry('L1'), entry('L2', { auto: true, slot: 'A-d1s1', wk: '2026-10-04' })] });
    expect(names(cmds)).toEqual(['log-session', 'tick-card']);
    expect(cmds[0]).toMatchObject({ table: 'log_entries', rowKey: 'L1', clientId: 'L1', baseVersion: null, input: { exerciseId: 'squat', entry: { id: 'L1', d: '2026-10-05', w: 135 } } });
    expect(cmds[1]).toMatchObject({ clientId: 'L2', baseVersion: null });
  });

  it('plans nothing when the server already holds the same entries', () => {
    const m = mirrorOf([logRow(entry('L1')), logRow(entry('L2', { sets: [{ w: 135, r: 5 }] }))]);
    expect(plan('logs/squat', { entries: [entry('L1'), entry('L2', { sets: [{ w: 135, r: 5 }] })] }, m)).toEqual([]);
  });

  it('edits a changed entry with the version the phone saw', () => {
    const m = mirrorOf([logRow(entry('L1'))], { version: 4 });
    const cmds = plan('logs/squat', { entries: [entry('L1', { w: 140 })] }, m);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ name: 'log-session', baseVersion: 4, clientId: 'L1', input: { entry: { w: 140 } } });
  });

  it('deletes an entry the document no longer has, using the row version', () => {
    const m = mirrorOf([logRow(entry('L1')), logRow(entry('L2'))], { version: 3 });
    const cmds = plan('logs/squat', { entries: [entry('L2')] }, m);
    expect(cmds).toEqual([expect.objectContaining({ name: 'delete-entry', rowKey: 'L1', baseVersion: 3, input: { entryId: 'L1' } })]);
  });

  it('orders deletes, then edits, then creates', () => {
    const m = mirrorOf([logRow(entry('A')), logRow(entry('B')), logRow(entry('C'))]);
    const cmds = plan('logs/squat', { entries: [entry('B', { w: 100 }), entry('C'), entry('D')] }, m);
    expect(cmds.map(c => `${c.name}:${c.rowKey}`)).toEqual(['delete-entry:A', 'log-session:B', 'log-session:D']);
  });

  it('a hand-logged session replacing a check-off is a delete then a create', () => {
    const tick = entry('T', { auto: true, slot: 'A-d1s1', wk: '2026-10-04' });
    const m = mirrorOf([logRow(tick as never)]);
    const cmds = plan('logs/squat', { entries: [entry('H', { slot: 'A-d1s1', wk: '2026-10-04' })] }, m);
    expect(cmds.map(c => `${c.name}:${c.rowKey}`)).toEqual(['delete-entry:T', 'log-session:H']);
  });

  it('a redone check-off (new id) is a delete then a tick-card', () => {
    const old = entry('T1', { auto: true, slot: 'A-d1s1', wk: '2026-10-04', ph: 'strength' });
    const m = mirrorOf([logRow(old as never)]);
    const cmds = plan('logs/squat', { entries: [entry('T2', { auto: true, slot: 'A-d1s1', wk: '2026-10-04', ph: 'hyp' })] }, m);
    expect(cmds.map(c => `${c.name}:${c.rowKey}`)).toEqual(['delete-entry:T1', 'tick-card:T2']);
  });

  it('a check-off whose own content changed is replaced, not edited in place: delete, then restore at the version the delete leaves', () => {
    const m = mirrorOf([logRow(entry('T', { auto: true, slot: 'A-d1s1', wk: '2026-10-04' }) as never)], { version: 2 });
    const cmds = plan('logs/squat', { entries: [entry('T', { auto: true, slot: 'A-d1s1', wk: '2026-10-04', w: 150 })] }, m);
    expect(cmds.map(c => `${c.name}:${c.baseVersion}`)).toEqual(['delete-entry:2', 'tick-card:3']);
  });

  it('puts back an entry that was deleted (Undo) by naming the tombstone version', () => {
    const deleted = new Map([['log_entries|L1', asRow(logRow(entry('L1')), { deleted: true, version: 2 })]]);
    const cmds = plan('logs/squat', { entries: [entry('L1')] }, deleted);
    expect(cmds).toEqual([expect.objectContaining({ name: 'log-session', baseVersion: 2, rowKey: 'L1', clientId: 'L1' })]);
  });

  it('puts back an unticked check-off with tick-card and the tombstone version', () => {
    const tick = entry('T', { auto: true, slot: 'A-d1s1', wk: '2026-10-04' });
    const deleted = new Map([['log_entries|T', asRow(logRow(tick as never), { deleted: true, version: 4 })]]);
    expect(plan('logs/squat', { entries: [tick] }, deleted)).toEqual([expect.objectContaining({ name: 'tick-card', baseVersion: 4, rowKey: 'T' })]);
  });

  it('a deleted row in any other table is brought back by a create with no version', () => {
    const week = { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} };
    const gone = new Map([['weeks|2026-10-04', asRow({ table: 'weeks', key: '2026-10-04', week: normWeek(week) }, { deleted: true, version: 3 })]]);
    expect(plan('weeks/2026-10-04', week, gone)).toEqual([expect.objectContaining({ name: 'save-week', baseVersion: null })]);
  });

  it('does not delete an entry that is already deleted on the server', () => {
    const m = new Map([['log_entries|L1', asRow(logRow(entry('L1')), { deleted: true, version: 2 })]]);
    expect(plan('logs/squat', { entries: [] }, m)).toEqual([]);
  });

  it('gives an entry with no id the id the app derives from its content, so a retry is the same command', () => {
    const e = { d: '2026-10-01', ph: 'hyp', w: 95, s: 4, r: 12 };
    const [a] = plan('logs/squat', { entries: [e] });
    const [b] = plan('logs/squat', { entries: [{ ...e }] });
    expect(a!.clientId).toBe(entryId(e as never));
    expect(a).toEqual(b);
  });

  it('only touches its own exercise', () => {
    const m = mirrorOf([logRow(entry('B1'), 'bench')]);
    expect(plan('logs/squat', { entries: [] }, m)).toEqual([]);
  });

  describe('what the server stores differently', () => {
    it('ignores precision the database drops: weight to 4 places, reps and holds to 2', () => {
      const stored = logRow(entry('L1', { w: 135.1235, r: 8.33, sec: 30.25 }));
      const m = mirrorOf([stored]);
      expect(plan('logs/squat', { entries: [entry('L1', { w: 135.12349999, r: 8.3333, sec: 30.25 })] }, m)).toEqual([]);
    });

    it('ignores updatedAt, an empty note, a null phase and an unchecked flag', () => {
      const m = mirrorOf([logRow(entry('L1'))]);
      expect(plan('logs/squat', { entries: [entry('L1', { updatedAt: '2026-10-07T12:00:00.000Z', n: '', auto: undefined })] }, m)).toEqual([]);
    });

    it('still sees a real change in the note', () => {
      const m = mirrorOf([logRow(entry('L1'))]);
      expect(plan('logs/squat', { entries: [entry('L1', { n: 'new' })] }, m)).toHaveLength(1);
    });
  });
});

describe('planCommands: the other documents', () => {
  it('weeks: create, no-op, edit, and recreate after a delete', () => {
    const week = { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} };
    const [create] = plan('weeks/2026-10-04', week);
    expect(create).toMatchObject({ name: 'save-week', baseVersion: null, input: { weekStart: '2026-10-04', week: normWeek(week) } });
    const m = mirrorOf([{ table: 'weeks', key: '2026-10-04', week: normWeek(week) }], { version: 2 });
    expect(plan('weeks/2026-10-04', week, m)).toEqual([]);
    expect(plan('weeks/2026-10-04', { ...week, done: {} }, m)).toEqual([expect.objectContaining({ name: 'save-week', baseVersion: 2 })]);
    const gone = withRow(m, asRow({ table: 'weeks', key: '2026-10-04', week: normWeek(week) }, { deleted: true, version: 3 }));
    expect(plan('weeks/2026-10-04', week, gone)).toEqual([expect.objectContaining({ name: 'save-week', baseVersion: null })]);
  });

  it('stretch weeks and programs use their own commands', () => {
    expect(names(plan('stretchweeks/2026-10-04', { done: { '0:a': true }, skipped: {}, extra: [] }))).toEqual(['save-stretch-week']);
    const days = Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `A-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: 135 }] }] }));
    const [c] = plan('programs/A', { days });
    expect(c).toMatchObject({ name: 'save-program', input: { key: 'A' } });
    expect((c!.input as { program: { days: unknown[] } }).program.days).toHaveLength(7);
  });

  it('body weight: one row per week, an edit carries the version, a removal deletes by week', () => {
    const m = mirrorOf([{ table: 'body_entries', key: '2026-10-04', entry: { wk: '2026-10-04', d: '2026-10-07', w: 180.5 } }], { version: 2 });
    expect(plan('body/main', { entries: [{ wk: '2026-10-04', d: '2026-10-07', w: 180.5, updatedAt: '2026-10-07T12:00:00.000Z' }] }, m)).toEqual([]);
    expect(plan('body/main', { entries: [{ wk: '2026-10-04', d: '2026-10-08', w: 181 }] }, m)).toEqual([expect.objectContaining({ name: 'log-body-weight', baseVersion: 2, input: { wk: '2026-10-04', d: '2026-10-08', w: 181 } })]);
    expect(plan('body/main', { entries: [] }, m)).toEqual([expect.objectContaining({ name: 'delete-body-weight', baseVersion: 2, input: { wk: '2026-10-04' } })]);
  });

  it('library: save and delete by id', () => {
    const prog = { days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `N-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: 135 }] }] })) };
    const [c] = plan('library/main', { items: [{ id: 'v1', name: 'Cut', at: '2026-10-05T10:00:00Z', prog }] });
    expect(c).toMatchObject({ name: 'save-library-item', baseVersion: null, input: { item: { id: 'v1', name: 'Cut' } } });
    const m = mirrorOf([{ table: 'library_items', key: 'v1', item: (c!.input as { item: never }).item }], { version: 5 });
    expect(plan('library/main', { items: [] }, m)).toEqual([expect.objectContaining({ name: 'delete-library-item', baseVersion: 5, input: { id: 'v1' } })]);
  });

  describe('lists', () => {
    const item = (id: string) => ({ id, n: id.toUpperCase(), group: 'Other', tier: '' });
    const rows = (...ids: string[]): DesiredRow[] => ids.map((id, position) => ({ table: 'list_items', key: `stretch/${id}`, list: 'stretch', position, item: item(id) }));

    it('saves each new item with its position', () => {
      const cmds = plan('stretches/main', { items: [item('a'), item('b')], experiments: [] });
      expect(cmds.map(c => c.input)).toEqual([
        { list: 'stretch', item: item('a'), position: 0 },
        { list: 'stretch', item: item('b'), position: 1 },
      ]);
    });

    it('moving an item saves every item whose position changed, and no others', () => {
      const m = mirrorOf(rows('a', 'b', 'c', 'd'), { version: 2 });
      const cmds = plan('stretches/main', { items: [item('a'), item('c'), item('b'), item('d')], experiments: [] }, m);
      expect(cmds.map(c => `${c.rowKey}@${(c.input as { position: number }).position}:v${c.baseVersion}`)).toEqual(['stretch/b@2:v2', 'stretch/c@1:v2']);
    });

    it('removing an item deletes it by list and id, and the others shift position', () => {
      const m = mirrorOf(rows('a', 'b', 'c'), { version: 2 });
      const cmds = plan('stretches/main', { items: [item('a'), item('c')], experiments: [] }, m);
      expect(cmds.map(c => c.name)).toEqual(['delete-list-item', 'save-list-item']);
      expect(cmds[0]).toMatchObject({ baseVersion: 2, input: { list: 'stretch', id: 'b' } });
      expect(cmds[1]).toMatchObject({ rowKey: 'stretch/c', input: { position: 1 } });
    });

    it('stretches and their experiments are two lists of one document', () => {
      const cmds = plan('stretches/main', { items: [item('a')], experiments: [{ id: 'e1', n: 'Pigeon' }] });
      expect(cmds.map(c => (c.input as { list: string }).list).sort()).toEqual(['stretch', 'stretch_experiment']);
    });

    it('skips an item whose id is too long for the server instead of failing the whole document', () => {
      const cmds = plan('experiments/main', { items: [{ id: 'x'.repeat(101), ex: 'squat', ph: null, note: '' }, { id: 'x2', ex: 'bench', ph: null, note: '' }] });
      expect(cmds.map(c => c.rowKey)).toEqual(['experiment/x2']);
    });
  });

  describe('supplements and the shared config row', () => {
    const doc = (over: object = {}) => ({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, items: [], taken: {}, ...over });

    it('saves a day, a supplement and nothing for the default water goal', () => {
      const cmds = plan('supplements/main', doc({ water: { '2026-10-07': [16] }, items: [{ id: 'zinc', n: 'Zinc', slot: 'night' }] }));
      expect(cmds.map(c => c.name).sort()).toEqual(['save-list-item', 'save-supplement-day']);
    });

    it('a changed goal saves the config row with the other settings kept', () => {
      const m = mirrorOf([{ table: 'config', key: 'config', config: { mode: 2, rest: 90 } }], { version: 3 });
      const cmds = plan('supplements/main', doc({ waterGoal: 80 }), m);
      expect(cmds).toEqual([expect.objectContaining({ name: 'save-config', baseVersion: 3, input: { config: { mode: 2, rest: 90, waterGoal: 80 } } })]);
    });

    it('a day with nothing left is deleted', () => {
      const m = mirrorOf([{ table: 'supplement_days', key: '2026-10-07', day: '2026-10-07', record: { water: [16], boost: null, taken: {} } }], { version: 2 });
      expect(plan('supplements/main', doc(), m)).toEqual([expect.objectContaining({ name: 'delete-supplement-day', baseVersion: 2, input: { day: '2026-10-07' } })]);
    });

    it('never deletes the config row', () => {
      const m = mirrorOf([{ table: 'config', key: 'config', config: { waterGoal: 80 } }]);
      expect(plan('supplements/main', doc({ waterGoal: 64 }), m).map(c => c.name)).toEqual(['save-config']); // back to the default, still an edit
    });

    it('config/main keeps the server water settings and sends nothing when only those differ', () => {
      const m = mirrorOf([{ table: 'config', key: 'config', config: { mode: 2, waterGoal: 90 } }], { version: 2 });
      expect(plan('config/main', { mode: 2 }, m)).toEqual([]);
      expect(plan('config/main', { mode: 3 }, m)).toEqual([expect.objectContaining({ name: 'save-config', input: { config: { mode: 3, waterGoal: 90 } } })]);
    });

    it('config/main never sends the GitHub backup settings', () => {
      const [c] = plan('config/main', { mode: 1, backup: { repo: 'me/x', branch: 'main', hashes: {} }, ghBackup: { repo: 'me/y' } });
      expect((c!.input as { config: object }).config).toEqual({ mode: 1 });
    });
  });
});

describe('planDelete', () => {
  it('removing logs/<exercise> deletes each live entry', () => {
    const m = mirrorOf([logRow(entry('L1')), logRow(entry('L2')), logRow(entry('B1'), 'bench')], { version: 2 });
    expect(planDelete(kind('logs/squat'), m).map(c => `${c.name}:${c.rowKey}:${c.baseVersion}`)).toEqual(['delete-entry:L1:2', 'delete-entry:L2:2']);
  });

  it('removing a week or a program deletes its row', () => {
    const m = mirrorOf([{ table: 'weeks', key: '2026-10-04', week: normWeek(null) }, { table: 'programs', key: 'A', progKey: 'A', program: { days: [] } as never }], { version: 3 });
    expect(planDelete(kind('weeks/2026-10-04'), m)).toEqual([expect.objectContaining({ name: 'delete-week', baseVersion: 3 })]);
    expect(planDelete(kind('programs/A'), m)).toEqual([expect.objectContaining({ name: 'delete-program', baseVersion: 3, input: { key: 'A' } })]);
  });

  it('removing something the server does not have, or already deleted, plans nothing', () => {
    expect(planDelete(kind('weeks/2026-10-04'), new Map())).toEqual([]);
    const gone = new Map([['weeks|2026-10-04', asRow({ table: 'weeks', key: '2026-10-04', week: normWeek(null) }, { deleted: true })]]);
    expect(planDelete(kind('weeks/2026-10-04'), gone)).toEqual([]);
  });

  it('removing the config document resets it but keeps the water settings (there is no delete-config)', () => {
    const m = mirrorOf([{ table: 'config', key: 'config', config: { mode: 2, waterGoal: 90 } }], { version: 2 });
    expect(planDelete(kind('config/main'), m)).toEqual([expect.objectContaining({ name: 'save-config', baseVersion: 2, input: { config: { waterGoal: 90 } } })]);
  });
});

describe('clientIds', () => {
  it('are the same when the same command is planned again, and differ by version', () => {
    const m = mirrorOf([{ table: 'weeks', key: '2026-10-04', week: normWeek(null) }], { version: 2 });
    const a = plan('weeks/2026-10-04', { done: { x: true } }, m);
    const b = plan('weeks/2026-10-04', { done: { x: true } }, m);
    expect(a[0]!.clientId).toBe(b[0]!.clientId);
    expect(a[0]!.clientId.length).toBeLessThanOrEqual(100);
  });
});
