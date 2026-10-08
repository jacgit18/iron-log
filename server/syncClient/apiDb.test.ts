import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApiDb } from '../../src/sync/apiDb.ts';
import { createTransport, type Transport } from '../../src/sync/transport.ts';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { eventually } from '../../src/sync/testing.ts';
import { startTestDatabase } from '../test/postgres.ts';

// The sync adapter against the real API on a real Postgres: the spec's reconciliation invariant (section 5). After any
// writes, flushes and pulls, what each phone holds is what the server holds, and there is at most one check-off per
// card and week. "Devices" are adapters on separate storage.
let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  server = createApp({ db }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await stop?.();
});
beforeEach(async () => {
  await db.deleteFrom('users').execute();
});

const memory = () => {
  const data = new Map<string, string>();
  return { data, get: (k: string) => (data.has(k) ? JSON.parse(data.get(k)!) : null), set: (k: string, v: unknown) => (data.set(k, JSON.stringify(v)), true), remove: (k: string) => void data.delete(k) };
};
const realTransport = (user = 'owner') => createTransport({ clientVersion: 'test', baseUrl: base, headers: () => ({ 'x-dev-user': user }) });
const quickSleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.min(ms, 5)));

// A phone: an adapter on its own storage. `transport` can be swapped for one that fails, to go offline.
function phone(user = 'owner', storage = memory(), transport: Transport = realTransport(user)) {
  const api = createApiDb({ transport, storage, sleep: quickSleep, pollMs: 0, random: () => 0.5 });
  return { api, storage, get: async (path: string) => (await api.doc(path).get()).data() as any, set: (path: string, doc: unknown) => api.doc(path).set(doc) };
}
const offline = (real: Transport, failures: { n: number }): Transport => ({
  command: async (name, env) => (failures.n-- > 0 ? { ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'offline' } : real.command(name, env)),
  pull: async (since, limit) => (failures.n-- > 0 ? { ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'offline' } : real.pull(since, limit)),
});

const entry = (id: string, over: object = {}) => ({ id, d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5, ...over });
const tickOf = (id: string, slot = 's1', over: object = {}) => entry(id, { auto: true, slot, wk: '2026-10-04', ...over });
const logs = (...entries: object[]) => ({ schema: 1, entries });

const serverEntries = async (exercise = 'squat') =>
  (await db.selectFrom('log_entries').selectAll().where('exercise_id', '=', exercise).where('deleted_at', 'is', null).orderBy('client_id').execute());
const ids = (doc: { entries: { id: string }[] } | null | undefined) => (doc?.entries ?? []).map(e => e.id).sort();

