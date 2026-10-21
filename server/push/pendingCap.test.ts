import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminsFrom } from '../admin.ts';
import { createApp } from '../app.ts';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { MAX_PENDING_TASKS, pendingCap } from './pendingCap.ts';
import type { PushJob, PushScheduler } from './scheduler.ts';

// Audit 2026-10-21 S-5: one account may have only MAX_PENDING_TASKS scheduled pushes waiting.
describe('pendingCap', () => {
  it('refuses past the max, counts only tasks still in the future, and gives a failed reservation back', () => {
    const cap = pendingCap(3);
    expect([1, 2, 3, 4].map(i => cap.tryReserve('u', 1000 + i, 0))).toEqual([true, true, true, false]);
    expect(cap.tryReserve('other', 1001, 0)).toBe(true);
    expect(cap.tryReserve('u', 2000, 1002)).toBe(true); // the first two have fired by 1002
    cap.release('u', 2000);
    expect(cap.tryReserve('u', 2001, 1002)).toBe(true);
  });
});

describe('POST /api/push/schedule over the cap', () => {
  let owner: Kysely<DB>; let app: Kysely<DB>; let stop: () => Promise<void>; let server: Server; let base: string;
  const NOW = 1_800_000_000_000;
  const calls: PushJob[] = [];
  const scheduler: PushScheduler = { schedule: async job => { calls.push(job); } };
  const big = { max: 1e6, windowMs: 60_000 };
  beforeAll(async () => {
    let appUrl: string;
    ({ db: owner, stop, appUrl } = await startTestDatabase());
    app = createDb(appUrl);
    server = createApp({ db: app, admins: adminsFrom(''), push: { publicKey: 'K', scheduler, now: () => NOW }, limits: { push: big } as never }).listen(0);
    await new Promise(done => server.once('listening', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);
  afterAll(async () => { await new Promise<void>(done => server.close(() => done())); await app.destroy(); await stop?.(); });

  const dev = (user: string) => ({ 'x-dev-user': user, 'x-client-version': 'test-1', 'content-type': 'application/json' });
  const post = (path: string, body: unknown, user: string) => fetch(`${base}/api/push${path}`, { method: 'POST', headers: dev(user), body: JSON.stringify(body) });
  const endpoint = (user: string) => `https://fcm.googleapis.com/fcm/send/${user}`;

  it('accepts MAX_PENDING_TASKS, answers 429 for the next, and leaves another account alone', async () => {
    for (const u of ['ann', 'bob']) expect((await post('/subscribe', { endpoint: endpoint(u), keys: { p256dh: 'k', auth: 'a' } }, u)).status).toBe(200);
    const job = (u: string, i: number) => ({ endpoint: endpoint(u), kind: 'rest', key: `k${i}`, at: NOW + 60_000 + i, body: 'Rest over.' });
    for (let i = 0; i < MAX_PENDING_TASKS; i++) expect((await post('/schedule', job('ann', i), 'ann')).status).toBe(200);
    const over = await post('/schedule', job('ann', MAX_PENDING_TASKS), 'ann');
    expect(over.status).toBe(429);
    expect(calls).toHaveLength(MAX_PENDING_TASKS);
    expect((await post('/schedule', job('bob', 0), 'bob')).status).toBe(200);
  }, 120_000);
});
