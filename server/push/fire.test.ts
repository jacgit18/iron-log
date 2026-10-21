import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminsFrom } from '../admin.ts';
import { createApp } from '../app.ts';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import type { PushJob } from './scheduler.ts';
import type { PushSender, Subscription } from './send.ts';

// The route Cloud Tasks calls (ADR 044, PR 4), against the real database as the restricted role, with a fake token check and a fake push service.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;
const NOW = 1_800_000_000_000;
const sent: { sub: Subscription; message: unknown; ttl: number }[] = [];
let outcome: 'sent' | 'gone' | 'failed' = 'sent';
let clock = NOW;
const send: PushSender = async (sub, message, ttl) => { sent.push({ sub, message, ttl }); return outcome; };
const scheduled: PushJob[] = [];
let scheduleFails = false;
const scheduler = { schedule: async (j: PushJob) => { if (scheduleFails) throw new Error('queue down'); scheduled.push(j); } };
const verify = async (token: string) => { if (token === 'explode') throw new Error('bad token'); return token === 'good'; };

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
  server = createApp({ db: app, admins: adminsFrom('dev:ann'), push: { publicKey: 'K', scheduler, now: () => clock, fire: { verify, send } } }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await app.destroy();
  await stop?.();
});

let subId: string;
beforeEach(async () => {
  await owner.deleteFrom('users').execute();
  sent.length = 0;
  scheduled.length = 0;
  scheduleFails = false;
  outcome = 'sent';
  clock = NOW;
  const uid = (await owner.insertInto('users').values({ auth_user_id: 'dev:ann' }).returning('id').executeTakeFirstOrThrow()).id;
  subId = String((await owner.insertInto('push_subscription').values({ user_id: uid, endpoint: 'https://push.example/secret-endpoint', p256dh: 'P', auth: 'A', pending: JSON.stringify({ rest: { key: 'k1', at: NOW } }) }).returning('id').executeTakeFirstOrThrow()).id);
});

