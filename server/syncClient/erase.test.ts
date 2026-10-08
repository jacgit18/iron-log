import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApiDb } from '../../src/sync/apiDb.ts';
import { createTransport } from '../../src/sync/transport.ts';
import { createApp } from '../app.ts';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';

// Erasing an account's data from one phone, with the real client against the real API (as the restricted role) on a real Postgres:
// the phone that erased forgets everything, and another phone of the same account drops its copy at its next pull.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
  server = createApp({ db: app }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await app.destroy();
  await stop?.();
});
beforeEach(async () => {
  await owner.deleteFrom('users').execute();
});

const memory = () => {
  const data = new Map<string, string>();
  return { data, get: (k: string) => (data.has(k) ? JSON.parse(data.get(k)!) : null), set: (k: string, v: unknown) => (data.set(k, JSON.stringify(v)), true), remove: (k: string) => void data.delete(k) };
};
const phone = (user = 'owner') => {
  const transport = createTransport({ clientVersion: 'test-1', baseUrl: base, headers: () => ({ 'x-dev-user': user }) });
  const storage = memory();
  return { api: createApiDb({ transport, storage, pollMs: 0, sleep: () => Promise.resolve(), random: () => 0.5 }), storage };
};
const entry = (id: string) => ({ id, d: '2026-10-05', ph: 'strength', w: 135, s: 3, r: 5, n: 'private note' });
const rowCount = async () => Number((await owner.selectFrom('log_entries').select(owner.fn.countAll().as('n')).executeTakeFirstOrThrow()).n);

describe('erasing everything from one phone', () => {
  it('removes the rows from the database for good, and another phone of the account drops its copy', async () => {
    const a = phone();
    const b = phone();
    a.api.start();
    b.api.start();
    await a.api.syncNow();
    await a.api.doc('logs/squat').set({ schema: 1, entries: [entry('e1'), entry('e2')] });
    await a.api.doc('body/main').set({ entries: [{ wk: '2026-10-04', d: '2026-10-07', w: 180.5 }] });
    await b.api.syncNow();
    expect((await b.api.doc('logs/squat').get()).data().entries).toHaveLength(2);
    expect(await rowCount()).toBe(2);

    expect(await a.api.eraseEverything('data')).toEqual({ ok: true });
    expect(await rowCount()).toBe(0); // gone, not tombstoned: no note or weight is left to read
    const history = await owner.selectFrom('row_history').select('row_id').execute();
    expect(history).toEqual([]);

    await b.api.syncNow();
    expect((await b.api.doc('logs/squat').get()).exists).toBe(false);
    expect((await b.api.doc('body/main').get()).exists).toBe(false);
    expect(b.api.status()).toMatchObject({ holdsData: false, ready: true });
  });

  it('after the other phone has caught up it can write again, and the new data is the account\'s data', async () => {
    const a = phone();
    const b = phone();
    a.api.start();
    b.api.start();
    await a.api.syncNow();
    await a.api.doc('logs/squat').set({ schema: 1, entries: [entry('e1')] });
    await b.api.syncNow();
    await a.api.eraseEverything('data');
    await b.api.syncNow();
    await b.api.doc('logs/squat').set({ schema: 1, entries: [entry('fresh')] });
    expect(await rowCount()).toBe(1);
    const c = phone();
    c.api.start();
    await c.api.syncNow();
    expect((await c.api.doc('logs/squat').get()).data().entries.map((e: { id: string }) => e.id)).toEqual(['fresh']);
  });

  it('another account is untouched', async () => {
    const mine = phone('ann');
    const theirs = phone('bob');
    mine.api.start();
    theirs.api.start();
    await mine.api.syncNow();
    await theirs.api.syncNow();
    await mine.api.doc('logs/squat').set({ schema: 1, entries: [entry('a1')] });
    await theirs.api.doc('logs/squat').set({ schema: 1, entries: [entry('b1')] });
    await mine.api.eraseEverything('data');
    expect(await rowCount()).toBe(1);
    await theirs.api.syncNow();
    expect((await theirs.api.doc('logs/squat').get()).data().entries).toHaveLength(1);
  });
});
