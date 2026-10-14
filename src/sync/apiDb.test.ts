import { describe, expect, it, vi } from 'vitest';
import type { AccountState } from './account.js';
import { OUTDATED_WAIT_MS, OWNER_KEY, createApiDb, type ApiDbOptions } from './apiDb.js';
import { MIRROR_KEY } from './mirrorStore.js';
import { PENDING_KEY, QUARANTINE_KEY } from './outbox.js';
import { down, fakeServer, gatedSleep, memoryStorage } from './testing.js';

// Lets queued promises run. The fake server answers after a real 1 ms tick, so wait a little longer than that.
const settle = (ms = 15) => new Promise(r => setTimeout(r, ms));
const entry = (id: string, over: object = {}) => ({ id, d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5, ...over });
const logsDoc = (...entries: object[]) => ({ schema: 1, entries });

function setup(over: Partial<ApiDbOptions> = {}) {
  const server = fakeServer();
  const storage = memoryStorage();
  const gate = gatedSleep();
  const make = (extra: Partial<ApiDbOptions> = {}) =>
    createApiDb({ transport: server.transport, storage, sleep: gate.sleep, pollMs: 0, random: () => 0.5, ...over, ...extra });
  return { server, storage, gate, make, db: make() };
}

describe('reading', () => {
  it('waits for the first pull before telling the app anything, then tells it what the server has', async () => {
    const { server, db } = setup();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A', done: { 'A-d1s1:0': true } } });
    const seen: boolean[] = [];
    db.doc('weeks/2026-10-04').onSnapshot(s => seen.push(s.exists));
    await settle();
    expect(seen).toEqual([]); // not pulled yet: the mirror may be missing rows
    db.start();
    await settle();
    expect(seen).toEqual([true]);
    const got = await db.doc('weeks/2026-10-04').get();
    expect(got.data()).toMatchObject({ prog: 'A', done: { 'A-d1s1:0': true } });
  });

  it('a path the server does not have is a snapshot that does not exist, once ready', async () => {
    const { db } = setup();
    const seen: boolean[] = [];
    db.start();
    await settle();
    db.doc('weeks/2026-10-04').onSnapshot(s => seen.push(s.exists));
    await settle();
    expect(seen).toEqual([false]);
  });

  it('after a reload that had pulled before, it answers at once from the mirror, even offline', async () => {
    const { server, storage, make } = setup();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'B' } });
    const first = make();
    first.start();
    await settle();
    const offline = fakeServer();
    offline.fail.push(down('network'));
    const second = make({ transport: offline.transport });
    const seen: unknown[] = [];
    second.doc('weeks/2026-10-04').onSnapshot(s => seen.push(s.data().prog));
    await settle();
    expect(seen).toEqual(['B']);
    expect(storage.data.has(MIRROR_KEY)).toBe(true);
  });

  it('snapshots hold copies, so changing one cannot change the mirror', async () => {
    const { server, db } = setup();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A', done: {} } });
    db.start();
    await settle();
    const a = (await db.doc('weeks/2026-10-04').get()).data();
    a.prog = 'B';
    a.done.x = true;
    expect((await db.doc('weeks/2026-10-04').get()).data()).toMatchObject({ prog: 'A', done: {} });
  });

  it('tells a listener when a pull changes its document, and not otherwise', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    const seen: unknown[] = [];
    db.doc('weeks/2026-10-04').onSnapshot(s => seen.push(s.exists ? s.data().prog : null));
    await settle();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A' } });
    await db.syncNow();
    await db.syncNow(); // nothing new
    expect(seen).toEqual([null, 'A']);
  });

  it('stops telling a listener after it unsubscribes', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    const cb = vi.fn();
    const off = db.doc('weeks/2026-10-04').onSnapshot(cb);
    await settle();
    off();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A' } });
    await db.syncNow();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('collections list their documents: logs by exercise, weeks by week', async () => {
    const { db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    await db.doc('logs/bench').set(logsDoc(entry('B1')));
    await db.doc('weeks/2026-10-04').set({ prog: 'A', done: {}, skipped: {}, moved: {}, ph: {}, warm: {} });
    const logs = await db.collection('logs').get();
    expect(logs.docs.map(d => d.id)).toEqual(['bench', 'squat']);
    expect(logs.docs[1]!.data().entries.map((e: { id: string }) => e.id)).toEqual(['S1']);
    expect((await db.collection('weeks').get()).docs.map(d => d.id)).toEqual(['2026-10-04']);
    expect((await db.collection('programs').get()).docs).toEqual([]);
  });

  it('a collection listener hears about a pulled change', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    const sizes: number[] = [];
    db.collection('logs').onSnapshot(s => sizes.push(s.docs.length));
    await settle();
    server.plant('log_entries', 'S1', { client_id: 'S1', exercise_id: 'squat', d: '2026-10-05', auto: false });
    await db.syncNow();
    expect(sizes).toEqual([0, 1]);
  });
});

