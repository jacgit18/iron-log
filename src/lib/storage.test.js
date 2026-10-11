import { describe, it, expect, vi } from 'vitest';
import { makeSaveQueue } from './storage.js';

describe('save queue', () => {
  it('a permanent error drops only the failed write; a newer one queued meanwhile is still saved', async () => {
    vi.useFakeTimers();
    const writes = []; let first = true;
    const db = { doc: () => ({ set: async body => { if (first) { first = false; throw { code: 'invalid_argument' }; } writes.push(body); } }) };
    const flags = []; const q = makeSaveQueue({ getDb: () => db, onFlag: f => flags.push(f) });
    q.save('weeks/x', { v: 1 });
    await Promise.resolve();
    q.save('weeks/x', { v: 2 }); // arrives during the retry wait
    await vi.runAllTimersAsync();
    expect(writes).toEqual([{ v: 2 }]);
    expect(flags).toContain('Could not save');
    vi.useRealTimers();
  });

  // ADR 031: the sync adapter's set() resolves with the document it holds, which may have another device's changes merged in.
  it('tells onStored the stored document once nothing more of the path is waiting', async () => {
    const db = { doc: () => ({ set: async body => ({ ...body, theirs: true }) }) };
    const stored = []; const q = makeSaveQueue({ getDb: () => db, onFlag: () => {}, onStored: (p, d) => stored.push([p, d]) });
    q.save('weeks/x', { v: 1 });
    await vi.waitFor(() => expect(stored).toEqual([['weeks/x', { v: 1, theirs: true }]]));
  });

  it('a write queued while the first was being merged is rebased onto the merge before it is sent', async () => {
    let release; const sent = [];
    const db = { doc: () => ({ set: body => { sent.push(body); return sent.length === 1 ? new Promise(r => { release = () => r({ ...body, b: true }); }) : Promise.resolve(body); } }) };
    const rebase = vi.fn((p, s, next, stored) => ({ ...next, ...stored, ...next }));
    const stored = []; const q = makeSaveQueue({ getDb: () => db, onFlag: () => {}, rebase, onStored: (p, d) => stored.push(d) });
    q.save('weeks/x', { a: true });
    await Promise.resolve();
    q.save('weeks/x', { a: true, c: true }); // made from the week before the merge
    release();
    await vi.waitFor(() => expect(stored).toHaveLength(1));
    expect(rebase).toHaveBeenCalledWith('weeks/x', { a: true }, { a: true, c: true }, { a: true, b: true });
    expect(sent[1]).toEqual({ a: true, b: true, c: true });
    expect(stored[0]).toEqual({ a: true, b: true, c: true });
  });

  it('a db whose set() resolves with nothing (local storage, Firestore) never calls either', async () => {
    const db = { doc: () => ({ set: async () => {} }) };
    const onStored = vi.fn(); const rebase = vi.fn(); const q = makeSaveQueue({ getDb: () => db, onFlag: () => {}, onStored, rebase });
    q.save('weeks/x', { v: 1 }); q.save('weeks/x', { v: 2 });
    await new Promise(r => setTimeout(r, 0));
    expect(onStored).not.toHaveBeenCalled();
    expect(rebase).not.toHaveBeenCalled();
  });
});
