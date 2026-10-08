import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { documentFor, parsePath, type PathKind } from '../../src/sync/documents.ts';
import { createMirrorStore } from '../../src/sync/mirrorStore.ts';
import { pullAll } from '../../src/sync/pull.ts';
import { createTransport } from '../../src/sync/transport.ts';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';

// The sync client's transport, mirror and pull against the real API on a real Postgres: whatever the server really sends
// must read back into the documents the store expects.
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

const transportFor = (user: string) => createTransport({ clientVersion: 'test', baseUrl: base, headers: () => ({ 'x-dev-user': user }) });
const memory = () => {
  const data = new Map<string, string>();
  return { data, get: (k: string) => (data.has(k) ? JSON.parse(data.get(k)!) : null), set: (k: string, v: unknown) => (data.set(k, JSON.stringify(v)), true), remove: (k: string) => void data.delete(k) };
};
const kind = (path: string) => parsePath(path) as PathKind;

async function send(user: string, name: string, input: unknown, baseVersion: number | null = null, clientId = `${name}-${Math.random()}`) {
  const out = await transportFor(user).command(name as never, { clientId, baseVersion, input });
  expect(out.ok, `${name}: ${JSON.stringify(out)}`).toBe(true);
  return out;
}

const program = () => ({ days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `A-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: 135 }] }] })) });

describe('pulling what the real API holds', () => {
  it('every table comes back as the document the store reads', async () => {
    const u = 'owner';
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-05', ph: 'strength', w: 135.5, s: 3, r: 5, sets: [{ w: 135.5, r: 5 }], n: 'felt heavy', updatedAt: '2026-10-05T12:00:00.000Z' } }, null, 'L1');
    await send(u, 'tick-card', { exerciseId: 'squat', entry: { d: '2026-10-06', ph: 'iso', s: 3, sec: 30, slot: 'A-d2s1', wk: '2026-10-04', auto: true } }, null, 'T1');
    await send(u, 'log-body-weight', { wk: '2026-10-04', d: '2026-10-07', w: 180.5 });
    await send(u, 'save-week', { weekStart: '2026-10-04', week: { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} } });
    await send(u, 'save-stretch-week', { weekStart: '2026-10-04', week: { done: { '0:scarecrow': true }, skipped: {}, extra: [] } });
    await send(u, 'save-supplement-day', { day: '2026-10-07', water: [16, 8], boost: { hot: true, mins: 45 }, taken: { creatine: true } });
    await send(u, 'save-program', { key: 'A', program: program() });
    await send(u, 'save-config', { config: { mode: 2, rest: 90, waterGoal: 80, waterMode: 'fixed' } });
    await send(u, 'save-library-item', { item: { id: 'v1', name: 'Cut', from: 'A', at: '2026-10-05T10:00:00Z', prog: program() } });
    await send(u, 'save-list-item', { list: 'stretch', item: { id: 's1', n: 'Scarecrow', group: 'Bands', tier: 'primary' }, position: 0 });
    await send(u, 'save-list-item', { list: 'stretch_experiment', item: { id: 'se1', n: 'Pigeon' }, position: 0 });
    await send(u, 'save-list-item', { list: 'experiment', item: { id: 'x1', ex: 'squat', ph: 'hyp', note: 'try' }, position: 0 });
    await send(u, 'save-list-item', { list: 'supplement_item', item: { id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' }, position: 0 });

    const store = createMirrorStore(memory());
    const out = await pullAll(transportFor(u), store);
    expect(out).toMatchObject({ ok: true, pages: 1, rows: 13 });
    const m = store.rows();
    const doc = (p: string) => documentFor(kind(p), m) as any;

    expect(doc('logs/squat').entries.map((e: any) => e.id)).toEqual(['L1', 'T1']);
    expect(doc('logs/squat').entries[0]).toEqual({ d: '2026-10-05', ph: 'strength', w: 135.5, s: 3, r: 5, sets: [{ w: 135.5, r: 5 }], n: 'felt heavy', id: 'L1', updatedAt: '2026-10-05T12:00:00.000Z' });
    expect(doc('logs/squat').entries[1]).toEqual({ d: '2026-10-06', ph: 'iso', s: 3, sec: 30, slot: 'A-d2s1', wk: '2026-10-04', id: 'T1', auto: true });
    expect(doc('body/main').entries).toEqual([{ wk: '2026-10-04', d: '2026-10-07', w: 180.5 }]);
    expect(doc('weeks/2026-10-04')).toMatchObject({ prog: 'A', done: { 'A-d1s1:0': true } });
    expect(doc('stretchweeks/2026-10-04')).toEqual({ done: { '0:scarecrow': true }, skipped: {}, extra: [] });
    expect(doc('programs/A').days).toHaveLength(7);
    expect(doc('config/main')).toEqual({ mode: 2, rest: 90 });
    expect(doc('library/main').items[0]).toMatchObject({ id: 'v1', name: 'Cut', from: 'A' });
    expect(doc('experiments/main').items).toEqual([{ id: 'x1', ex: 'squat', ph: 'hyp', note: 'try' }]);
    expect(doc('stretches/main')).toEqual({ items: [{ id: 's1', n: 'Scarecrow', group: 'Bands', tier: 'primary' }], experiments: [{ id: 'se1', n: 'Pigeon' }] });
    expect(doc('supplements/main')).toEqual({
      waterGoal: 80, waterMode: 'fixed', water: { '2026-10-07': [16, 8] }, boost: { '2026-10-07': { hot: true, mins: 45 } },
      items: [{ id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' }], taken: { '2026-10-07': { creatine: true } },
    });
  });

  it('a second pull brings only what changed, tombstones included', async () => {
    const u = 'owner';
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } }, null, 'L1');
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-06', w: 140 } }, null, 'L2');
    const store = createMirrorStore(memory());
    await pullAll(transportFor(u), store);
    expect(store.cursor()).not.toBe('0');

    await send(u, 'delete-entry', { entryId: 'L1' }, 1);
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-06', w: 145 } }, 1, 'L2');
    const second = await pullAll(transportFor(u), store);
    expect(second).toMatchObject({ ok: true, rows: 2, paths: ['logs/squat'] });
    expect(store.rows().get('log_entries|L1')).toMatchObject({ deleted: true, version: 2 });
    expect((documentFor(kind('logs/squat'), store.rows()) as any).entries).toEqual([expect.objectContaining({ id: 'L2', w: 145 })]);
    expect(await pullAll(transportFor(u), store)).toMatchObject({ ok: true, rows: 0, paths: [] });
  });

  it('a reload keeps the mirror, and it only pulls what came after', async () => {
    const u = 'owner';
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } }, null, 'L1');
    const storage = memory();
    await pullAll(transportFor(u), createMirrorStore(storage));
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-06', w: 140 } }, null, 'L2');
    const reloaded = createMirrorStore(storage);
    expect([...reloaded.rows().keys()]).toEqual(['log_entries|L1']);
    expect(await pullAll(transportFor(u), reloaded)).toMatchObject({ ok: true, rows: 1 });
    expect(reloaded.rows().size).toBe(2);
  });

  it('pages through more rows than one page holds', async () => {
    const u = 'owner';
    for (let i = 1; i <= 7; i++) await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-05', w: 100 + i } }, null, `L${i}`);
    const store = createMirrorStore(memory());
    const out = await pullAll(transportFor(u), store, 3);
    expect(out).toMatchObject({ ok: true, pages: 3, rows: 7 });
    expect(store.rows().size).toBe(7);
  });

  it('each user sees only their own rows', async () => {
    await send('owner', 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } }, null, 'L1');
    const store = createMirrorStore(memory());
    expect(await pullAll(transportFor('tester'), store)).toMatchObject({ ok: true, rows: 0 });
    expect(store.rows().size).toBe(0);
  });

  it('without a sign-in the pull waits with an auth failure and applies nothing', async () => {
    const store = createMirrorStore(memory());
    const out = await pullAll(createTransport({ clientVersion: 'test', baseUrl: base }), store);
    expect(out).toMatchObject({ ok: false, class: 'auth' });
    expect(store.rows().size).toBe(0);
  });

  it('commands go through the same transport: a conflict carries the row the server holds', async () => {
    const u = 'owner';
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } }, null, 'L1');
    await send(u, 'log-session', { exerciseId: 'squat', entry: { d: '2026-10-05', w: 140 } }, 1, 'L1');
    const stale = await transportFor(u).command('log-session', { clientId: 'L1', baseVersion: 1, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 150 } } });
    expect(stale).toMatchObject({ ok: false, class: 'conflict', reason: 'stale', current: { client_id: 'L1', version: 2 } });
    const refused = await transportFor(u).command('log-session', { clientId: 'x', baseVersion: null, input: { exerciseId: 'squat', entry: { d: 'nope' } } });
    expect(refused).toMatchObject({ ok: false, class: 'refused', reason: 'invalid-input' });
    // the conflict's row can be put straight into the mirror
    const store = createMirrorStore(memory());
    if (!stale.ok && stale.class === 'conflict') store.apply('log_entries', [stale.current!]);
    expect(store.rows().get('log_entries|L1')).toMatchObject({ version: 2, entry: { w: 140 } });
  });
});
