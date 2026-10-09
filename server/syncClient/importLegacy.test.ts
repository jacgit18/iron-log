import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AccountState } from '../../src/sync/account.ts';
import { createApiDb } from '../../src/sync/apiDb.ts';
import { legacyDocs, planLegacy } from '../../src/sync/legacy.ts';
import { createTransport } from '../../src/sync/transport.ts';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';

// The phone's one-time upload against the real API on a real Postgres: what a browser held before accounts goes in as one
// transaction, comes back through the normal pull as the same documents, and can never be done twice.
let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;

beforeAll(async () => {
  const { startTestDatabase } = await import('../test/postgres.ts');
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
const phone = (user = 'owner') => {
  const transport = createTransport({ clientVersion: 'test-1', baseUrl: base, headers: () => ({ 'x-dev-user': user }) });
  const identity = async (): Promise<AccountState> => ({ status: 'signed-in', userId: user, kind: 'dev', email: null, name: null, isAdmin: false });
  const storage = memory();
  const api = createApiDb({ transport, storage, identity, pollMs: 0, sleep: () => Promise.resolve(), random: () => 0.5 });
  return { api, storage };
};

const e = (over: object = {}) => ({ d: '2026-09-28', ph: 'strength', w: 100, s: 3, r: 8, ...over });
const program = { days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `A-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: 135 }] }] })) };
const old = new Map<string, unknown>(Object.entries({
  // two exercises with identical old entries (no ids): the collision the real data once had
  'logs/dip': { schema: 1, entries: [e()] },
  'logs/kneeraise': { schema: 1, entries: [e()] },
  'logs/squat': { schema: 1, entries: [e({ id: 'mine', d: '2026-09-29', n: 'felt good' }), e({ id: 'tick', d: '2026-09-30', auto: true, slot: 'A-d1s1', wk: '2026-09-27' })] },
  'body/main': { entries: [{ wk: '2026-09-27', d: '2026-09-28', w: 180.5 }] },
  'weeks/2026-09-27': { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} },
  'stretchweeks/2026-09-27': { done: {}, skipped: {}, extra: [] },
  'programs/A': program,
  'stretches/main': { items: [{ id: 'sc', n: 'Scarecrow', group: 'Bands', tier: 'primary' }], experiments: [] },
  'supplements/main': { waterGoal: 80, waterMode: 'fixed', water: { '2026-09-28': [16, 8] }, boost: {}, items: [{ id: 'cr', n: 'Creatine', slot: 'morning' }], taken: { '2026-09-28': { cr: true } } },
  'config/main': { mode: 2, rest: 90, ghBackup: { repo: 'a/b', token: 'ghp_secret' } },
}));
const count = async () => Number((await db.selectFrom('log_entries').select(db.fn.countAll().as('n')).executeTakeFirstOrThrow()).n);

describe('uploading what a browser held before accounts', () => {
  it('goes in whole, comes back through the pull as the same documents, and both colliding entries survive', async () => {
    const plan = planLegacy(old);
    expect(plan.renamed).toBe(1);
    const a = phone();
    a.api.start();
    await a.api.syncNow();
    const out = await a.api.importLegacy(plan.commands);
    expect(out).toMatchObject({ ok: true, total: plan.commands.length });

    expect(await count()).toBe(4); // dip, kneeraise, squat session, squat check-off
    const ids = (await db.selectFrom('log_entries').select('client_id').execute()).map(r => r.client_id).sort();
    expect(ids.filter(i => i.endsWith('-2'))).toHaveLength(1);

    // the phone now holds the same documents the old browser did
    const squat = (await a.api.doc('logs/squat').get()).data() as { entries: { id: string; n?: string }[] };
    expect(squat.entries.map(x => x.id).sort()).toEqual(['mine', 'tick']);
    expect((await a.api.doc('logs/dip').get()).data().entries).toHaveLength(1);
    expect((await a.api.doc('logs/kneeraise').get()).data().entries).toHaveLength(1);
    expect((await a.api.doc('body/main').get()).data().entries).toEqual([{ wk: '2026-09-27', d: '2026-09-28', w: 180.5 }]);
    expect((await a.api.doc('config/main').get()).data()).toMatchObject({ mode: 2, rest: 90 });
    expect((await a.api.doc('supplements/main').get()).data()).toMatchObject({ waterGoal: 80, waterMode: 'fixed' });
    expect(JSON.stringify((await db.selectFrom('config').selectAll().execute()))).not.toContain('ghp_secret');

    // and a second phone signing in as the same user sees it all
    const b = phone();
    b.api.start();
    await b.api.syncNow();
    expect((await b.api.doc('logs/squat').get()).data().entries).toHaveLength(2);
  });

  it('cannot be done twice, by the same phone or another one that still holds old data', async () => {
    const plan = planLegacy(old);
    const a = phone();
    a.api.start();
    await a.api.syncNow();
    expect((await a.api.importLegacy(plan.commands)).ok).toBe(true);
    const b = phone();
    b.api.start();
    await b.api.syncNow();
    expect(await b.api.importLegacy(plan.commands)).toMatchObject({ ok: false, class: 'not-empty' });
    expect(await count()).toBe(4);
  });

  it('is not offered to a phone that already holds something, even before it reaches the server', async () => {
    const a = phone();
    a.api.start();
    await a.api.syncNow();
    await a.api.doc('body/main').set({ entries: [{ wk: '2026-09-27', d: '2026-09-28', w: 170 }] });
    expect(await a.api.importLegacy(planLegacy(old).commands)).toMatchObject({ ok: false, class: 'not-empty' });
  });

  it('legacyDocs reads only what the sync knows', () => {
    const store: Record<string, unknown> = { 'logs/squat': { entries: [] }, appearance: { theme: 'dark' } };
    expect([...legacyDocs(Object.keys(store), p => store[p]).keys()]).toEqual(['logs/squat']);
  });
});