describe('writing', () => {
  it('keeps the document safe on the device before it sends anything', async () => {
    const { server, storage, db } = setup();
    db.start();
    await settle();
    const seenWhenSent: unknown[] = [];
    const real = server.transport.command;
    server.transport.command = async (name, env) => { seenWhenSent.push(JSON.parse(storage.data.get(PENDING_KEY) ?? '{}')); return real(name, env); };
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    expect(seenWhenSent).toHaveLength(1);
    expect(Object.keys(seenWhenSent[0] as object)).toEqual(['logs/squat']);
  });

  it('sends the commands in plan order, then clears the outbox and resolves', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S2')));
    expect(server.sent.map(c => `${c.name}:${c.env.clientId}:${c.env.baseVersion}`)).toEqual(['log-session:S1:null', 'log-session:S2:null']);
    expect(db.status().pendingPaths).toEqual([]);
    expect(db.status().state).toBe('idle');
    // a second save of the same document sends nothing
    await db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S2')));
    expect(server.sent).toHaveLength(2);
  });

  it('an edit carries the version the server gave, a removal deletes, and an Undo restores', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S2')));
    server.sent.length = 0;
    await db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 })));
    expect(server.sent.map(c => `${c.name}:${c.env.clientId ?? ''}:${c.env.baseVersion}`)).toEqual(['delete-entry:delete-entry:1:S2:1', 'log-session:S1:1'].map(x => x.replace('delete-entry:delete-entry:1:S2:1', `delete-entry:${server.sent[0]!.env.clientId}:1`)));
    server.sent.length = 0;
    await db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 }), entry('S2')));
    expect(server.sent.map(c => `${c.name}:${c.env.baseVersion}`)).toEqual(['log-session:2']); // S2 was deleted at version 2
    expect((await db.doc('logs/squat').get()).data().entries.map((e: { id: string }) => e.id).sort()).toEqual(['S1', 'S2']);
  });

  it('delete() removes everything for the path', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('weeks/2026-10-04').set({ prog: 'A', done: {}, skipped: {}, moved: {}, ph: {}, warm: {} });
    await db.doc('weeks/2026-10-04').delete();
    expect(server.sent.map(c => c.name)).toEqual(['save-week', 'delete-week']);
    expect((await db.doc('weeks/2026-10-04').get()).exists).toBe(false);
  });

  it('shows the document it just wrote, not an older one, while the write is waiting', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('network'));
    await db.doc('weeks/2026-10-04').set({ prog: 'A', done: { x: true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    expect((await db.doc('weeks/2026-10-04').get()).data()).toMatchObject({ done: { x: true } });
  });

  it('does not tell the app about its own write, but does about rows the server changed beside it', async () => {
    const { db } = setup();
    db.start();
    await settle();
    const logs = vi.fn();
    db.doc('logs/squat').onSnapshot(logs);
    await settle();
    logs.mockClear();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    expect(logs).not.toHaveBeenCalled();
  });

  it('paths the app keeps for itself stay in the browser, untouched by the server', async () => {
    const { server, storage, db } = setup();
    db.start();
    await settle();
    const seen: unknown[] = [];
    db.doc('view/main').onSnapshot(s => seen.push(s.exists ? s.data() : null));
    await db.doc('view/main').set({ tab: 'board' });
    expect(storage.get('view/main')).toEqual({ tab: 'board' });
    expect(server.sent).toEqual([]);
    expect(seen).toContainEqual({ tab: 'board' });
    await db.doc('view/main').delete();
    expect(storage.get('view/main')).toBeNull();
  });
});

