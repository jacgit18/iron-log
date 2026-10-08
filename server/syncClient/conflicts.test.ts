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

// Two phones changing the same things (build spec phase D, increment D4; ADR 003, FM-04, FM-05, FM-06). The rules:
// this device wins a stale edit; a card ticked elsewhere beats this device's skip; a delete never wins silently over a
// later edit; an edit of something deleted elsewhere is set aside, not brought back; one check-off per card and week.
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

function phone(user = 'owner', storage = memory(), transport: Transport = realTransport(user)) {
  const api = createApiDb({ transport, storage, sleep: quickSleep, pollMs: 0, random: () => 0.5 });
  return { api, storage, get: async (path: string) => (await api.doc(path).get()).data() as any, set: (path: string, doc: unknown) => api.doc(path).set(doc) };
}
const twoPhones = async () => {
  const a = phone();
  const b = phone();
  a.api.start();
  b.api.start();
  await Promise.all([a.api.syncNow(), b.api.syncNow()]);
  return { a, b };
};
const offline = (real: Transport, down: { on: boolean }): Transport => ({
  command: async (name, env) => (down.on ? { ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'offline' } : real.command(name, env)),
  pull: async (since, limit) => (down.on ? { ok: false, class: 'network', status: 0, retryAfterMs: null, message: 'offline' } : real.pull(since, limit)),
});

const entry = (id: string, over: object = {}) => ({ id, d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5, ...over });
const tickOf = (id: string, slot = 's1', over: object = {}) => entry(id, { auto: true, slot, wk: '2026-10-04', ...over });
const logs = (...entries: object[]) => ({ schema: 1, entries });
const ids = (doc: { entries: { id: string }[] } | null | undefined) => (doc?.entries ?? []).map(e => e.id).sort();
const live = (exercise = 'squat') => db.selectFrom('log_entries').selectAll().where('exercise_id', '=', exercise).where('deleted_at', 'is', null).orderBy('client_id').execute();
const week = (over: object = {}) => ({ prog: 'A', done: {}, skipped: {}, moved: {}, ph: {}, warm: {}, ...over });

describe('one check-off per card and week (FM-06)', () => {
  it('two phones tick the same card: the first wins and the second adopts it', async () => {
    const { a, b } = await twoPhones();
    await a.set('logs/squat', logs(tickOf('TA')));
    await b.set('logs/squat', logs(tickOf('TB'))); // b has not pulled
    expect((await live()).map(r => r.client_id)).toEqual(['TA']);
    await b.api.syncNow();
    expect(ids(await b.get('logs/squat'))).toEqual(['TA']);
    expect(b.api.status().quarantined).toBe(0);
    expect(b.api.status().notices.map(n => n.text)).toEqual(['This card was already checked off or logged on another device, so your tick was not added.']);
    await a.api.syncNow();
    expect(ids(await a.get('logs/squat'))).toEqual(['TA']);
  });

  it('the second phone is told through its snapshot, not left showing a tick that is not there', async () => {
    const { a, b } = await twoPhones();
    await a.set('logs/squat', logs(tickOf('TA')));
    const seen: string[][] = [];
    b.api.doc('logs/squat').onSnapshot(s => seen.push(ids(s.exists ? s.data() : null)));
    await eventually(() => expect(seen.length).toBeGreaterThan(0));
    seen.length = 0;
    await b.set('logs/squat', logs(entry('mine'), tickOf('TB')));
    // its own session stays, its tick became the one that was already there
    await eventually(() => expect(seen.at(-1)).toEqual(['TA', 'mine']));
  });

  it('a phone ticks a card that already has a logged session: the tick is dropped', async () => {
    const { a, b } = await twoPhones();
    await a.set('logs/squat', logs(entry('H1', { slot: 's1', wk: '2026-10-04' })));
    await b.set('logs/squat', logs(tickOf('TB')));
    expect((await live()).map(r => r.client_id)).toEqual(['H1']);
    await b.api.syncNow();
    expect(ids(await b.get('logs/squat'))).toEqual(['H1']);
  });

  it("a session logged on one phone replaces the other's check-off, as it would on one phone", async () => {
    const { a, b } = await twoPhones();
    await a.set('logs/squat', logs(tickOf('TA')));
    await b.api.syncNow();
    await b.set('logs/squat', logs(entry('H1', { slot: 's1', wk: '2026-10-04', w: 140 })));
    await a.api.syncNow();
    expect(ids(await a.get('logs/squat'))).toEqual(['H1']);
    expect((await live()).map(r => r.client_id)).toEqual(['H1']);
  });
});

