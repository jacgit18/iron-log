import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeSaveQueue, removeLegacyGitHubToken, LEGACY_GH_TOKEN_KEY } from './storage.js';

describe('removeLegacyGitHubToken', () => {
  const stub = (mem, removeItem) => vi.stubGlobal('localStorage', { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: removeItem || (k => { delete mem[k]; }) });
  afterEach(() => vi.unstubAllGlobals());
  it('deletes the old GitHub token and leaves other keys', () => {
    const mem = { [LEGACY_GH_TOKEN_KEY]: 'ghp_secret', 'ironlog:config/main': '{}' }; stub(mem);
    removeLegacyGitHubToken();
    expect(mem).toEqual({ 'ironlog:config/main': '{}' });
    expect(LEGACY_GH_TOKEN_KEY).toBe('ironlog-gh-token');
  });
  it('does not throw when storage is blocked', () => {
    stub({}, () => { throw new Error('blocked'); });
    expect(() => removeLegacyGitHubToken()).not.toThrow();
  });
});

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

  // Offline with the sync adapter on, a write is kept by the adapter's outbox (apiDb.test.ts). This is the plain queue's own promise:
  // a database that fails with a network error keeps the write, and it is sent when the network comes back, newest value only.
  it('keeps writes while the database is unreachable and sends them, in order and once each, when it comes back', async () => {
    vi.useFakeTimers();
    let online = false; const writes = [];
    const db = { doc: path => ({ set: async body => { if (!online) throw new TypeError('Failed to fetch'); writes.push([path, body]); } }) };
    const flags = []; const q = makeSaveQueue({ getDb: () => db, onFlag: f => flags.push(f) });
    q.save('weeks/a', { v: 1 }); q.save('logs/x', { v: 1 });
    await vi.advanceTimersByTimeAsync(5000); // several failed tries while offline
    expect(writes).toEqual([]);
    expect(q.pending('weeks/a')).toBe(true); expect(q.pending('logs/x')).toBe(true);
    q.save('weeks/a', { v: 2 }); // edited again while offline: only the latest is kept
    online = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(writes).toEqual([['weeks/a', { v: 2 }], ['logs/x', { v: 1 }]]);
    expect(q.pending('weeks/a')).toBe(false); expect(q.pending('logs/x')).toBe(false);
    expect(flags).toContain('Not saved, retrying…'); expect(flags.at(-1)).toBe('Saved');
    vi.useRealTimers();
  });

  it('a network failure never drops a write however long it lasts', async () => {
    vi.useFakeTimers();
    let online = false; const writes = [];
    const db = { doc: () => ({ set: async body => { if (!online) throw new TypeError('Failed to fetch'); writes.push(body); } }) };
    const q = makeSaveQueue({ getDb: () => db, onFlag: () => {}, onFailed: () => { throw new Error('must not be marked failed'); } });
    q.save('weeks/a', { v: 1 });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(q.failedPaths()).toEqual([]);
    online = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(writes).toEqual([{ v: 1 }]);
    vi.useRealTimers();
  });
});
