import { describe, expect, it } from 'vitest';
import { MIRROR_KEY, createMirrorStore } from './mirrorStore.js';
import { logServerRow, memoryStorage, serverRow } from './testing.js';

describe('the mirror store', () => {
  it('starts empty with the cursor at the beginning', () => {
    const s = createMirrorStore(memoryStorage());
    expect(s.rows().size).toBe(0);
    expect(s.cursor()).toBe('0');
    expect(s.recovered()).toBe(false);
  });

  it('keeps what was applied across a reload', () => {
    const storage = memoryStorage();
    const a = createMirrorStore(storage);
    a.applyPage({ log_entries: [logServerRow('L1', { seq: '3' })], weeks: [serverRow({ week_start: '2026-10-04', data: { prog: 'A', done: { x: true } } }, { seq: '4' })] }, '4');
    const b = createMirrorStore(storage);
    expect(b.cursor()).toBe('4');
    expect([...b.rows().keys()].sort()).toEqual(['log_entries|L1', 'weeks|2026-10-04']);
    expect(b.rows().get('log_entries|L1')).toEqual(a.rows().get('log_entries|L1'));
    expect(b.recovered()).toBe(false);
  });

  it('applyPage moves the cursor and the rows together, in one write', () => {
    const storage = memoryStorage();
    const writes: unknown[] = [];
    const counting = { ...storage, get: storage.get, remove: storage.remove, set: (k: string, v: unknown) => { writes.push(v); return storage.set(k, v); } };
    createMirrorStore(counting).applyPage({ log_entries: [logServerRow('L1'), logServerRow('L2')] }, '9');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ cursor: '9' });
  });

  it('apply (a command answer) takes rows without moving the pull cursor', () => {
    const s = createMirrorStore(memoryStorage());
    s.applyPage({}, '5');
    s.apply('log_entries', [logServerRow('L1', { seq: '8' })]);
    expect(s.cursor()).toBe('5');
    expect(s.rows().size).toBe(1);
  });

  describe('what changed', () => {
    it('reports the rows that are new or at a new version, and the paths to refresh', () => {
      const s = createMirrorStore(memoryStorage());
      const first = s.apply('log_entries', [logServerRow('L1')]);
      expect(first.changed.map(r => r.key)).toEqual(['L1']);
      expect(first.paths).toEqual(['logs/squat']);
      const same = s.apply('log_entries', [logServerRow('L1')]);
      expect(same).toEqual({ changed: [], paths: [] });
      const edited = s.apply('log_entries', [logServerRow('L1', { version: 2 }, { weight_lb: '140.0000' })]);
      expect(edited.changed).toHaveLength(1);
    });

    it('a tombstone counts as a change, and so does the row coming back', () => {
      const s = createMirrorStore(memoryStorage());
      s.apply('log_entries', [logServerRow('L1')]);
      expect(s.apply('log_entries', [logServerRow('L1', { version: 2, deleted_at: '2026-10-07T13:00:00.000Z' })]).paths).toEqual(['logs/squat']);
      expect(s.apply('log_entries', [logServerRow('L1', { version: 3 })]).changed[0]).toMatchObject({ deleted: false, version: 3 });
    });

    it('an older version arriving late changes nothing', () => {
      const s = createMirrorStore(memoryStorage());
      s.apply('log_entries', [logServerRow('L1', { version: 3 })]);
      expect(s.apply('log_entries', [logServerRow('L1', { version: 2 })]).changed).toEqual([]);
      expect(s.rows().get('log_entries|L1')).toMatchObject({ version: 3 });
    });

    it('a config row names both documents it feeds', () => {
      const s = createMirrorStore(memoryStorage());
      expect(s.apply('config', [serverRow({ data: { mode: 1 } })]).paths.sort()).toEqual(['config/main', 'supplements/main']);
    });
  });

  it('hands out a snapshot that later changes do not alter', () => {
    const s = createMirrorStore(memoryStorage());
    s.apply('log_entries', [logServerRow('L1')]);
    const snap = s.rows();
    s.apply('log_entries', [logServerRow('L2')]);
    expect(snap.size).toBe(1);
    expect(s.rows().size).toBe(2);
  });

  describe('a copy that cannot be trusted', () => {
    it.each([
      ['not JSON', 'not json at all'],
      ['another format', { v: 2, cursor: '5', rows: [] }],
      ['no cursor', { v: 1, rows: [] }],
      ['a cursor that is not a number', { v: 1, cursor: 'abc', rows: [] }],
      ['rows that are not a list', { v: 1, cursor: '5', rows: {} }],
    ])('%s: starts empty and pulls everything again', (_name, value) => {
      const storage = memoryStorage();
      storage.data.set(MIRROR_KEY, typeof value === 'string' ? value : JSON.stringify(value));
      const s = createMirrorStore({ get: k => { try { return storage.get(k); } catch { return 'garbage'; } }, set: (k, v) => storage.set(k, v), remove: k => storage.remove(k) });
      expect(s.rows().size).toBe(0);
      expect(s.cursor()).toBe('0');
      expect(s.recovered()).toBe(true);
    });

    it('drops a damaged row, keeps the rest, and goes back to the start so the dropped row comes again', () => {
      const storage = memoryStorage();
      const good = createMirrorStore(storage);
      good.applyPage({ log_entries: [logServerRow('L1')] }, '7');
      const saved = storage.get(MIRROR_KEY) as { rows: unknown[] };
      saved.rows.push({ table: 'log_entries', key: 'broken' }, { table: 'nonsense', key: 'x', version: 1, deleted: false, seq: '1' }, null);
      storage.set(MIRROR_KEY, saved);
      const s = createMirrorStore(storage);
      expect([...s.rows().keys()]).toEqual(['log_entries|L1']);
      expect(s.cursor()).toBe('0');
      expect(s.recovered()).toBe(true);
    });
  });

  it('says so when the browser refuses the write, and keeps working in memory', () => {
    const storage = memoryStorage(true);
    const s = createMirrorStore(storage);
    s.apply('log_entries', [logServerRow('L1')]);
    expect(s.persisted()).toBe(false);
    expect(s.rows().size).toBe(1);
    storage.refuse = false;
    s.apply('log_entries', [logServerRow('L2')]);
    expect(s.persisted()).toBe(true);
    expect(createMirrorStore(storage).rows().size).toBe(2);
  });

  it('knows whether a pull has ever finished, and keeps that across a reload', () => {
    const storage = memoryStorage();
    const a = createMirrorStore(storage);
    expect(a.hasPulled()).toBe(false);
    a.apply('log_entries', [logServerRow('L1')]); // a command's answer is not a pull
    expect(a.hasPulled()).toBe(false);
    a.applyPage({}, '0'); // an empty account's first pull still counts
    expect(a.hasPulled()).toBe(true);
    expect(createMirrorStore(storage).hasPulled()).toBe(true);
  });

  it('a copy that had to be repaired has not pulled', () => {
    const storage = memoryStorage();
    createMirrorStore(storage).applyPage({ log_entries: [logServerRow('L1')] }, '7');
    const saved = storage.get(MIRROR_KEY) as { rows: unknown[] };
    saved.rows.push({ table: 'log_entries', key: 'broken' });
    storage.set(MIRROR_KEY, saved);
    expect(createMirrorStore(storage).hasPulled()).toBe(false);
  });

  it('clear forgets everything, in memory and in storage', () => {
    const storage = memoryStorage();
    const s = createMirrorStore(storage);
    s.applyPage({ log_entries: [logServerRow('L1')] }, '4');
    s.clear();
    expect(s.hasPulled()).toBe(false);
    expect(s.rows().size).toBe(0);
    expect(s.cursor()).toBe('0');
    expect(storage.data.has(MIRROR_KEY)).toBe(false);
    expect(createMirrorStore(storage).cursor()).toBe('0');
  });
});