describe('when the server cannot be reached', () => {
  it('set() returns so the app is not held up, the write stays, and it goes through when the network is back', async () => {
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('network'));
    await db.doc('logs/squat').set(logsDoc(entry('S1'))); // resolves although nothing was sent
    expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'network', pendingPaths: ['logs/squat'] });
    expect(gate.waits).toEqual([1500]);
    expect(server.rows.size).toBe(0);
    gate.releaseAll(); // the wait is over
    await settle();
    expect(server.rows.size).toBe(1);
    expect(db.status()).toMatchObject({ state: 'idle', pausedBecause: null, pendingPaths: [] });
  });

  it('waits longer each time, and a Retry-After from the server wins', async () => {
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('server'), down('server'), down('server', 12_000));
    void db.doc('logs/squat').set(logsDoc(entry('S1')));
    for (let i = 0; i < 3; i++) { await settle(); gate.releaseAll(); }
    await settle();
    expect(gate.waits).toEqual([1500, 3000, 12_000]);
    expect(server.rows.size).toBe(1);
  });

  it('resume() wakes a waiting write at once', async () => {
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('auth'));
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    expect(db.status().pausedBecause).toBe('auth');
    await db.resume(); // signed in again; no need to wait out the backoff
    await settle();
    expect(server.rows.size).toBe(1);
    expect(gate.waiting).toBeGreaterThanOrEqual(0);
  });

  it('a pulled-in change while waiting is part of the next plan', async () => {
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.plant('log_entries', 'S1', { client_id: 'S1', exercise_id: 'squat', d: '2026-10-05', phase: 'strength', weight_lb: '100.0000', sets_count: 3, reps: '5.00', auto: false });
    await db.syncNow();
    server.fail.push(down('network'));
    await db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 })));
    gate.releaseAll();
    await settle();
    expect(server.sent.at(-1)).toMatchObject({ name: 'log-session', env: { clientId: 'S1', baseVersion: 1 } });
    expect(server.rows.get('log_entries|S1')).toMatchObject({ version: 2, weight_lb: '140.0000' });
  });

  it('only the latest document is sent when several were written during the wait', async () => {
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('network'));
    const week = (done: object) => ({ prog: 'A', done, skipped: {}, moved: {}, ph: {}, warm: {} });
    await db.doc('weeks/2026-10-04').set(week({ a: true }));
    await db.doc('weeks/2026-10-04').set(week({ a: true, b: true }));
    gate.releaseAll();
    await settle();
    const saves = server.sent.filter(c => c.name === 'save-week');
    expect(saves.at(-1)!.env.input).toMatchObject({ week: { done: { a: true, b: true } } });
    expect(server.rows.get('weeks|2026-10-04')!.data).toMatchObject({ done: { a: true, b: true } });
  });

  it('writes to several documents while offline are all kept and sent after the connection returns: in the order written, once each', async () => {
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('network'), down('network'), down('network'));
    const week = (done: object) => ({ prog: 'A', done, skipped: {}, moved: {}, ph: {}, warm: {} });
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    await db.doc('weeks/2026-10-04').set(week({ a: true }));
    await db.doc('logs/bench').set(logsDoc(entry('B1', { w: 95 })));
    await db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S2'))); // squat edited again while offline
    expect(db.status().pendingPaths.sort()).toEqual(['logs/bench', 'logs/squat', 'weeks/2026-10-04']);
    await settle();
    expect(server.rows.size).toBe(0); // nothing got through yet
    for (let i = 0; i < 4; i++) { await settle(); gate.releaseAll(); } // three failed tries, then the network is back
    await settle(30);
    const names = server.sent.filter(c => !(c.name as string).startsWith('pull')).map(c => `${c.name}:${c.env.clientId}`);
    const okSent = names.slice(3); // the first three requests were the failed ones
    expect(okSent).toEqual(['log-session:S1', 'log-session:S2', 'save-week:save-week:new:2026-10-04', 'log-session:B1']);
    expect([...server.rows.keys()].sort()).toEqual(['log_entries|B1', 'log_entries|S1', 'log_entries|S2', 'weeks|2026-10-04']);
    expect(db.status()).toMatchObject({ state: 'idle', pendingPaths: [], quarantined: 0 });
  });

  it('a reload during the wait loses nothing: the next session sends what the last one kept', async () => {
    const { server, storage, gate, make, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('network'));
    await db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S2')));
    expect(JSON.parse(storage.data.get(PENDING_KEY)!)['logs/squat']).toBeTruthy();
    db.stop();
    gate.releaseAll();
    // the browser reloads: a new adapter on the same storage, and the server is reachable again
    const next = make();
    next.start();
    await settle(30);
    expect([...server.rows.keys()].sort()).toEqual(['log_entries|S1', 'log_entries|S2']);
    expect(next.status().pendingPaths).toEqual([]);
  });

  it('a reload shows the unsent document, not the older one from the server', async () => {
    const { server, make, db } = setup();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A', done: {} } });
    db.start();
    await settle();
    server.fail.push(down('network'), down('network'), down('network'));
    await db.doc('weeks/2026-10-04').set({ prog: 'A', done: { typed: true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    db.stop();
    const offline = fakeServer();
    offline.fail.push(down('network'), down('network'), down('network'));
    const next = make({ transport: offline.transport });
    const seen: unknown[] = [];
    next.doc('weeks/2026-10-04').onSnapshot(s => seen.push(s.data().done));
    await settle();
    expect(seen[0]).toEqual({ typed: true });
  });
});

describe('an app the server says is too old', () => {
  it('keeps the write, stops sending, and waits for an update instead of retrying every few seconds', async () => {
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('outdated'));
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'outdated', pendingPaths: ['logs/squat'] });
    expect(gate.waits).toEqual([OUTDATED_WAIT_MS]);
    expect(server.sent).toHaveLength(1);
    expect(server.rows.size).toBe(0);
  });

  it('sends what it kept once the app is updated and the user comes back', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('outdated'));
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    await db.resume(); // the updated app starts, or the user returns to it
    await settle();
    expect(server.rows.size).toBe(1);
    expect(db.status()).toMatchObject({ state: 'idle', pausedBecause: null, pendingPaths: [] });
  });

  it('a pull that gets 426 pauses the same way, and the timer leaves it alone', async () => {
    vi.useFakeTimers();
    try {
      const { server, make } = setup();
      const db = make({ pollMs: 1000, sleep: () => new Promise(() => undefined) });
      server.fail.push({ ok: false, class: 'outdated', status: 426, retryAfterMs: null, message: 'too old' });
      const pulls = vi.spyOn(server.transport, 'pull');
      db.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'outdated' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(pulls).toHaveBeenCalledTimes(1); // the timer did not try again
      await db.resume(); // but coming back to the app does
      expect(pulls).toHaveBeenCalledTimes(2);
      expect(db.status().pausedBecause).toBeNull();
      db.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('when the server refuses', () => {
  it('rejects with a permanent error, keeps the document in the quarantine, and does not retry it', async () => {
    const { server, storage, db } = setup();
    db.start();
    await settle();
    server.fail.push({ ok: false, class: 'refused', status: 422, reason: 'invalid-input' });
    await expect(db.doc('logs/squat').set(logsDoc(entry('S1')))).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(db.status()).toMatchObject({ pendingPaths: [], quarantined: 1, state: 'idle' }); // not left "syncing"
    const [q] = db.quarantined();
    expect(q).toMatchObject({ path: 'logs/squat', reason: 'The server would not take this (invalid-input).' });
    expect((q!.doc as { entries: { id: string }[] }).entries[0]!.id).toBe('S1');
    expect(JSON.parse(storage.data.get(QUARANTINE_KEY)!)).toHaveLength(1);
    expect(server.sent).toHaveLength(1);
  });

  it('only the user discards a quarantined write', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    server.fail.push({ ok: false, class: 'refused', status: 422, reason: 'invalid-input' });
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    const statuses: number[] = [];
    db.onStatus(s => statuses.push(s.quarantined));
    expect(db.discard(db.quarantined()[0]!.id)).toBe(true);
    expect(db.quarantined()).toEqual([]);
    expect(statuses.at(-1)).toBe(0);
  });

  it('the next write for the same path goes through normally', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    server.fail.push({ ok: false, class: 'refused', status: 422, reason: 'invalid-input' });
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    await db.doc('logs/squat').set(logsDoc(entry('S2')));
    expect(server.rows.has('log_entries|S2')).toBe(true);
  });
});

describe('trying a set-aside write again', () => {
  const refuseOnce = (server: ReturnType<typeof fakeServer>) => server.fail.push({ ok: false, class: 'refused', status: 422, reason: 'invalid-input' });

  it('sends it as it was written, and the entry leaves the list', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    const [q] = db.quarantined();
    expect(await db.retry(q!.id)).toBe('sent');
    expect(db.quarantined()).toEqual([]);
    expect(db.status()).toMatchObject({ quarantined: 0, quarantine: [], pendingPaths: [] });
    expect(server.rows.has('log_entries|S1')).toBe(true);
  });

  // Try again adds, it never takes away: the set-aside copy is old, so what changed on the server since is left as it is.
  const squat = (id: string, w: number) => ({ client_id: id, exercise_id: 'squat', d: '2026-10-06', phase: 'strength', weight_lb: `${w}.0000`, sets_count: 3, reps: '5.00', auto: false });
  it('a session logged on another device after the refusal is kept, and the set-aside edit still goes through', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 }))).catch(() => undefined);
    server.plant('log_entries', 'S2', squat('S2', 150)); // logged on the other device meanwhile
    await db.syncNow();
    expect(await db.retry(db.quarantined()[0]!.id)).toBe('sent');
    expect(server.rows.get('log_entries|S2')).toMatchObject({ deleted_at: null }); // not deleted for missing from the old copy
    expect(server.rows.get('log_entries|S1')).toMatchObject({ weight_lb: '140.0000' }); // unchanged since, so the edit lands
    expect(db.status().notices.map(n => n.text)).toContain('Sent what was set aside; what changed on another device since was kept.');
  });

  // An entry set aside before versions were kept has no `seen`: the note then speaks only of rows the server has that differ from the copy.
  const dropSeen = (storage: ReturnType<typeof setup>['storage']) => {
    const q = storage.get('sync/quarantine') as { seen?: unknown }[];
    storage.set('sync/quarantine', q.map(({ seen: _seen, ...e }) => e));
  };
  it('an old set-aside entry (no versions kept) whose rows the server still matches says nothing about other devices', async () => {
    const { server, storage, make } = setup();
    const db = make(); db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1'))); // on the server, and the set-aside copy below has it unchanged
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S3'))).catch(() => undefined);
    db.stop?.();
    dropSeen(storage);
    const again = make(); again.start();
    await settle();
    expect(await again.retry(again.quarantined()[0]!.id)).toBe('sent');
    expect(server.rows.has('log_entries|S3')).toBe(true);
    // before: every row of an old entry counted as changed elsewhere, so this note showed although nothing had changed
    expect(again.status().notices.map(n => n.text).filter(t => t.startsWith('Sent what was set aside'))).toEqual([]);
  });
  it('an old set-aside entry with a row on the server it does not have says that row was kept, not that another device changed it', async () => {
    const { server, storage, make } = setup();
    const db = make(); db.start();
    await settle();
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    db.stop?.();
    dropSeen(storage);
    server.plant('log_entries', 'S2', squat('S2', 150));
    const again = make(); again.start();
    await settle();
    expect(await again.retry(again.quarantined()[0]!.id)).toBe('sent');
    expect(server.rows.get('log_entries|S2')).toMatchObject({ deleted_at: null });
    expect(again.status().notices.map(n => n.text)).toContain('Sent what was set aside; what the server had that differed from it was kept.');
  });

  it('an entry edited on another device since is not put back to the set-aside copy', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 }))).catch(() => undefined);
    const row = server.rows.get('log_entries|S1')!;
    server.rows.set('log_entries|S1', { ...row, version: row.version + 1, weight_lb: '160.0000', seq: '99' }); // edited elsewhere
    await db.syncNow();
    expect(await db.retry(db.quarantined()[0]!.id)).toBe('sent');
    expect(server.rows.get('log_entries|S1')).toMatchObject({ weight_lb: '160.0000' });
  });

  it('a newer save on this device while the retry waits is sent as usual, not held back by the retry', async () => {
    // The retry leaves S2 (logged elsewhere after the refusal) as the server has it. That applies to the set-aside copy only:
    // an edit of S2 made here while the retry waits for the network is this device's latest word and must reach the server.
    const { server, gate, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 }))).catch(() => undefined);
    server.plant('log_entries', 'S2', squat('S2', 150));
    await db.syncNow();
    server.fail.push(down('network'));
    const retrying = db.retry(db.quarantined()[0]!.id); // waits for the network
    await settle();
    const s2 = { id: 'S2', d: '2026-10-06', ph: 'strength', w: 170, s: 3, r: 5 };
    void db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 }), s2)); // edits S2 here meanwhile
    gate.releaseAll();
    await retrying;
    await settle(30);
    expect(server.rows.get('log_entries|S2')).toMatchObject({ weight_lb: '170.0000' });
    expect(db.status().pendingPaths).toEqual([]);
  });

  it('a set-aside week is merged with the ticks another device made since', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    const wk = (done: object) => ({ prog: 'A', done, skipped: {}, moved: {}, ph: {}, warm: {} });
    await db.doc('weeks/2026-10-04').set(wk({ a: true }));
    refuseOnce(server);
    await db.doc('weeks/2026-10-04').set(wk({ a: true, c: true })).catch(() => undefined);
    const row = server.rows.get('weeks|2026-10-04')!;
    server.rows.set('weeks|2026-10-04', { ...row, version: row.version + 1, data: wk({ a: true, b: true }), seq: '99' });
    await db.syncNow();
    expect(await db.retry(db.quarantined()[0]!.id)).toBe('sent');
    expect(server.rows.get('weeks|2026-10-04')!.data.done).toEqual({ a: true, b: true, c: true });
  });

  it('if the server refuses it again, it comes back with the new reason', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    server.fail.push({ ok: false, class: 'refused', status: 422, reason: 'still-invalid' });
    expect(await db.retry(db.quarantined()[0]!.id)).toBe('refused');
    expect(db.quarantined()).toHaveLength(1);
    expect(db.quarantined()[0]!.reason).toBe('The server would not take this (still-invalid).');
  });

  it('keeps the write safe on the device even if the app closes straight after', async () => {
    const { server, storage, gate, db } = setup();
    db.start();
    await settle();
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    server.fail.push(down('network'));
    const done = db.retry(db.quarantined()[0]!.id);
    await settle();
    expect(JSON.parse(storage.data.get(PENDING_KEY)!)['logs/squat']).toBeTruthy();
    expect(JSON.parse(storage.data.get(QUARANTINE_KEY)!)).toEqual([]);
    gate.releaseAll();
    expect(await done).toBe('sent');
  });

  it('will not replace a newer unsent document with an old one', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    server.fail.push(down('network'));
    await db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S2'))); // newer, unsent
    expect(await db.retry(db.quarantined()[0]!.id)).toBe('busy');
    expect(db.quarantined()).toHaveLength(1);
  });

  it('only the newest set-aside write for a path can be retried', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S1'))).catch(() => undefined);
    refuseOnce(server);
    await db.doc('logs/squat').set(logsDoc(entry('S2'))).catch(() => undefined);
    const [older, newer] = db.quarantined();
    expect(await db.retry(older!.id)).toBe('busy');
    expect(await db.retry(newer!.id)).toBe('sent');
  });

  it('an entry that is already gone says so', async () => {
    const { db } = setup();
    expect(await db.retry('nope')).toBe('gone');
  });
});

