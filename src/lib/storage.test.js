import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { DAMAGED_PREFIX, LS, makeSaveQueue, onDamaged, removeLegacyGitHubToken, LEGACY_GH_TOKEN_KEY } from './storage.js';

// EH-07: a saved value that no longer parses used to read as "nothing saved", and the next save wrote over it.
describe('LS: damaged saved data', () => {
  const stub = (mem, over = {}) => vi.stubGlobal('localStorage', {
    getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; },
    get length() { return Object.keys(mem).length; }, key: i => Object.keys(mem)[i] ?? null, ...over,
  });
  let told; let stop;
  beforeEach(() => { told = []; stop = onDamaged(k => told.push(k)); });
  afterEach(() => { stop(); vi.unstubAllGlobals(); });

  it('reads as nothing, but keeps the damaged text under its own key and says so', () => {
    const mem = { 'ironlog:logs/squat': '{"entries":[{"d":"2026-10' }; stub(mem);
    expect(LS.get('logs/squat')).toBe(null);
    expect(mem[DAMAGED_PREFIX + 'logs/squat']).toBe('{"entries":[{"d":"2026-10');
    expect(told).toEqual(['logs/squat']);
  });

  it('the kept copy is outside the app\'s own keys, so nothing that lists them picks it up', () => {
    expect(DAMAGED_PREFIX.startsWith('ironlog:')).toBe(false);
  });

  it('tells each damaged key once, however often it is read or saved over', () => {
    const mem = { 'ironlog:appearance': '{', 'ironlog:other': '[' }; stub(mem, { setItem: (k, v) => { if (k.startsWith('ironlog:')) throw new Error('full'); mem[k] = v; } });
    LS.get('appearance'); LS.get('appearance'); LS.set('appearance', {}); LS.get('appearance');
    LS.get('other');
    expect(told).toEqual(['appearance', 'other']);
  });

  it('a save over a damaged value keeps the damaged text first', () => {
    const mem = { 'ironlog:config/main': 'not json' }; stub(mem);
    expect(LS.set('config/main', { a: 1 })).toBe(true);
    expect(mem['ironlog:config/main']).toBe('{"a":1}');
    expect(mem[DAMAGED_PREFIX + 'config/main']).toBe('not json');
    expect(told).toEqual(['config/main']);
  });

  it('keeps the first damaged copy: a later one does not replace it', () => {
    const mem = { 'ironlog:x': 'first', [DAMAGED_PREFIX + 'x']: 'older' }; stub(mem);
    LS.get('x');
    expect(mem[DAMAGED_PREFIX + 'x']).toBe('older');
    expect(told).toEqual(['x']);
  });

  it('a missing value or a good one is not damaged', () => {
    const mem = { 'ironlog:a': '{"v":1}', 'ironlog:n': 'null' }; stub(mem);
    expect(LS.get('missing')).toBe(null);
    expect(LS.get('a')).toEqual({ v: 1 });
    expect(LS.get('n')).toBe(null);
    LS.set('a', { v: 2 }); LS.set('missing', 1);
    expect(told).toEqual([]);
    expect(Object.keys(mem).some(k => k.startsWith(DAMAGED_PREFIX))).toBe(false);
  });

  it('blocked storage reads as nothing and is not called damaged', () => {
    stub({}, { getItem: () => { throw new Error('blocked'); } });
    expect(LS.get('a')).toBe(null);
    expect(told).toEqual([]);
  });

  it('keepDamaged keeps a value that parsed but has the wrong shape', () => {
    const mem = {}; stub(mem);
    LS.keepDamaged('sync/pending', [1, 2]);
    expect(mem[DAMAGED_PREFIX + 'sync/pending']).toBe('[1,2]');
    expect(told).toEqual(['sync/pending']);
  });

  it('forgetDamaged removes every kept copy and nothing else', () => {
    const mem = { [DAMAGED_PREFIX + 'a']: 'x', [DAMAGED_PREFIX + 'b']: 'y', 'ironlog:a': '1' }; stub(mem);
    LS.forgetDamaged();
    expect(mem).toEqual({ 'ironlog:a': '1' });
  });

  it('a value found damaged before anyone listens is told to the first listener', () => {
    stop();
    const mem = { 'ironlog:early': '{' }; stub(mem);
    LS.get('early');
    const late = []; stop = onDamaged(k => late.push(k));
    expect(late).toEqual(['early']);
  });
});

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

  // EH-11: the code after a successful write used to sit inside the same try, so its throw read as "not saved" and the write went again.
  it('a throw after the write went through is reported once, and the write is not sent again', async () => {
    vi.useFakeTimers();
    const writes = []; const errors = []; const flags = [];
    const db = { doc: () => ({ set: async body => { writes.push(body); return { ...body, merged: true }; } }) };
    const q = makeSaveQueue({ getDb: () => db, onFlag: f => flags.push(f), onError: e => errors.push(e.message), onStored: () => { throw new Error('bad merge'); } });
    q.save('weeks/x', { v: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(writes).toEqual([{ v: 1 }]);
    expect(errors).toEqual(['bad merge']);
    expect(flags).toEqual(['Saved']);
    expect(q.pending('weeks/x')).toBe(false);
    vi.useRealTimers();
  });

  it('a throw while handling a failed write does not stop that path from saving again', async () => {
    vi.useFakeTimers();
    let online = false; const writes = []; const errors = [];
    const db = { doc: () => ({ set: async body => { if (!online) throw new TypeError('Failed to fetch'); writes.push(body); } }) };
    const onFlag = f => { if (f === 'Not saved, retrying…') throw new Error('status line broke'); };
    const q = makeSaveQueue({ getDb: () => db, onFlag, onError: e => errors.push(e.message) });
    q.save('weeks/x', { v: 1 });
    await vi.advanceTimersByTimeAsync(100);
    online = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(writes).toEqual([{ v: 1 }]);
    expect(errors[0]).toBe('status line broke');
    q.save('weeks/x', { v: 2 });
    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toEqual([{ v: 1 }, { v: 2 }]);
    vi.useRealTimers();
  });
});