describe('one phone', () => {
  it('what it writes is what the server holds, and a second phone sees the same', async () => {
    const a = phone();
    a.api.start();
    await a.set('logs/squat', logs(entry('S1', { n: 'felt heavy', sets: [{ w: 135, r: 5 }] }), tickOf('T1')));
    await a.set('weeks/2026-10-04', { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    await a.set('body/main', { entries: [{ wk: '2026-10-04', d: '2026-10-07', w: 180.5 }] });
    await a.set('stretches/main', { items: [{ id: 'sc', n: 'Scarecrow', group: 'Bands', tier: 'primary' }], experiments: [] });
    await a.set('supplements/main', { waterGoal: 80, waterMode: 'fixed', water: { '2026-10-07': [16, 8] }, boost: {}, items: [{ id: 'cr', n: 'Creatine', slot: 'morning' }], taken: { '2026-10-07': { cr: true } } });
    await a.set('config/main', { mode: 2, rest: 90 });
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['S1', 'T1']);

    const b = phone();
    b.api.start();
    await b.api.syncNow();
    expect(ids(await b.get('logs/squat'))).toEqual(['S1', 'T1']);
    expect(await b.get('weeks/2026-10-04')).toMatchObject({ done: { 'A-d1s1:0': true } });
    expect((await b.get('body/main')).entries).toEqual([{ wk: '2026-10-04', d: '2026-10-07', w: 180.5 }]);
    expect(await b.get('supplements/main')).toMatchObject({ waterGoal: 80, waterMode: 'fixed', water: { '2026-10-07': [16, 8] }, taken: { '2026-10-07': { cr: true } } });
    expect(await b.get('config/main')).toMatchObject({ mode: 2, rest: 90 });
    expect((await b.get('stretches/main')).items.map((i: { id: string }) => i.id)).toEqual(['sc']);
    for (const p of [a, b]) expect(p.api.status()).toMatchObject({ pendingPaths: [], quarantined: 0 });
  });

  it('saving the same documents again sends nothing and changes no version', async () => {
    const a = phone();
    a.api.start();
    await a.set('logs/squat', logs(entry('S1')));
    const before = await db.selectFrom('log_entries').select(['client_id', 'version', 'seq']).execute();
    await a.set('logs/squat', logs(entry('S1')));
    await a.set('logs/squat', logs(entry('S1', { updatedAt: '2026-10-07T12:00:00.000Z' }))); // only updatedAt differs
    expect(await db.selectFrom('log_entries').select(['client_id', 'version', 'seq']).execute()).toEqual(before);
  });

  it('delete, hand-log over a check-off, and Undo all reach the server', async () => {
    const a = phone();
    a.api.start();
    await a.set('logs/squat', logs(tickOf('T1')));
    await a.set('logs/squat', logs(entry('H1', { slot: 's1', wk: '2026-10-04', w: 140 }))); // the session replaces the check-off
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['H1']);
    await a.set('logs/squat', logs(tickOf('T1'))); // Undo
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['T1']);
    await a.set('logs/squat', logs()); // unticked
    expect(await serverEntries()).toEqual([]);
    await a.set('logs/squat', logs(tickOf('T1'))); // Undo of the untick
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['T1']);
    expect(a.api.status()).toMatchObject({ pendingPaths: [], quarantined: 0 });
  });
});

describe('going offline and coming back', () => {
  it('several saves while offline arrive, in the end state, when the network returns', async () => {
    const failures = { n: 1000 };
    const a = phone('owner', memory(), offline(realTransport(), failures));
    await a.set('logs/squat', logs(entry('S1')));
    await a.set('logs/squat', logs(entry('S1'), entry('S2')));
    await a.set('logs/squat', logs(entry('S2', { w: 150 }), entry('S3')));
    await a.set('weeks/2026-10-04', { prog: 'A', done: { x: true }, skipped: {}, moved: {}, ph: {}, warm: {} });
    expect(a.api.status()).toMatchObject({ state: 'paused', pausedBecause: 'network' });
    expect(a.api.status().pendingPaths.sort()).toEqual(['logs/squat', 'weeks/2026-10-04']);
    expect(await serverEntries()).toEqual([]);
    failures.n = 0; // the network is back
    await a.api.resume();
    await eventually(() => expect(a.api.status().pendingPaths).toEqual([]));
    expect((await serverEntries()).map(r => [r.client_id, r.weight_lb])).toEqual([['S2', '150.0000'], ['S3', '135.0000']]);
    expect(a.api.status()).toMatchObject({ state: 'idle', pendingPaths: [], quarantined: 0 });
  });

  it('closing the app while offline and opening it later loses nothing', async () => {
    const storage = memory();
    const failures = { n: 1000 };
    const before = phone('owner', storage, offline(realTransport(), failures));
    await before.set('logs/squat', logs(entry('S1'), entry('S2')));
    await before.set('weeks/2026-10-04', { prog: 'B', done: {}, skipped: {}, moved: {}, ph: {}, warm: {} });
    before.api.stop();
    // later: a new session on the same storage, with the server reachable
    const after = phone('owner', storage);
    expect(ids(await after.get('logs/squat'))).toEqual([]); // not pulled yet, and the app is told nothing until it is
    after.api.start();
    await eventually(() => expect(after.api.status().pendingPaths).toEqual([]));
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['S1', 'S2']);
    expect(await db.selectFrom('weeks').select('data').executeTakeFirstOrThrow()).toMatchObject({ data: { prog: 'B' } });
    expect(after.api.status().pendingPaths).toEqual([]);
  });

  it('a crash between two commands of one save leaves no duplicate and finishes next time', async () => {
    const storage = memory();
    const real = realTransport();
    let calls = 0;
    const dies: Transport = { pull: real.pull, command: async (name, env) => (++calls > 1 ? { ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'killed' } : real.command(name, env)) };
    const before = phone('owner', storage, dies);
    await before.set('logs/squat', logs(entry('S1'), entry('S2'), entry('S3')));
    before.api.stop(); // the browser is closed after the first command was accepted
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['S1']);
    const after = phone('owner', storage);
    after.api.start();
    await eventually(() => expect(after.api.status().pendingPaths).toEqual([]));
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['S1', 'S2', 'S3']);
    expect(await db.selectFrom('log_entries').select('version').execute()).toEqual([{ version: 1 }, { version: 1 }, { version: 1 }]);
  });

  it('a save whose answer was lost is not sent twice', async () => {
    const real = realTransport();
    let lost = true;
    const flaky: Transport = {
      pull: real.pull,
      command: async (name, env) => {
        const out = await real.command(name, env);
        if (lost) { lost = false; return { ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'answer lost' }; }
        return out;
      },
    };
    const a = phone('owner', memory(), flaky);
    a.api.start();
    await a.set('logs/squat', logs(entry('S1')));
    await eventually(() => expect(a.api.status().pendingPaths).toEqual([]));
    expect(await db.selectFrom('log_entries').select(['client_id', 'version']).execute()).toEqual([{ client_id: 'S1', version: 1 }]);
    expect(a.api.status()).toMatchObject({ pendingPaths: [], quarantined: 0 });
  });
});