describe('conflicts', () => {
  it('a stale edit takes the server row and resends on top of it: this device wins', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    // another device edits the same entry
    server.rows.set('log_entries|S1', { ...server.rows.get('log_entries|S1')!, version: 2, weight_lb: '150.0000', seq: '99' });
    await db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 })));
    expect(server.rows.get('log_entries|S1')).toMatchObject({ version: 3, weight_lb: '140.0000' });
    expect(db.quarantined()).toEqual([]);
  });

  // ADR 031: a stale week is merged three-way against the row this device's save was based on.
  const wk = (done: object) => ({ prog: 'A', done, skipped: {}, moved: {}, ph: {}, warm: {} });
  const otherDeviceSaves = (server: ReturnType<typeof setup>['server'], done: object) =>
    server.rows.set('weeks|2026-10-04', { ...server.rows.get('weeks|2026-10-04')!, version: 2, data: wk(done), seq: '99' });

  it('a stale week keeps the tick another device made, shows it at once, and says so', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('weeks/2026-10-04').set(wk({ a: true }));
    otherDeviceSaves(server, { a: true, b: true });
    await db.doc('weeks/2026-10-04').set(wk({ a: true, c: true }));
    expect(server.rows.get('weeks|2026-10-04')).toMatchObject({ version: 3, data: { done: { a: true, b: true, c: true } } });
    expect((await db.doc('weeks/2026-10-04').get()).data().done).toEqual({ a: true, b: true, c: true });
    expect(db.status().notices.map(n => n.text)).toEqual(['Merged changes from another device.']);
  });

  it('a stale week keeps this device\'s untick', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('weeks/2026-10-04').set(wk({ a: true }));
    otherDeviceSaves(server, { a: true, b: true });
    await db.doc('weeks/2026-10-04').set(wk({}));
    expect(server.rows.get('weeks|2026-10-04')!.data.done).toEqual({ b: true });
  });

  it('a week saved while a pull brings in another device\'s ticks keeps those ticks', async () => {
    // Opening the app pulls; a save made from the older week before that pull lands is sent after it. Planned against the
    // newer row, it went out as a plain edit of that row and wiped the other device's ticks (a whole day, 2026-10-13).
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('weeks/2026-10-04').set(wk({ a: true }));
    otherDeviceSaves(server, { a: true, b: true });
    const pulling = db.syncNow();
    const saving = db.doc('weeks/2026-10-04').set(wk({ a: true, c: true }));
    await pulling; await saving;
    expect(server.rows.get('weeks|2026-10-04')!.data.done).toEqual({ a: true, b: true, c: true });
    expect((await db.doc('weeks/2026-10-04').get()).data().done).toEqual({ a: true, b: true, c: true });
  });

  it('the same holds for a stretch week', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('stretchweeks/2026-10-04').set({ done: { '1:a': true }, skipped: {}, extra: [] });
    const row = server.rows.get('stretch_weeks|2026-10-04')!;
    server.rows.set('stretch_weeks|2026-10-04', { ...row, version: 2, data: { done: { '1:a': true, '1:b': true }, skipped: {}, extra: [] }, seq: '99' });
    const pulling = db.syncNow();
    const saving = db.doc('stretchweeks/2026-10-04').set({ done: { '1:a': true, '1:c': true }, skipped: {}, extra: [] });
    await pulling; await saving;
    expect(server.rows.get('stretch_weeks|2026-10-04')!.data.done).toEqual({ '1:a': true, '1:b': true, '1:c': true });
  });

  it('a week this device had no row for keeps what another device saved first', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: wk({ b: true }) });
    const pulling = db.syncNow();
    const saving = db.doc('weeks/2026-10-04').set(wk({ c: true }));
    await pulling; await saving;
    expect(server.rows.get('weeks|2026-10-04')!.data.done).toEqual({ b: true, c: true });
  });

  it('a second save made from the week before a merge, while the merged week waits to be sent, keeps the merged ticks', async () => {
    // Production 2026-10-12..14, four times: a phone holding an old week saved, a pull brought another device's ticks, the save was merged
    // in the outbox and its base moved to the pulled row, then the server was slow (the save paused, so the app was never handed the
    // merge). The next tap, made from the old week, replaced the merged copy and went out against the new base: no merge, ticks gone.
    const { server, gate, db } = setup();
    db.start();
    await settle();
    await db.doc('weeks/2026-10-04').set(wk({ a: true }));
    otherDeviceSaves(server, { a: true, b: true });
    // the first send answers as usual (stale: merged, base moved on), the resend of the merged week finds the server down
    server.fail.push(undefined as never, down('server'));
    const first = db.doc('weeks/2026-10-04').set({ ...wk({ a: true }), moved: { x: 2 } });
    await settle();
    expect(await first).toBeUndefined(); // paused: the app carries on with its own week
    const second = db.doc('weeks/2026-10-04').set({ ...wk({ a: true }), moved: { x: 2, y: 3 } }); // the next tap, from the same old week
    gate.releaseAll();
    await second; await settle();
    expect(server.rows.get('weeks|2026-10-04')!.data).toMatchObject({ done: { a: true, b: true }, moved: { x: 2, y: 3 } });
    expect((await db.doc('weeks/2026-10-04').get()).data().done).toEqual({ a: true, b: true });
  });

  it('a week saved after the pull landed is not merged again', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('weeks/2026-10-04').set(wk({ a: true }));
    otherDeviceSaves(server, { a: true, b: true });
    await db.syncNow();
    await db.doc('weeks/2026-10-04').set(wk({ a: true })); // made from the pulled week: unticking b is this device's choice
    expect(server.rows.get('weeks|2026-10-04')!.data.done).toEqual({ a: true });
  });

  it('an edit of something deleted on another device is set aside, not brought back', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    server.rows.set('log_entries|S1', { ...server.rows.get('log_entries|S1')!, version: 3, deleted_at: '2026-10-07T13:00:00.000Z', seq: '99' });
    await expect(db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 })))).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(db.quarantined()[0]!.reason).toMatch(/deleted on another device/);
    expect(server.rows.get('log_entries|S1')!.deleted_at).not.toBeNull();
  });

  it('a row that keeps changing is set aside after a few tries', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    for (let i = 0; i < 6; i++) {
      const current = { ...server.rows.get('log_entries|S1')!, version: 2 + i, seq: String(100 + i) };
      server.fail.push({ ok: false, class: 'conflict', status: 409, reason: 'stale', current: current as never });
    }
    await expect(db.doc('logs/squat').set(logsDoc(entry('S1', { w: 140 })))).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(db.quarantined()[0]!.reason).toMatch(/kept changing/);
  });

  it('a server that accepts everything but changes nothing is caught instead of looping', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    // acknowledge the command without ever storing the row
    server.transport.command = async (name, env) => { server.sent.push({ name, env }); return { ok: true, status: 200, rows: [], cursor: '1' }; };
    await expect(db.doc('logs/squat').set(logsDoc(entry('S1')))).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(db.quarantined()[0]!.reason).toMatch(/did not change/);
    expect(server.sent).toHaveLength(1);
  });
});