describe('a card ticked elsewhere beats this phone\'s skip', () => {
  it('a stale week that skips a card the other phone ticked ends with the card done', async () => {
    const { a, b } = await twoPhones();
    await a.set('weeks/2026-10-04', week());
    await b.api.syncNow();
    await a.set('weeks/2026-10-04', week({ done: { x: true } }));
    await b.set('weeks/2026-10-04', week({ skipped: { x: true, y: true } })); // b has not pulled a's tick
    const row = await db.selectFrom('weeks').select('data').executeTakeFirstOrThrow();
    expect(row.data).toMatchObject({ done: { x: true }, skipped: { y: true } });
    expect(b.api.status().notices.map(n => n.text)).toContain('A card you skipped was ticked on another device, so it is shown as done.');
    expect((await b.get('weeks/2026-10-04')).done).toEqual({ x: true });
  });

  it('the other way round, a stale tick over a skip is simply the later write', async () => {
    const { a, b } = await twoPhones();
    await a.set('weeks/2026-10-04', week());
    await b.api.syncNow();
    await a.set('weeks/2026-10-04', week({ skipped: { x: true } }));
    await b.set('weeks/2026-10-04', week({ done: { x: true } }));
    expect(await db.selectFrom('weeks').select('data').executeTakeFirstOrThrow()).toMatchObject({ data: { done: { x: true }, skipped: {} } });
  });

  it('anything else in a stale week is this phone\'s: it wins, and the replaced week stays in row_history', async () => {
    const { a, b } = await twoPhones();
    await a.set('weeks/2026-10-04', week());
    await b.api.syncNow();
    await a.set('weeks/2026-10-04', week({ moved: { m: 3 }, done: { a: true } }));
    await b.set('weeks/2026-10-04', week({ moved: { m: 5 } }));
    const row = await db.selectFrom('weeks').select(['data', 'version']).executeTakeFirstOrThrow();
    expect(row.data).toMatchObject({ moved: { m: 5 }, done: {} });
    expect(row.version).toBe(3);
    expect((await db.selectFrom('row_history').select('version').orderBy('version').execute()).map(r => r.version)).toEqual([1, 2]);
  });
});