describe('two phones', () => {
  it('a change on one reaches the other, and an edit on top of it is a normal edit', async () => {
    const a = phone();
    const b = phone();
    a.api.start();
    b.api.start();
    await Promise.all([a.api.syncNow(), b.api.syncNow()]);
    await a.set('logs/squat', logs(entry('S1')));
    await b.api.syncNow();
    expect(ids(await b.get('logs/squat'))).toEqual(['S1']);
    await b.set('logs/squat', logs(entry('S1', { w: 150 })));
    await a.api.syncNow();
    expect((await a.get('logs/squat')).entries[0].w).toBe(150);
    expect((await db.selectFrom('log_entries').select('version').executeTakeFirstOrThrow()).version).toBe(2);
  });

  it('both edit the same entry without seeing each other: the later save wins and nothing is lost to a crash', async () => {
    const a = phone();
    const b = phone();
    a.api.start();
    b.api.start();
    await Promise.all([a.api.syncNow(), b.api.syncNow()]);
    await a.set('logs/squat', logs(entry('S1')));
    await b.api.syncNow();
    await a.set('logs/squat', logs(entry('S1', { w: 140 })));
    await b.set('logs/squat', logs(entry('S1', { w: 150 }))); // b has not pulled a's edit: stale, then resent on top
    const rows = await serverEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weight_lb: '150.0000', version: 3 });
    expect(a.api.status().quarantined + b.api.status().quarantined).toBe(0);
    // the overwritten version is not gone
    expect((await db.selectFrom('row_history').select('version').orderBy('version').execute()).map(r => r.version)).toEqual([1, 2]);
  });

  it('one phone deleting an entry the other has open, and the other then editing it, is set aside, not brought back', async () => {
    const a = phone();
    const b = phone();
    a.api.start();
    b.api.start();
    await Promise.all([a.api.syncNow(), b.api.syncNow()]);
    await a.set('logs/squat', logs(entry('S1'), entry('S2')));
    await b.api.syncNow();
    await a.set('logs/squat', logs(entry('S2'))); // a deletes S1
    await expect(b.set('logs/squat', logs(entry('S1', { w: 999 }), entry('S2')))).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(b.api.quarantined()[0]!.reason).toMatch(/deleted on another device/);
    expect((await serverEntries()).map(r => r.client_id)).toEqual(['S2']);
  });

  it('each phone keeps its own account apart from another user', async () => {
    const mine = phone('owner');
    const theirs = phone('tester');
    mine.api.start();
    theirs.api.start();
    await mine.set('logs/squat', logs(entry('S1')));
    await theirs.api.syncNow();
    expect(await theirs.get('logs/squat')).toBeNull();
  });
});