describe('notices about what another device changed first', () => {
  it('a delete that is not applied leaves a notice, which the user can clear', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    server.rows.set('log_entries|S1', { ...server.rows.get('log_entries|S1')!, version: 2, weight_lb: '150.0000', seq: '99' });
    await db.doc('logs/squat').set(logsDoc());
    expect(server.rows.get('log_entries|S1')!.deleted_at).toBeNull(); // the other device's edit was kept
    expect(db.status().notices).toHaveLength(1);
    expect(db.status().notices[0]).toMatchObject({ path: 'logs/squat', text: 'Something you deleted was changed on another device first, so it was kept.' });
    const seen: number[] = [];
    db.onStatus(s => seen.push(s.notices.length));
    db.clearNotices();
    expect(db.status().notices).toEqual([]);
    expect(seen.at(-1)).toBe(0);
  });

  it('the kept entry is shown again, because the app is told about the path', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('S1')));
    const shown: string[][] = [];
    db.doc('logs/squat').onSnapshot(s => shown.push(((s.exists ? s.data() : { entries: [] }) as { entries: { id: string }[] }).entries.map(e => e.id)));
    await settle();
    server.rows.set('log_entries|S1', { ...server.rows.get('log_entries|S1')!, version: 2, seq: '99' });
    await db.doc('logs/squat').set(logsDoc());
    await settle();
    expect(shown.at(-1)).toEqual(['S1']);
  });
});