const job = () => ({ subscriptionId: subId, kind: 'rest', key: 'k1', at: NOW, body: 'Rest over. Time for your next set.' });
const fire = (body: unknown, token: string | null = 'good') =>
  fetch(`${base}/api/push/fire`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const row = () => owner.selectFrom('push_subscription').selectAll().executeTakeFirst();

describe('who may fire', () => {
  it('refuses a call with no token, a wrong token, a token that fails to verify, and a signed-in person with no token', async () => {
    for (const token of [null, 'nope', 'explode']) expect((await fire(job(), token)).status, String(token)).toBe(401);
    const person = await fetch(`${base}/api/push/fire`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-user': 'ann', 'x-client-version': 'test-1' }, body: JSON.stringify(job()) });
    expect(person.status).toBe(401);
    expect(sent).toEqual([]);
    expect((await row())!.pending).toEqual({ rest: { key: 'k1', at: NOW } });
  });
  it('refuses a body that is not a push job', async () => {
    for (const bad of [{}, { ...job(), kind: 'x' }, { ...job(), subscriptionId: 'abc' }, { ...job(), key: 'a b' }, { ...job(), at: 'now' }]) expect((await fire(bad)).status).toBe(422);
  });
});

describe('sending', () => {
  it('sends to the device with its keys, clears the marker, and notes the success', async () => {
    const res = await fire(job());
    expect(await res.json()).toEqual({ ok: true, sent: true });
    expect(sent).toEqual([{ sub: { endpoint: 'https://push.example/secret-endpoint', p256dh: 'P', auth: 'A' }, message: { kind: 'rest', key: 'k1', at: NOW, body: job().body }, ttl: 90 }]);
    const r = (await row())!;
    expect(r.pending).toEqual({});
    expect(r.last_ok_at).not.toBeNull();
  });
  it('a retry of the same task sends nothing', async () => {
    await fire(job());
    expect(await (await fire(job())).json()).toEqual({ ok: true, sent: false });
    expect(sent).toHaveLength(1);
  });
  it('a cancelled or replaced schedule sends nothing, and leaves the newer marker alone', async () => {
    await owner.updateTable('push_subscription').set({ pending: JSON.stringify({ rest: { key: 'k2', at: NOW + 30_000 } }) }).execute();
    expect(await (await fire(job())).json()).toEqual({ ok: true, sent: false });
    expect((await row())!.pending).toEqual({ rest: { key: 'k2', at: NOW + 30_000 } });
    await owner.updateTable('push_subscription').set({ pending: '{}' }).execute();
    expect(await (await fire(job())).json()).toEqual({ ok: true, sent: false });
    expect(sent).toEqual([]);
  });
  it('a kind is claimed on its own: firing the rest leaves a waiting nudge', async () => {
    await owner.updateTable('push_subscription').set({ pending: JSON.stringify({ rest: { key: 'k1', at: NOW }, 'day-nudge': { key: 'n1', at: NOW + 1_800_000 } }) }).execute();
    await fire(job());
    expect((await row())!.pending).toEqual({ 'day-nudge': { key: 'n1', at: NOW + 1_800_000 } });
  });
  it('a subscription that was removed sends nothing and does not fail', async () => {
    await owner.deleteFrom('push_subscription').execute();
    expect(await (await fire(job())).json()).toEqual({ ok: true, sent: false });
  });
  it('drops a send that is too late, per kind, but still clears the marker', async () => {
    clock = NOW + 91_000; // past the 90 s a rest alert is worth
    expect(await (await fire(job())).json()).toEqual({ ok: true, sent: false });
    expect(sent).toEqual([]);
    expect((await row())!.pending).toEqual({});
    await owner.updateTable('push_subscription').set({ pending: JSON.stringify({ 'day-nudge': { key: 'n1', at: NOW } }) }).execute();
    clock = NOW + 300_000; // five minutes late is fine for a nudge (10 minute limit)
    expect(await (await fire({ ...job(), kind: 'day-nudge', key: 'n1' })).json()).toEqual({ ok: true, sent: true });
    expect(sent[0]!.ttl).toBe(600);
  });
});

describe('what the push service says', () => {
  it('removes the device when the service says it is gone (404 or 410)', async () => {
    outcome = 'gone';
    expect(await (await fire(job())).json()).toEqual({ ok: true, sent: false });
    expect(await row()).toBeUndefined();
  });
  it('keeps the device on any other failure, answers 200 so Cloud Tasks does not retry, and does not note a success', async () => {
    outcome = 'failed';
    const res = await fire(job());
    expect(res.status).toBe(200);
    const r = (await row())!;
    expect(r.last_ok_at).toBeNull();
    expect(r.pending).toEqual({});
  });
});

describe('the database functions', () => {
  it('are owner-run (security definer) and granted to the app role only', async () => {
    const { rows } = await sql<{ proname: string; definer: boolean; app: boolean; pub: boolean }>`
      select p.proname, p.prosecdef as definer,
             has_function_privilege('ironlog_app', p.oid, 'execute') as app,
             has_function_privilege('public', p.oid, 'execute') as pub
        from pg_proc p where p.proname in ('push_claim', 'push_sent', 'push_gone', 'claim_push_endpoint') order by 1`.execute(owner);
    expect(rows.map(r => r.proname)).toEqual(['claim_push_endpoint', 'push_claim', 'push_gone', 'push_sent']);
    expect(rows.every(r => r.definer && r.app && !r.pub)).toBe(true);
  });
});

describe('a repeating water reminder', () => {
  const EVERY = 2 * 3_600_000;
  const water = (over: Record<string, unknown> = {}) => ({ subscriptionId: subId, kind: 'water', key: 'w1', at: NOW, body: 'Time for a glass of water.', repeat: { everyMs: EVERY, until: NOW + 3 * EVERY }, ...over });
  const arm = () => owner.updateTable('push_subscription').set({ pending: JSON.stringify({ water: { key: 'w1', at: NOW } }) }).execute();

  it('sends, then marks and queues the next one an interval later', async () => {
    await arm();
    expect(await (await fire(water())).json()).toEqual({ ok: true, sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.ttl).toBe(1800);
    const next = NOW + EVERY;
    expect(scheduled).toEqual([{ subscriptionId: subId, kind: 'water', key: `w${next}`, at: next, body: 'Time for a glass of water.', repeat: { everyMs: EVERY, until: NOW + 3 * EVERY } }]);
    expect((await row())!.pending).toEqual({ water: { key: `w${next}`, at: next } });
  });
  it('queues the next one from the real time when this one came late', async () => {
    await arm();
    clock = NOW + 600_000;
    await fire(water());
    expect(scheduled[0]!.at).toBe(NOW + 600_000 + EVERY);
  });
  it('stops at the end of the window', async () => {
    await arm();
    await fire(water({ repeat: { everyMs: EVERY, until: NOW + EVERY - 1 } }));
    expect(sent).toHaveLength(1);
    expect(scheduled).toEqual([]);
    expect((await row())!.pending).toEqual({});
  });
  it('a job with no repeat sends once and queues nothing', async () => {
    await arm();
    await fire(water({ repeat: undefined }));
    expect(sent).toHaveLength(1);
    expect(scheduled).toEqual([]);
  });
  it('a reminder dropped as late still queues the next one', async () => {
    await arm();
    clock = NOW + 45 * 60_000; // past the 30 minutes a water reminder is worth
    expect(await (await fire(water())).json()).toEqual({ ok: true, sent: false });
    expect(sent).toEqual([]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.at).toBe(NOW + 45 * 60_000 + EVERY);
  });
  it('push_rearm sets a marker only where none is, so a newer ask from the phone is kept', async () => {
    const rearm = async (key: string) => (await sql<{ ok: boolean | null }>`select push_rearm(${subId}, 'water', ${key}, ${NOW + 5}) as ok`.execute(owner)).rows[0]!.ok;
    expect(await rearm('first')).toBe(true);
    expect((await row())!.pending).toEqual({ rest: { key: 'k1', at: NOW }, water: { key: 'first', at: NOW + 5 } }); // the rest marker beside it is untouched
    expect(await rearm('second')).toBeNull();
    expect((await row())!.pending).toEqual({ rest: { key: 'k1', at: NOW }, water: { key: 'first', at: NOW + 5 } });
  });
  it('a cancelled reminder sends nothing and does not chain', async () => {
    await fire(water());
    expect(sent).toEqual([]);
    expect(scheduled).toEqual([]);
  });
  it('a gone browser ends the chain; a failed send does not', async () => {
    await arm();
    outcome = 'gone';
    await fire(water());
    expect(scheduled).toEqual([]);
    await owner.insertInto('push_subscription').values({ user_id: (await owner.selectFrom('users').select('id').executeTakeFirstOrThrow()).id, endpoint: 'https://push.example/two', p256dh: 'P', auth: 'A', pending: JSON.stringify({ water: { key: 'w1', at: NOW } }) }).execute();
    const two = String((await owner.selectFrom('push_subscription').select('id').where('endpoint', '=', 'https://push.example/two').executeTakeFirstOrThrow()).id);
    outcome = 'failed';
    await fire(water({ subscriptionId: two }));
    expect(scheduled).toHaveLength(1);
  });
  it('a queue that is down does not fail the call', async () => {
    await arm();
    scheduleFails = true;
    const res = await fire(water());
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
  });
  it('refuses a repeat on another kind, too often, or backwards', async () => {
    for (const repeat of [{ everyMs: 60_000, until: NOW + EVERY }, { everyMs: 5 * 3_600_000, until: NOW + EVERY }, { everyMs: EVERY, until: NOW - 1 }, 'x']) expect((await fire(water({ repeat }))).status).toBe(422);
    expect((await fire({ ...job(), repeat: { everyMs: EVERY, until: NOW + EVERY } })).status).toBe(422);
  });
});
