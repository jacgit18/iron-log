import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminsFrom } from '../admin.ts';
import { createApp } from '../app.ts';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import type { PushJob, PushScheduler } from './scheduler.ts';

// The push routes (ADR 044, PR 3) through the real API as the restricted role, with a fake scheduler standing in for Cloud Tasks.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;
const NOW = 1_800_000_000_000;
const calls: PushJob[] = [];
let failSchedule = false;
const scheduler: PushScheduler = {
  schedule: async job => { if (failSchedule) throw new Error('boom'); calls.push(job); },
};
const pending = async () => (await owner.selectFrom('push_subscription').select(['endpoint', 'pending']).orderBy('id').execute()).map(r => [r.endpoint, r.pending]);

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
  server = createApp({ db: app, admins: adminsFrom('dev:ann,dev:cat'), push: { publicKey: 'PUBLICKEY', scheduler, now: () => NOW }, limits: { push: { max: 40, windowMs: 60_000 } } }).listen(0);
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
  calls.length = 0;
  failSchedule = false;
});

const dev = (user: string) => ({ 'x-dev-user': user, 'x-client-version': 'test-1', 'content-type': 'application/json' });
const post = (path: string, body: unknown, user = 'ann') => fetch(`${base}/api/push${path}`, { method: 'POST', headers: dev(user), body: JSON.stringify(body) });
const endpointOf = (n: number) => `https://push.example/device-${n}`;
const sub = (n: number) => ({ endpoint: endpointOf(n), keys: { p256dh: `k${n}`, auth: `a${n}` } });
const rows = () => owner.selectFrom('push_subscription').innerJoin('users', 'users.id', 'push_subscription.user_id').select(['push_subscription.endpoint', 'push_subscription.p256dh', 'users.auth_user_id']).orderBy('push_subscription.id').execute();

describe('who may use it', () => {
  it('refuses a signed-in account that is not an admin, on every route, and writes nothing', async () => {
    for (const [path, body] of [['/subscribe', sub(1)], ['/unsubscribe', { endpoint: endpointOf(1) }], ['/schedule', {}], ['/cancel', {}]] as const) {
      expect((await post(path, body, 'bob')).status, path).toBe(403);
    }
    expect((await fetch(`${base}/api/push/key`, { headers: dev('bob') })).status).toBe(403);
    expect(await rows()).toEqual([]);
  });
  it('refuses someone who is not signed in', async () => {
    expect((await fetch(`${base}/api/push/key`)).status).toBe(401);
  });
  it('gives an admin the public key', async () => {
    const res = await fetch(`${base}/api/push/key`, { headers: dev('ann') });
    expect(await res.json()).toEqual({ ok: true, publicKey: 'PUBLICKEY' });
  });
});

describe('subscribe and unsubscribe', () => {
  it('stores a device, and a second call renews its keys instead of adding a row', async () => {
    expect((await post('/subscribe', sub(1))).status).toBe(200);
    expect((await post('/subscribe', { endpoint: endpointOf(1), keys: { p256dh: 'new', auth: 'a1' } })).status).toBe(200);
    expect(await rows()).toEqual([{ endpoint: endpointOf(1), p256dh: 'new', auth_user_id: 'dev:ann' }]);
  });
  it('refuses a malformed subscription with a sentence, and stores nothing', async () => {
    const res = await post('/subscribe', { endpoint: 'http://x', keys: {} });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/endpoint/);
    expect(await rows()).toEqual([]);
  });
  it('moves a shared phone to the account that subscribes last', async () => {
    await post('/subscribe', sub(1), 'ann');
    await post('/subscribe', sub(1), 'cat');
    expect(await rows()).toEqual([{ endpoint: endpointOf(1), p256dh: 'k1', auth_user_id: 'dev:cat' }]);
  });
  it('caps the devices per account at ten, but still renews one it already has', async () => {
    for (let i = 1; i <= 10; i++) expect((await post('/subscribe', sub(i))).status).toBe(200);
    expect((await post('/subscribe', sub(11))).status).toBe(422);
    expect((await post('/subscribe', sub(3))).status).toBe(200);
    expect(await rows()).toHaveLength(10);
  });
  it('unsubscribes one device and leaves the others and other accounts alone', async () => {
    await post('/subscribe', sub(1));
    await post('/subscribe', sub(2));
    await post('/subscribe', sub(3), 'cat');
    expect((await post('/unsubscribe', { endpoint: endpointOf(1) })).status).toBe(200);
    expect((await rows()).map(r => r.endpoint)).toEqual([endpointOf(2), endpointOf(3)]);
    expect((await post('/unsubscribe', { endpoint: endpointOf(3) })).status).toBe(200); // not ann's: nothing happens
    expect(await rows()).toHaveLength(2);
    expect((await post('/unsubscribe', { endpoint: endpointOf(9) })).status).toBe(200); // not there: still fine
  });
});

describe('claim_push_endpoint (migration 018)', () => {
  it('does nothing without a signed-in user, and cannot be run by the public', async () => {
    await expect(sql`select claim_push_endpoint('https://push.example/x')`.execute(app)).rejects.toThrow(/no signed-in user/);
  });
});