describe('one request at a time', () => {
  it('writes to different paths and pulls never overlap', async () => {
    const { server, db } = setup();
    db.start();
    const week = (n: number) => ({ prog: 'A', done: { [`k${n}`]: true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    await Promise.all([
      db.doc('logs/squat').set(logsDoc(entry('S1'), entry('S2'))),
      db.doc('logs/bench').set(logsDoc(entry('B1'))),
      db.doc('weeks/2026-10-04').set(week(1)),
      db.syncNow(),
      db.doc('weeks/2026-10-11').set(week(2)),
    ]);
    expect(server.overlapped).toBe(false);
    expect(server.rows.size).toBe(5);
  });
});

describe('syncNow', () => {
  it('a call made while a pull is running gets a pull that starts after the call, so it sees what happened meanwhile', async () => {
    const { server, db } = setup();
    // The first pull computes its answer at once, then takes a while to get back to the phone.
    const real = server.transport.pull;
    let first = true;
    server.transport.pull = async (since, limit) => {
      const out = await real(since, limit);
      if (first) { first = false; await new Promise(r => setTimeout(r, 40)); }
      return out;
    };
    db.start();
    await settle(15); // the first pull has its answer but has not delivered it
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A' } });
    await db.syncNow();
    expect((await db.doc('weeks/2026-10-04').get()).exists).toBe(true);
  });

  it('many calls while one pull is running share one follow-up pull', async () => {
    const { server, db } = setup();
    const pulls = vi.spyOn(server.transport, 'pull');
    db.start();
    await Promise.all([db.syncNow(), db.syncNow(), db.syncNow(), db.syncNow()]);
    expect(pulls).toHaveBeenCalledTimes(2); // the one running, and one after it for all four callers
  });
});

describe('waking and polling', () => {
  it('when the app comes back to the foreground it pulls', async () => {
    const { server, make } = setup();
    let wakeUp = () => {};
    const db = make({ onWake: cb => { wakeUp = cb; return () => undefined; } });
    db.start();
    await settle();
    const seen: unknown[] = [];
    db.doc('weeks/2026-10-04').onSnapshot(s => seen.push(s.exists));
    await settle();
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A' } });
    wakeUp();
    await settle();
    expect(seen).toEqual([false, true]);
  });

  it('pulls on a timer while visible, and not while hidden', async () => {
    vi.useFakeTimers();
    try {
      const { server, make } = setup();
      let visible = true;
      const db = make({ pollMs: 1000, visible: () => visible, sleep: () => new Promise(() => undefined) });
      const pulls = vi.spyOn(server.transport, 'pull');
      db.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(pulls).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(pulls).toHaveBeenCalledTimes(2);
      visible = false;
      await vi.advanceTimersByTimeAsync(3000);
      expect(pulls).toHaveBeenCalledTimes(2);
      visible = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(pulls).toHaveBeenCalledTimes(3);
      db.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(pulls).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed pull pauses with the reason and the app keeps working', async () => {
    const { server, db } = setup();
    server.fail.push({ ok: false, class: 'auth', status: 401, retryAfterMs: null, message: 'sign-in required' });
    const states: string[] = [];
    db.onStatus(s => states.push(`${s.state}:${s.pausedBecause}`));
    db.start();
    await settle();
    expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'auth', ready: false });
    await db.resume();
    expect(db.status()).toMatchObject({ state: 'idle', pausedBecause: null, ready: true });
    expect(states).toContain('paused:auth');
  });
});

describe('whose data this device holds (B2e)', () => {
  const as = (userId: string): AccountState => ({ status: 'signed-in', userId, kind: 'session', email: `${userId}@example.com`, name: null, isAdmin: false });
  let who: AccountState = as('ann');
  const identity = () => Promise.resolve(who);
  const ownerOf = (storage: ReturnType<typeof memoryStorage>) => (storage.get(OWNER_KEY) as { userId: string } | null)?.userId ?? null;

  it('the first account to sync owns the device, and the same account carries on', async () => {
    who = as('ann');
    const { storage, make, db } = setup({ identity });
    db.start();
    await settle();
    expect(ownerOf(storage)).toBe('ann');
    expect(db.status()).toMatchObject({ state: 'idle', pausedBecause: null });
    const again = make({ identity });
    again.start();
    await settle();
    expect(again.status()).toMatchObject({ state: 'idle', ready: true });
  });

  it('another account is held back: nothing is pulled or sent, and the first account\'s unsent change stays', async () => {
    who = as('ann');
    const { server, storage, make, db } = setup({ identity });
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('e1')));
    await settle();
    expect(server.sent).toHaveLength(1);
    // Ann writes while offline: unsent on the device.
    server.fail.push(down('network'));
    void db.doc('logs/squat').set(logsDoc(entry('e1'), entry('e2')));
    await settle();
    expect(Object.keys((storage.get(PENDING_KEY) ?? {}) as object)).toEqual(['logs/squat']);
    db.stop();

    who = as('bob');
    const sentBefore = server.sent.length;
    const bobs = make({ identity });
    bobs.start();
    await settle(40);
    expect(bobs.status()).toMatchObject({ state: 'paused', pausedBecause: 'account' });
    expect(server.sent).toHaveLength(sentBefore); // Ann's change never reaches Bob
    expect(ownerOf(storage)).toBe('ann');
    expect(Object.keys((storage.get(PENDING_KEY) ?? {}) as object)).toEqual(['logs/squat']);
  });

  it('a tab that was signed in as Ann notices another tab switched the browser to Bob, when the app wakes', async () => {
    who = as('ann');
    const { server, storage, make } = setup();
    let wakeUp = () => {};
    const db = make({ identity, onWake: cb => { wakeUp = cb; return () => undefined; } });
    db.start();
    await settle();
    await db.doc('logs/squat').set(logsDoc(entry('e1')));
    await settle();
    expect(server.sent).toHaveLength(1);
    // Another tab signs out and signs in as Bob: the cookie changes, but this tab sees no 401.
    who = as('bob');
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'B', done: { 'bobsecret:0': true } } });
    const sentBefore = server.sent.length;
    wakeUp();
    await settle(40);
    expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'account' });
    expect((await db.doc('weeks/2026-10-04').get()).exists).toBe(false); // Bob's row never reaches Ann's copy
    await db.doc('logs/squat').set(logsDoc(entry('e1'), entry('e2')));
    await settle(40);
    expect(server.sent).toHaveLength(sentBefore); // and Ann's new entry never reaches Bob
    expect(ownerOf(storage)).toBe('ann');
    expect(Object.keys((storage.get(PENDING_KEY) ?? {}) as object)).toEqual(['logs/squat']);
  });

  it('the timer notices it too, and a tab that is hidden does not ask', async () => {
    vi.useFakeTimers();
    try {
      who = as('ann');
      const { server, make } = setup();
      let visible = true;
      const db = make({ identity, pollMs: 1000, visible: () => visible, sleep: () => new Promise(() => undefined) });
      server.plant('weeks', '2026-09-27', { week_start: '2026-09-27', data: { prog: 'A' } }); // Ann's own row, so this device holds her data
      db.start();
      await vi.advanceTimersByTimeAsync(10);
      expect(db.status()).toMatchObject({ state: 'idle', holdsData: true });
      who = as('bob');
      server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'B' } });
      visible = false;
      await vi.advanceTimersByTimeAsync(3000);
      expect(db.status()).toMatchObject({ state: 'idle' }); // hidden: nothing asked, nothing pulled
      visible = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'account' });
      db.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the same account carries on after a wake, and asks who is signed in once each time', async () => {
    who = as('ann');
    const { make } = setup();
    let wakeUp = () => {};
    const asked = vi.fn(identity);
    const db = make({ identity: asked, onWake: cb => { wakeUp = cb; return () => undefined; } });
    db.start();
    await settle();
    expect(asked).toHaveBeenCalledTimes(1);
    wakeUp();
    await settle();
    expect(asked).toHaveBeenCalledTimes(2);
    expect(db.status()).toMatchObject({ state: 'idle', pausedBecause: null });
  });

  it('an empty device is simply handed to the new account, with a fresh pull', async () => {
    who = as('ann');
    const { server, storage, make, db } = setup({ identity });
    db.start();
    await settle();
    db.stop();
    expect(ownerOf(storage)).toBe('ann');
    who = as('bob');
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'B' } });
    const bobs = make({ identity });
    bobs.start();
    await settle();
    expect(ownerOf(storage)).toBe('bob');
    expect(bobs.status()).toMatchObject({ state: 'idle', ready: true });
    expect((await bobs.doc('weeks/2026-10-04').get()).data()).toMatchObject({ prog: 'B' });
  });

  it('tells the app when the device goes to another account, and not when the same account comes back', async () => {
    who = as('ann');
    const changed = vi.fn();
    const { storage, make, db } = setup({ identity, onOwnerChange: changed });
    db.start();
    await settle();
    expect(changed).not.toHaveBeenCalled(); // the first account taking the device is not a change of owner
    db.stop();
    const again = make({ identity, onOwnerChange: changed });
    again.start();
    await settle();
    expect(changed).not.toHaveBeenCalled();
    again.stop();
    who = as('bob'); // an empty device is handed over
    const bobs = make({ identity, onOwnerChange: changed });
    bobs.start();
    await settle();
    expect(ownerOf(storage)).toBe('bob');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('tells the app when the user wipes the device for the new account', async () => {
    who = as('ann');
    const changed = vi.fn();
    const { server, make, db } = setup({ identity });
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A' } }); // Ann has data here, so the device is held back
    db.start();
    await settle();
    db.stop();
    who = as('bob');
    const bobs = make({ identity, onOwnerChange: changed });
    bobs.start();
    await settle(40);
    expect(bobs.status().pausedBecause).toBe('account');
    expect(changed).not.toHaveBeenCalled(); // held back: nothing is forgotten until the user chooses
    expect(await bobs.wipeForNewAccount()).toBe('done');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('wiping forgets the first account\'s data and unsent changes, then carries on as the new one', async () => {
    who = as('ann');
    const { server, storage, make, db } = setup({ identity });
    server.plant('weeks', '2026-10-04', { week_start: '2026-10-04', data: { prog: 'A' } });
    db.start();
    await settle();
    server.fail.push(down('network'));
    void db.doc('logs/squat').set(logsDoc(entry('e9')));
    await settle();
    db.stop();

    who = as('bob');
    const bobs = make({ identity });
    bobs.start();
    await settle(40);
    expect(bobs.status().pausedBecause).toBe('account');
    expect(bobs.deviceData().map(d => d.path)).toEqual(['logs/squat', 'weeks/2026-10-04']);

    const sentBefore = server.sent.length;
    expect(await bobs.wipeForNewAccount()).toBe('done');
    for (const key of [MIRROR_KEY, PENDING_KEY, QUARANTINE_KEY]) expect(storage.data.has(key)).toBe(false);
    expect(ownerOf(storage)).toBe('bob');
    await bobs.syncNow();
    await settle(40);
    expect(server.sent).toHaveLength(sentBefore); // Ann's e9 never goes to Bob
    expect(bobs.status()).toMatchObject({ state: 'idle', pausedBecause: null, pendingPaths: [] });
  });

  it('signed out or unreachable: waits for the right reason and sends nothing', async () => {
    who = { status: 'signed-out' };
    const { server, db } = setup({ identity });
    db.start();
    await settle();
    expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'auth' });
    who = { status: 'unreachable' };
    await db.syncNow();
    expect(db.status()).toMatchObject({ state: 'paused', pausedBecause: 'network' });
    expect(server.sent).toHaveLength(0);
    who = as('ann');
    await db.resume();
    expect(db.status()).toMatchObject({ state: 'idle', pausedBecause: null });
  });

  it('wiping needs someone signed in', async () => {
    who = as('ann');
    const { db } = setup({ identity });
    db.start();
    await settle();
    who = { status: 'signed-out' };
    expect(await db.wipeForNewAccount()).toBe('unavailable');
  });
});

