import { describe, expect, it } from 'vitest';
import { PENDING_KEY, QUARANTINE_KEY, createOutbox, isDeleted } from './outbox.js';
import { memoryStorage } from './testing.js';

const at = () => new Date('2026-10-07T12:00:00.000Z');

describe('pending documents', () => {
  it('keeps the latest document for a path and survives a reload', () => {
    const storage = memoryStorage();
    const a = createOutbox(storage, at);
    a.put('logs/squat', { entries: [1] });
    a.put('logs/squat', { entries: [1, 2] });
    a.put('weeks/2026-10-04', { prog: 'A' });
    const b = createOutbox(storage, at);
    expect(b.paths().sort()).toEqual(['logs/squat', 'weeks/2026-10-04']);
    expect(b.get('logs/squat')).toEqual({ entries: [1, 2] });
  });

  it('a removal is kept as a marker', () => {
    const a = createOutbox(memoryStorage(), at);
    a.put('programs/A', { __delete: true });
    expect(isDeleted(a.get('programs/A'))).toBe(true);
    expect(isDeleted({ days: [] })).toBe(false);
    expect(isDeleted(null)).toBe(false);
  });

  it('done removes the document, but only if it is still the one that was sent', () => {
    const storage = memoryStorage();
    const a = createOutbox(storage, at);
    const first = { entries: [1] };
    a.put('logs/squat', first);
    const second = { entries: [1, 2] };
    a.put('logs/squat', second);
    a.done('logs/squat', first); // an older send finished: the newer write stays
    expect(a.has('logs/squat')).toBe(true);
    a.done('logs/squat', second);
    expect(a.has('logs/squat')).toBe(false);
    expect(createOutbox(storage, at).paths()).toEqual([]);
  });

  it('says so when the browser refuses the write, and still holds the document in memory', () => {
    const storage = memoryStorage(true);
    const a = createOutbox(storage, at);
    expect(a.put('logs/squat', { entries: [1] })).toBe(false);
    expect(a.persisted()).toBe(false);
    expect(a.get('logs/squat')).toEqual({ entries: [1] });
    storage.refuse = false;
    expect(a.put('logs/squat', { entries: [1, 2] })).toBe(true);
    expect(a.persisted()).toBe(true);
  });

  it('ignores a pending entry that is not an object', () => {
    const storage = memoryStorage();
    storage.data.set(PENDING_KEY, JSON.stringify([1, 2]));
    expect(createOutbox(storage, at).paths()).toEqual([]);
  });
});

describe('the quarantine', () => {
  it('moves a refused document out of pending, keeps it with the reason, and survives a reload', () => {
    const storage = memoryStorage();
    const a = createOutbox(storage, at);
    const doc = { entries: [{ d: 'nope' }] };
    a.put('logs/squat', doc);
    const entry = a.refuse('logs/squat', doc, 'the server would not take it: invalid-input');
    expect(entry).toMatchObject({ path: 'logs/squat', reason: 'the server would not take it: invalid-input', at: '2026-10-07T12:00:00.000Z', doc });
    expect(a.has('logs/squat')).toBe(false);
    const b = createOutbox(storage, at);
    expect(b.quarantined()).toEqual([entry]);
    expect(b.paths()).toEqual([]);
  });

  it('a newer write for the same path stays pending when an older one is refused', () => {
    const a = createOutbox(memoryStorage(), at);
    const old = { v: 1 };
    a.put('weeks/2026-10-04', old);
    a.put('weeks/2026-10-04', { v: 2 });
    a.refuse('weeks/2026-10-04', old, 'invalid');
    expect(a.get('weeks/2026-10-04')).toEqual({ v: 2 });
    expect(a.quarantined()).toHaveLength(1);
  });

  it('gives each entry its own id, and only the user discards one', () => {
    const storage = memoryStorage();
    const a = createOutbox(storage, at);
    const x = a.refuse('logs/a', { n: 1 }, 'r');
    const y = a.refuse('logs/b', { n: 2 }, 'r');
    expect(x.id).not.toBe(y.id);
    expect(a.discard(x.id)).toBe(true);
    expect(a.discard(x.id)).toBe(false);
    expect(a.quarantined().map(e => e.id)).toEqual([y.id]);
    expect(createOutbox(storage, at).quarantined().map(e => e.id)).toEqual([y.id]);
  });

  it('drops a damaged entry on load instead of crashing', () => {
    const storage = memoryStorage();
    storage.data.set(QUARANTINE_KEY, JSON.stringify([{ id: 'a', path: 'logs/x', doc: {}, reason: 'r', at: 't' }, { id: 1 }, null, 'x']));
    expect(createOutbox(storage, at).quarantined().map(e => e.id)).toEqual(['a']);
  });
});
