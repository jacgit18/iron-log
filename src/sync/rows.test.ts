import { describe, expect, it } from 'vitest';
import { applyRows, fromServerRow, idOfRow } from './rows.js';
import type { ServerRow } from './types.js';

// Rows as the API sends them: the shapes the server tests assert, with numbers as strings and nulls for what is absent.
const base = { id: '7', user_id: '1', version: 1, seq: '12', deleted_at: null, created_at: '2026-10-07T12:00:00.000Z', updated_at: '2026-10-07T12:00:00.000Z', client_updated_at: null, schema_version: 1 };
const row = (fields: object, over: Partial<ServerRow> = {}): ServerRow => ({ ...base, ...fields, ...over }) as ServerRow;

describe('fromServerRow', () => {
  it('log entry: numbers parsed, nulls left out, the id is the client id, the check-off flag only when set', () => {
    const r = fromServerRow('log_entries', row({
      client_id: 'L1', exercise_id: 'squat', d: '2026-10-05', phase: 'strength', weight_lb: '135.5000', sets_count: 3, reps: '5.00', hold_sec: null,
      sets: [{ w: 135.5, r: 5 }], note: 'felt heavy', slot: 'A-d1s1', wk: '2026-10-04', auto: false, client_updated_at: '2026-10-05T12:00:00.000Z',
    }));
    expect(r).toEqual({
      table: 'log_entries', key: 'L1', exerciseId: 'squat', version: 1, deleted: false, seq: '12',
      entry: { d: '2026-10-05', ph: 'strength', w: 135.5, s: 3, r: 5, sets: [{ w: 135.5, r: 5 }], n: 'felt heavy', slot: 'A-d1s1', wk: '2026-10-04', id: 'L1', updatedAt: '2026-10-05T12:00:00.000Z' },
    });
  });

  it('log entry: a check-off, a hold, and almost everything null', () => {
    const r = fromServerRow('log_entries', row({ client_id: 'T1', exercise_id: 'plank', d: '2026-10-06', phase: 'iso', weight_lb: null, sets_count: 3, reps: null, hold_sec: '30.00', sets: null, note: null, slot: 'A-d2s1', wk: '2026-10-04', auto: true }));
    expect(r.table === 'log_entries' && r.entry).toEqual({ d: '2026-10-06', ph: 'iso', s: 3, sec: 30, slot: 'A-d2s1', wk: '2026-10-04', id: 'T1', auto: true });
  });

  it('a tombstone is a deleted row with its version', () => {
    const r = fromServerRow('log_entries', row({ client_id: 'L1', exercise_id: 'squat', d: '2026-10-05', auto: false }, { version: 3, deleted_at: '2026-10-07T13:00:00.000Z' }));
    expect(r).toMatchObject({ deleted: true, version: 3 });
  });

  it('body weight keyed by week', () => {
    expect(fromServerRow('body_entries', row({ wk: '2026-10-04', d: '2026-10-07', weight_lb: '180.5000' }))).toMatchObject({ table: 'body_entries', key: '2026-10-04', entry: { wk: '2026-10-04', d: '2026-10-07', w: 180.5 } });
  });

  it('weeks and stretch weeks are cleaned into the app shape', () => {
    const w = fromServerRow('weeks', row({ week_start: '2026-10-04', data: { prog: 'A', done: { 'A-d1s1:0': true } } }));
    expect(w).toMatchObject({ key: '2026-10-04', week: { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} } });
    const sw = fromServerRow('stretch_weeks', row({ week_start: '2026-10-04', data: { done: { '0:a': true } } }));
    expect(sw).toMatchObject({ key: '2026-10-04', week: { done: { '0:a': true }, skipped: {}, extra: [] } });
  });

  it('a supplements day', () => {
    expect(fromServerRow('supplement_days', row({ day: '2026-10-07', water: [16, 8], boost: { hot: true, mins: 45 }, taken: { creatine: true } })))
      .toMatchObject({ table: 'supplement_days', key: '2026-10-07', day: '2026-10-07', record: { water: [16, 8], boost: { hot: true, mins: 45 }, taken: { creatine: true } } });
    expect(fromServerRow('supplement_days', row({ day: '2026-10-08', water: [], boost: null, taken: {} }))).toMatchObject({ record: { water: [], boost: null, taken: {} } });
  });

  it('programs, config and library items', () => {
    expect(fromServerRow('programs', row({ key: 'B', data: { days: [] } }))).toMatchObject({ table: 'programs', key: 'B', progKey: 'B' });
    expect(fromServerRow('config', row({ data: { mode: 2, waterGoal: 80 } }))).toMatchObject({ table: 'config', key: 'config', config: { mode: 2, waterGoal: 80 } });
    expect(fromServerRow('library_items', row({ client_id: 'v1', data: { id: 'v1', name: 'Cut', at: '2026-10-05T10:00:00Z', prog: { days: [] } } }))).toMatchObject({ table: 'library_items', key: 'v1' });
  });

  it('list items are keyed by list and id, with their position', () => {
    expect(fromServerRow('list_items', row({ list: 'stretch', client_id: 's1', position: 2, data: { id: 's1', n: 'Scarecrow', group: 'Bands', tier: 'primary' } })))
      .toMatchObject({ table: 'list_items', key: 'stretch/s1', list: 'stretch', position: 2, item: { id: 's1', n: 'Scarecrow', tier: 'primary' } });
    expect(fromServerRow('list_items', row({ list: 'supplement_item', client_id: 'creatine', position: 0, data: { id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' } })))
      .toMatchObject({ key: 'supplement_item/creatine', item: { id: 'creatine', slot: 'morning', dose: '5 g' } });
  });
});

describe('applyRows', () => {
  const log = (version: number, w: string, over: object = {}) => row({ client_id: 'L1', exercise_id: 'squat', d: '2026-10-05', weight_lb: w, auto: false, ...over }, { version });

  it('adds new rows and does not change the mirror it was given', () => {
    const empty = new Map();
    const next = applyRows(empty, 'log_entries', [log(1, '135.0000')]);
    expect(empty.size).toBe(0);
    expect(next.get('log_entries|L1')).toMatchObject({ version: 1 });
  });

  it('keeps the newest version of a row, whatever order they arrive in', () => {
    const a = applyRows(new Map(), 'log_entries', [log(2, '140.0000'), log(1, '135.0000')]);
    expect(a.get('log_entries|L1')).toMatchObject({ version: 2, entry: { w: 140 } });
    const b = applyRows(a, 'log_entries', [log(1, '100.0000')]);
    expect(b.get('log_entries|L1')).toMatchObject({ version: 2 });
  });

  it('applies a tombstone, and a later revive', () => {
    const gone = applyRows(new Map(), 'log_entries', [log(1, '135.0000'), log(2, '135.0000', { deleted_at: '2026-10-07T13:00:00.000Z' })]);
    expect(gone.get('log_entries|L1')).toMatchObject({ deleted: true, version: 2 });
    const back = applyRows(gone, 'log_entries', [log(3, '135.0000')]);
    expect(back.get('log_entries|L1')).toMatchObject({ deleted: false, version: 3 });
  });

  it('idOfRow names the row in the mirror', () => {
    expect(idOfRow({ table: 'list_items', key: 'stretch/s1' })).toBe('list_items|stretch/s1');
  });
});