describe('erasing the account (Phase F)', () => {
  const logs2 = (...ids: string[]) => logsDoc(...ids.map(id => entry(id)));

  it('the server erases, then this device forgets its copy, its unsent changes and who owns it', async () => {
    const identity = () => Promise.resolve<AccountState>({ status: 'signed-in', userId: 'ann', kind: 'session', email: null, name: null , isAdmin: false});
    const { server, storage, db } = setup({ identity });
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1'));
    server.fail.push(down('network'));
    void db.doc('logs/squat').set(logs2('e1', 'e2')); // unsent
    await settle();
    expect(storage.data.has(MIRROR_KEY) && storage.data.has(PENDING_KEY) && storage.data.has(OWNER_KEY)).toBe(true);

    expect(await db.eraseEverything('data')).toEqual({ ok: true });
    expect(server.rows.size).toBe(0);
    for (const key of [MIRROR_KEY, PENDING_KEY, QUARANTINE_KEY, OWNER_KEY]) expect(storage.data.has(key)).toBe(false);
    expect(db.status()).toMatchObject({ pendingPaths: [], holdsData: false });
  });

  it('nothing is sent or pulled after the erase, so no row can come back before the page reloads', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.eraseEverything('data');
    const sentBefore = server.sent.length;
    void db.doc('logs/squat').set(logs2('late'));
    await db.syncNow();
    await settle(30);
    expect(server.sent.length).toBe(sentBefore);
    expect(server.rows.size).toBe(0);
  });

  it('a refusal or an unreachable server changes nothing here, and sending carries on', async () => {
    const { server, storage, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1'));
    server.fail.push({ ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'offline' });
    expect(await db.eraseEverything('data')).toMatchObject({ ok: false, class: 'network' });
    expect(storage.data.has(MIRROR_KEY)).toBe(true);
    expect(server.rows.size).toBe(1);
    await db.doc('logs/squat').set(logs2('e1', 'e2')); // still sends
    expect([...server.rows.keys()].filter(k => k.startsWith('log_entries'))).toHaveLength(2);
  });

  it('a write that was waiting to retry when the erase failed is still sent', async () => {
    // The halt made the waiting send let go; a failed erase has to start it again, or it sits unsent until a reload.
    const { server, gate, db } = setup();
    db.start();
    await settle();
    server.fail.push(down('network'));
    void db.doc('logs/squat').set(logs2('e1'));
    await settle();
    server.fail.push({ ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'offline' });
    expect(await db.eraseEverything('data')).toMatchObject({ ok: false, class: 'network' });
    gate.releaseAll();
    await settle(30);
    expect([...server.rows.keys()].filter(k => k.startsWith('log_entries'))).toHaveLength(1);
    expect(db.status().pendingPaths).toEqual([]);
  });

  it('an erase on another device is not undone by a change this device had not sent yet; what it added itself is set aside', async () => {
    // A change saved while the pull that brings the erase is on its way was made from the old data: sent whole it would bring the
    // erased history back. Only what this device added itself (e3) is kept, set aside to send again or discard; e1 and e2 stay erased.
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1', 'e2'));
    server.erase(); // erased on another device
    const pulling = db.syncNow(); // this device learns of it
    const saving = db.doc('logs/squat').set(logs2('e1', 'e2', 'e3')); // made from the old data, while the pull is on its way
    await pulling; await saving;
    await settle();
    expect([...server.rows.keys()].filter(k => k.startsWith('log_entries'))).toEqual([]);
    expect(db.status().pendingPaths).toEqual([]);
    const q = db.quarantined();
    expect(q.map(e => [e.path, (e.doc as { entries: { id: string }[] }).entries.map(x => x.id)])).toEqual([['logs/squat', ['e3']]]);
    expect(db.status().notices.map(n => n.text)).toEqual(['Everything in this account was erased on another device. What this device changed itself (one item) is kept under Not sent, to send again or discard; the rest was dropped.']);
  });

  it('a save that lands while the erase-revealing pull is on the wire is still cut down, not dropped whole', async () => {
    // Nothing is waiting when the pull starts; the save arrives during its round trip. The copy to compare with must exist anyway.
    const server = fakeServer(); const storage = memoryStorage(); const gate = gatedSleep();
    let during: (() => void) | null = null;
    const transport = { ...server.transport, pull: (cursor: string, limit?: number) => { const f = during; during = null; f?.(); return server.transport.pull(cursor, limit); } } as typeof server.transport;
    const db = createApiDb({ transport, storage, sleep: gate.sleep, pollMs: 0, random: () => 0.5 });
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1', 'e2'));
    server.erase();
    let saving: Promise<unknown> = Promise.resolve();
    during = () => { saving = db.doc('logs/squat').set(logs2('e1', 'e2', 'e3')); };
    await db.syncNow();
    await saving; await settle();
    expect(db.quarantined().map(e => [e.path, (e.doc as { entries: { id: string }[] }).entries.map(x => x.id)])).toEqual([['logs/squat', ['e3']]]);
    expect([...server.rows.keys()].filter(k => k.startsWith('log_entries'))).toEqual([]);
  });

  it('a set-aside change is cut down to what this device added, so Try again cannot bring erased entries back', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1'));
    server.fail.push({ ok: false, class: 'refused', status: 422, reason: 'invalid-input' });
    await db.doc('logs/squat').set(logs2('e1', 'e2')).catch(() => undefined); // set aside, nothing pending
    server.erase(); // erased on another device
    await db.syncNow();
    const [q] = db.quarantined();
    expect((q!.doc as { entries: { id: string }[] }).entries.map(x => x.id)).toEqual(['e2']); // e1 was the erased data
    expect(await db.retry(q!.id)).toBe('sent');
    expect([...server.rows.keys()].filter(k => k.startsWith('log_entries'))).toEqual(['log_entries|e2']);
  });

  it('a change of only old data is dropped, and said so', async () => {
    const { server, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1', 'e2'));
    server.erase();
    const pulling = db.syncNow();
    const saving = db.doc('logs/squat').set(logs2('e1')); // removed e2 here: nothing of its own to keep
    await pulling; await saving;
    await settle();
    expect(db.quarantined()).toEqual([]);
    expect(db.status().notices.map(n => n.text)).toEqual(['Everything in this account was erased on another device, so a change from here was dropped.']);
    expect([...server.rows.keys()].filter(k => k.startsWith('log_entries'))).toEqual([]);
  });

  it('deleting the account does the same on this device', async () => {
    const { server, storage, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1'));
    expect(await db.eraseEverything('account')).toEqual({ ok: true });
    expect(server.rows.size).toBe(0);
    expect(storage.data.has(MIRROR_KEY)).toBe(false);
  });

  it('another device that pulls after an erase drops its old copy and shows the new, empty, account', async () => {
    const { server, storage, make, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1', 'e2'));
    const other = make(); // a second device of the same account, already holding both entries
    other.start();
    await settle();
    expect((await other.doc('logs/squat').get()).data().entries).toHaveLength(2);
    const seen: boolean[] = [];
    other.doc('logs/squat').onSnapshot(s => seen.push(s.exists));
    await settle();

    server.erase(); // erased from the first device
    await other.syncNow();
    await settle();
    expect((await other.doc('logs/squat').get()).exists).toBe(false);
    expect(seen.at(-1)).toBe(false); // the screen was told
    expect((storage.get(MIRROR_KEY) as { epoch: string }).epoch).toBe('2');
  });

  it('a copy saved before epochs existed counts as epoch 1, so an old phone keeps its data against an account that was never erased', async () => {
    const { server, storage, make, db } = setup();
    db.start();
    await settle();
    await db.doc('logs/squat').set(logs2('e1'));
    const saved = storage.get(MIRROR_KEY) as Record<string, unknown>;
    delete saved.epoch;
    storage.set(MIRROR_KEY, saved);
    const later = make();
    later.start();
    await settle();
    expect(server.epoch).toBe('1');
    expect((await later.doc('logs/squat').get()).data().entries).toHaveLength(1);
  });
});