describe('delete meets edit (FM-05)', () => {
  it('a delete of an entry the other phone edited since is not applied: the edit is kept, and the phone is told', async () => {
    const { a, b } = await twoPhones();
    await a.set('logs/squat', logs(entry('S1'), entry('S2')));
    await b.api.syncNow();
    await a.set('logs/squat', logs(entry('S1', { w: 150 }), entry('S2'))); // a edits S1
    await b.set('logs/squat', logs(entry('S2'))); // b, who has not seen that, deletes S1
    expect((await live()).map(r => [r.client_id, r.weight_lb])).toEqual([['S1', '150.0000'], ['S2', '135.0000']]);
    expect(b.api.status()).toMatchObject({ quarantined: 0, pendingPaths: [] });
    expect(b.api.status().notices.map(n => n.text)).toEqual(['Something you deleted was changed on another device first, so it was kept.']);
    expect((await b.get('logs/squat')).entries.find((e: { id: string }) => e.id === 'S1').w).toBe(150);
  });

  it('only the delete is skipped: the rest of the same save goes through', async () => {
    const { a, b } = await twoPhones();
    await a.set('logs/squat', logs(entry('S1'), entry('S2')));
    await b.api.syncNow();
    await a.set('logs/squat', logs(entry('S1', { w: 150 }), entry('S2')));
    await b.set('logs/squat', logs(entry('S2', { w: 99 }), entry('S3'))); // delete S1 (stale), edit S2, add S3
    expect((await live()).map(r => [r.client_id, r.weight_lb])).toEqual([['S1', '150.0000'], ['S2', '99.0000'], ['S3', '135.0000']]);
    expect(b.api.status().quarantined).toBe(0);
  });

  it('an edit of an entry the other phone deleted is set aside, not brought back', async () => {
    const { a, b } = await twoPhones();
    await a.set('logs/squat', logs(entry('S1'), entry('S2')));
    await b.api.syncNow();
    await a.set('logs/squat', logs(entry('S2')));
    await expect(b.set('logs/squat', logs(entry('S1', { w: 999 }), entry('S2')))).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(b.api.quarantined()[0]!.reason).toMatch(/deleted on another device/);
    expect((await live()).map(r => r.client_id)).toEqual(['S2']);
    await b.api.syncNow();
    expect(ids(await b.get('logs/squat'))).toEqual(['S2']); // what the server holds is what it shows again
  });

  it('a delete of a week another phone changed is kept too', async () => {
    const { a, b } = await twoPhones();
    await a.set('weeks/2026-10-04', week());
    await b.api.syncNow();
    await a.set('weeks/2026-10-04', week({ done: { x: true } }));
    await b.api.doc('weeks/2026-10-04').delete();
    expect(await db.selectFrom('weeks').select(['deleted_at', 'data']).executeTakeFirstOrThrow()).toMatchObject({ deleted_at: null, data: { done: { x: true } } });
    expect((await b.get('weeks/2026-10-04')).done).toEqual({ x: true });
  });
});

describe('a pull never replaces what this phone has not sent (FM-04)', () => {
  it('while offline, the phone keeps showing its own unsent week, and after reconnecting its change lands on top', async () => {
    const down = { on: false };
    const a = phone();
    const b = phone('owner', memory(), offline(realTransport(), down));
    a.api.start();
    b.api.start();
    await Promise.all([a.api.syncNow(), b.api.syncNow()]);
    await a.set('weeks/2026-10-04', week());
    await b.api.syncNow();
    down.on = true;
    await b.set('weeks/2026-10-04', week({ done: { mine: true } })); // unsent
    await a.set('weeks/2026-10-04', week({ done: { theirs: true } })); // meanwhile, on the other phone
    // pulls and sends take turns, so nothing from the other phone can land while this phone's change is unsent
    expect((await b.get('weeks/2026-10-04')).done).toEqual({ mine: true });
    expect(b.api.status().pendingPaths).toEqual(['weeks/2026-10-04']);
    down.on = false;
    await b.api.resume();
    await eventually(() => expect(b.api.status().pendingPaths).toEqual([]));
    expect(await db.selectFrom('weeks').select('data').executeTakeFirstOrThrow()).toMatchObject({ data: { done: { mine: true } } });
    expect(b.api.status()).toMatchObject({ pendingPaths: [], quarantined: 0 });
    await a.api.syncNow();
    expect((await a.get('weeks/2026-10-04')).done).toEqual({ mine: true });
  });

  it('an entry only the other phone has is not lost to this phone\'s unsent changes to other entries', async () => {
    const down = { on: false };
    const a = phone();
    const b = phone('owner', memory(), offline(realTransport(), down));
    a.api.start();
    b.api.start();
    await Promise.all([a.api.syncNow(), b.api.syncNow()]);
    await a.set('logs/squat', logs(entry('S1')));
    await b.api.syncNow();
    down.on = true;
    await b.set('logs/squat', logs(entry('S1', { w: 140 }))); // b edits S1, offline
    await a.set('logs/squat', logs(entry('S1'), entry('S2'))); // a adds S2 meanwhile
    down.on = false;
    await b.api.resume();
    await eventually(() => expect(b.api.status().pendingPaths).toEqual([]));
    await a.api.syncNow();
    // this phone's document had no S2, so this phone's save deletes it? No: b never saw S2, so it has no row to delete.
    expect((await live()).map(r => r.client_id)).toEqual(['S1', 'S2']);
    expect(Number((await live())[0]!.weight_lb)).toBe(140);
  });
});