// A seeded random run: two phones, each the only writer of its own exercise (a check-off written on two phones for one
// card is a separate conflict, handled in D4), both reading everything. After every round, and at the end, the
// invariant holds.
describe('the reconciliation invariant', () => {
  function rng(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

  it.each([1, 2, 3])('seed %i: after any mix of logging, ticking, replacing, deleting and Undo on two phones, both hold what the server holds', async seed => {
    const rand = rng(seed);
    const phones = [phone(), phone()];
    phones.forEach(p => p.api.start());
    await Promise.all(phones.map(p => p.api.syncNow()));
    const exercises = ['squat', 'bench'];
    const docs: { entries: any[] }[] = [{ entries: [] }, { entries: [] }];
    let n = 0;
    const cards = ['s1', 's2', 's3'];

    for (let round = 0; round < 30; round++) {
      const who = Math.floor(rand() * 2);
      const mine = docs[who]!.entries;
      const op = Math.floor(rand() * 6);
      const slot = cards[Math.floor(rand() * cards.length)]!;
      const liveTick = mine.find(e => e.auto && e.slot === slot);
      if (op === 0) mine.push(entry(`E${++n}`, { d: `2026-10-0${1 + Math.floor(rand() * 5)}`, w: 100 + Math.floor(rand() * 100) }));
      else if (op === 1 && !mine.some(e => e.slot === slot)) mine.push(tickOf(`T${++n}`, slot));
      else if (op === 2 && liveTick) mine.splice(mine.indexOf(liveTick), 1); // untick
      else if (op === 3 && liveTick) { mine.splice(mine.indexOf(liveTick), 1); mine.push(entry(`H${++n}`, { slot, wk: '2026-10-04', w: 120 })); } // a session replaces the check-off
      else if (op === 4 && mine.length) mine.splice(Math.floor(rand() * mine.length), 1); // delete
      else if (op === 5 && mine.length) { const e = mine[Math.floor(rand() * mine.length)]; e.w = 90 + Math.floor(rand() * 50); } // edit
      const saved = structuredClone(docs[who]!.entries);
      await phones[who]!.set(`logs/${exercises[who]}`, logs(...saved));
      if (rand() < 0.4) await phones[1 - who]!.api.syncNow();
    }
    for (const p of phones) await p.api.syncNow();
    for (const p of phones) await p.api.syncNow();

    for (const [who, exercise] of exercises.entries()) {
      const want = docs[who]!.entries.map(e => e.id).sort();
      const onServer = (await serverEntries(exercise)).map(r => r.client_id);
      expect(onServer, `server, ${exercise}`).toEqual(want);
      // both phones see the same, with the same content
      const [x, y] = await Promise.all(phones.map(p => p.get(`logs/${exercise}`)));
      expect(ids(x), `phone 0, ${exercise}`).toEqual(want);
      expect(ids(y), `phone 1, ${exercise}`).toEqual(want);
      const weights = (d: any) => Object.fromEntries((d?.entries ?? []).map((e: any) => [e.id, e.w]));
      expect(weights(x)).toEqual(weights(y));
      expect(weights(y)).toEqual(Object.fromEntries((await serverEntries(exercise)).map(r => [r.client_id, Number(r.weight_lb)])));
    }
    // at most one live check-off per card and week
    const ticks = await db.selectFrom('log_entries').select(['exercise_id', 'slot', 'wk']).where('auto', '=', true).where('deleted_at', 'is', null).execute();
    expect(new Set(ticks.map(t => `${t.exercise_id}|${t.slot}|${t.wk}`)).size).toBe(ticks.length);
    for (const p of phones) expect(p.api.status(), 'a phone is stuck').toMatchObject({ pendingPaths: [], quarantined: 0 });
  }, 60_000);
});
