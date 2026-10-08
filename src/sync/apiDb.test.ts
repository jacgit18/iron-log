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
  const as = (userId: string): AccountState => ({ status: 'signed-in', userId, kind: 'session', email: `${userId}@example.com`, name: null });
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