describe('the rule that stops a loop', () => {
  it('a row that keeps being changed by the other phone is set aside after a few tries, not retried forever', async () => {
    const real = realTransport();
    const a = phone();
    a.api.start();
    await a.api.syncNow();
    await a.set('logs/squat', logs(entry('S1')));
    // another phone edits S1 again every time this one tries
    let n = 0;
    const racing: Transport = {
      pull: real.pull,
      command: async (name, env) => {
        if (name === 'log-session' && env.baseVersion !== null) {
          await db.updateTable('log_entries').set({ version: 2 + ++n, seq: String(1000 + n), weight_lb: String(200 + n) }).where('client_id', '=', 'S1').execute();
        }
        return real.command(name, env);
      },
    };
    const b = phone('owner', memory(), racing);
    b.api.start();
    await b.api.syncNow();
    await expect(b.set('logs/squat', logs(entry('S1', { w: 140 })))).rejects.toMatchObject({ code: 'invalid_argument' });
    expect(b.api.quarantined()[0]!.reason).toMatch(/kept changing/);
  });
});

// Two phones writing the same exercise, each starting from what its own app shows, with pulls at random. After everything
// settles both phones and the server hold the same entries, and there is at most one check-off per card and week.
describe('two phones, one exercise: they end equal', () => {
  function rng(seed: number) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

  it.each([1, 2, 3, 4, 5, 6])('seed %i', async seed => {
    const rand = rng(seed);
    const phones = [phone(), phone()];
    phones.forEach(p => p.api.start());
    await Promise.all(phones.map(p => p.api.syncNow()));
    const cards = ['s1', 's2', 's3'];
    let n = 0;

    for (let round = 0; round < 40; round++) {
      const who = Math.floor(rand() * 2);
      const p = phones[who]!;
      const view: any[] = structuredClone((await p.get('logs/squat'))?.entries ?? []); // what this phone's app shows now
      const slot = cards[Math.floor(rand() * cards.length)]!;
      const tick = view.find(e => e.auto && e.slot === slot);
      const op = Math.floor(rand() * 6);
      if (op === 0) view.push(entry(`E${seed}-${++n}`, { w: 100 + Math.floor(rand() * 100) }));
      else if (op === 1 && !view.some(e => e.slot === slot)) view.push(tickOf(`T${seed}-${++n}`, slot));
      else if (op === 2 && tick) view.splice(view.indexOf(tick), 1);
      else if (op === 3 && tick) { view.splice(view.indexOf(tick), 1); view.push(entry(`H${seed}-${++n}`, { slot, wk: '2026-10-04', w: 120 })); }
      else if (op === 4 && view.length) view.splice(Math.floor(rand() * view.length), 1);
      else if (op === 5 && view.length) view[Math.floor(rand() * view.length)].w = 90 + Math.floor(rand() * 50);
      await p.set('logs/squat', logs(...view)).catch(() => undefined); // a set-aside write rejects; the phone carries on
      if (rand() < 0.35) await phones[1 - who]!.api.syncNow();
    }
    for (let i = 0; i < 2; i++) for (const p of phones) await p.api.syncNow();

    const onServer = await live();
    const want = onServer.map(r => r.client_id).sort();
    const [x, y] = await Promise.all(phones.map(p => p.get('logs/squat')));
    expect(ids(x), 'phone 0').toEqual(want);
    expect(ids(y), 'phone 1').toEqual(want);
    const weights = (d: any) => Object.fromEntries((d?.entries ?? []).map((e: any) => [e.id, e.w]));
    expect(weights(x)).toEqual(weights(y));
    expect(weights(y)).toEqual(Object.fromEntries(onServer.map(r => [r.client_id, Number(r.weight_lb)])));
    const ticks = onServer.filter(r => r.auto);
    expect(new Set(ticks.map(t => `${t.slot}|${t.wk}`)).size, 'two check-offs for one card').toBe(ticks.length);
    for (const p of phones) expect(p.api.status(), 'a phone is stuck').toMatchObject({ pendingPaths: [] });
  }, 90_000);
});