describe('schedule and cancel', () => {
  const job = { endpoint: endpointOf(1), kind: 'rest', key: '1799999999000', at: NOW + 90_000, body: 'Rest over. Time for your next set.' };
  const marker = { rest: { key: '1799999999000', at: NOW + 90_000 } };

  it('marks the send as wanted and hands the scheduler a job for that device', async () => {
    await post('/subscribe', sub(1));
    expect((await post('/schedule', job)).status).toBe(200);
    const id = String((await owner.selectFrom('push_subscription').select('id').executeTakeFirstOrThrow()).id);
    expect(calls).toEqual([{ subscriptionId: id, kind: 'rest', key: '1799999999000', at: NOW + 90_000, body: job.body }]);
    expect(await pending()).toEqual([[endpointOf(1), marker]]);
  });
  it('a newer schedule of the same kind replaces the marker, and a different kind sits beside it', async () => {
    await post('/subscribe', sub(1));
    await post('/schedule', job);
    await post('/schedule', { ...job, key: 'newer', at: NOW + 60_000 });
    await post('/schedule', { ...job, kind: 'day-nudge', key: 'n1', at: NOW + 1_800_000, body: 'Day not finished' });
    expect(await pending()).toEqual([[endpointOf(1), { rest: { key: 'newer', at: NOW + 60_000 }, 'day-nudge': { key: 'n1', at: NOW + 1_800_000 } }]]);
  });
  it('refuses a device that is not subscribed, and one that belongs to another account', async () => {
    expect((await post('/schedule', job)).status).toBe(404);
    await post('/subscribe', sub(1), 'cat');
    expect((await post('/schedule', job, 'ann')).status).toBe(404);
    expect(calls).toEqual([]);
    expect(await pending()).toEqual([[endpointOf(1), {}]]);
  });
  it('refuses a bad job with a sentence', async () => {
    await post('/subscribe', sub(1));
    for (const bad of [{ kind: 'ad' }, { at: NOW + 4 * 3_600_000 }, { body: 'x'.repeat(200) }, { key: 'a b' }]) expect((await post('/schedule', { ...job, ...bad })).status).toBe(422);
    expect(calls).toEqual([]);
  });
  it('answers 502 when the scheduler fails, without crashing', async () => {
    await post('/subscribe', sub(1));
    failSchedule = true;
    expect((await post('/schedule', job)).status).toBe(502);
  });
  it('cancel clears one kind; with a key it only clears that schedule', async () => {
    await post('/subscribe', sub(1));
    await post('/schedule', job);
    await post('/schedule', { ...job, kind: 'day-nudge', key: 'n1', at: NOW + 1_800_000, body: 'Day not finished' });
    expect((await post('/cancel', { endpoint: endpointOf(1), kind: 'rest', key: 'old-timer' })).status).toBe(200);
    expect(Object.keys((await pending())[0]![1] as object).sort()).toEqual(['day-nudge', 'rest']); // a late cancel of an older timer changes nothing
    expect((await post('/cancel', { endpoint: endpointOf(1), kind: 'rest', key: '1799999999000' })).status).toBe(200);
    expect(Object.keys((await pending())[0]![1] as object)).toEqual(['day-nudge']);
    expect((await post('/cancel', { endpoint: endpointOf(1), kind: 'day-nudge' })).status).toBe(200);
    expect(await pending()).toEqual([[endpointOf(1), {}]]);
    expect((await post('/cancel', { endpoint: endpointOf(9), kind: 'rest' })).status).toBe(200); // nothing there: fine
  });
  it("cancel does not touch another account's device", async () => {
    await post('/subscribe', sub(1), 'cat');
    await owner.updateTable('push_subscription').set({ pending: JSON.stringify(marker) }).execute();
    await post('/cancel', { endpoint: endpointOf(1), kind: 'rest' }, 'ann');
    expect(await pending()).toEqual([[endpointOf(1), marker]]);
  });
});

describe('without the server set up', () => {
  it('answers 503 with no key or scheduler, and 422 or 404 are never reached', async () => {
    const bare = createApp({ db: app, admins: adminsFrom('dev:ann') }).listen(0);
    await new Promise(done => bare.once('listening', done));
    const url = `http://127.0.0.1:${(bare.address() as AddressInfo).port}/api/push`;
    try {
      expect((await fetch(`${url}/key`, { headers: dev('ann') })).status).toBe(503);
      expect((await fetch(`${url}/subscribe`, { method: 'POST', headers: dev('ann'), body: JSON.stringify(sub(1)) })).status).toBe(503);
      expect((await fetch(`${url}/schedule`, { method: 'POST', headers: dev('ann'), body: '{}' })).status).toBe(503);
      expect((await fetch(`${url}/fire`, { method: 'POST', headers: dev('ann'), body: '{}' })).status).toBe(404); // no fire route without a verifier
    } finally {
      await new Promise<void>(done => bare.close(() => done()));
    }
  });
});

describe('rate limit', () => {
  it('limits one account, not the next', async () => {
    const small = createApp({ db: app, admins: adminsFrom('dev:ann,dev:cat'), push: { publicKey: 'K' }, limits: { push: { max: 3, windowMs: 60_000 } } }).listen(0);
    await new Promise(done => small.once('listening', done));
    const url = `http://127.0.0.1:${(small.address() as AddressInfo).port}/api/push/key`;
    try {
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await fetch(url, { headers: dev('ann') })).status);
      expect(statuses).toEqual([200, 200, 200, 429]);
      expect((await fetch(url, { headers: dev('cat') })).status).toBe(200);
    } finally {
      await new Promise<void>(done => small.close(() => done()));
    }
  });
});
