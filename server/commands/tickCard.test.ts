import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';

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

const planned = { d: '2026-10-07', ph: 'strength', w: 135, s: 3, r: 5, sets: [{ w: 135, r: 5 }, { w: 135, r: 5 }, { w: 135, r: 5 }], slot: 's1', wk: '2026-10-04', auto: true };

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const tick = (clientId = 't1', entry: object = planned, exerciseId = 'squat', user = 'owner') =>
  send('commands/tick-card', { clientId, baseVersion: null, input: { exerciseId, entry } }, user);
const hand = (clientId: string, entry: object) => send('commands/log-session', { clientId, baseVersion: null, input: { exerciseId: 'squat', entry } });
const live = () => db.selectFrom('log_entries').selectAll().where('deleted_at', 'is', null).execute();

describe('tick-card', () => {
  it('saves one check-off row and bumps the cursor', async () => {
    const res = await tick();
    expect(res.status).toBe(201);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ client_id: 't1', exercise_id: 'squat', slot: 's1', wk: '2026-10-04', auto: true, version: 1, weight_lb: '135.0000', sets_count: 3 });
    expect(res.body.cursor).toBe(res.body.rows[0].seq);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(res.body.rows[0].seq);
  });

  it('returns the same row for a retry and writes nothing new', async () => {
    const first = await tick();
    const retry = await tick();
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].id).toBe(first.body.rows[0].id);
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(1);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(first.body.rows[0].seq);
  });

  it('keeps one live check-off per card and week when a second tick arrives under a new id', async () => {
    const first = await tick('t1');
    const second = await tick('t2');
    expect(second.status).toBe(200);
    expect(second.body.rows).toHaveLength(1);
    expect(second.body.rows[0].client_id).toBe('t1');
    expect(await live()).toHaveLength(1);
    expect(second.body.cursor).toBe(first.body.rows[0].seq);
  });

  it('does not add a check-off when a session is already logged for the card and week', async () => {
    await hand('hand1', { d: '2026-10-07', w: 140, s: 3, r: 5, slot: 's1', wk: '2026-10-04' });
    const res = await tick('t1');
    expect(res.status).toBe(200);
    expect(res.body.rows[0].client_id).toBe('hand1');
    expect(await live()).toHaveLength(1);
  });

  it('survives two ticks for the same card sent at once', async () => {
    const results = await Promise.all([tick('t1'), tick('t2'), tick('t3')]);
    expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
    expect(await live()).toHaveLength(1);
  });

  it.each([
    ['another week', { wk: '2026-09-27' }, 'squat'],
    ['another card slot', { slot: 's2' }, 'squat'],
    ['another exercise', {}, 'bench'],
  ])('adds a second check-off for %s', async (_name, over, exerciseId) => {
    await tick('t1');
    const res = await tick('t2', { ...planned, ...over }, exerciseId);
    expect(res.status).toBe(201);
    expect(await live()).toHaveLength(2);
  });

  it('adds a check-off when the earlier one for the card was deleted', async () => {
    await tick('t1');
    await db.updateTable('log_entries').set({ deleted_at: new Date(), version: 2, seq: '9' }).execute();
    const res = await tick('t2');
    expect(res.status).toBe(201);
    expect(await live()).toHaveLength(1);
  });

  it('keeps each user their own check-off', async () => {
    await tick('t1', planned, 'squat', 'owner');
    const other = await tick('t1', planned, 'squat', 'tester');
    expect(other.status).toBe(201);
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(2);
  });

  it('is delivered by the sync pull (reconciliation)', async () => {
    const res = await tick();
    const pulled = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
    expect(pulled.rows.map((r: any) => r.client_id)).toEqual(['t1']);
    expect(pulled.rows[0]).toMatchObject({ table: 'log_entries', auto: true, slot: 's1', wk: '2026-10-04' });
    expect(pulled.cursor).toBe(res.body.cursor);
  });
});

describe('tick-card refusals', () => {
  const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();

  it.each([
    ['not marked auto', { ...planned, auto: undefined }],
    ['no slot', { ...planned, slot: undefined }],
    ['no week', { ...planned, wk: undefined }],
    ['a bad date', { ...planned, d: 'nope' }],
  ])('refuses an entry that is %s with 422 and records it', async (_name, entry) => {
    const res = await tick('t1', entry);
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(0);
    const logged = await refusedWrites();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ command: 'tick-card', client_id: 't1', reason: 'invalid-input', client_version: 'test-1' });
  });

  it('refuses a tick that carries a base version when there is no such check-off', async () => {
    const res = await send('commands/tick-card', { clientId: 't1', baseVersion: 1, input: { exerciseId: 'squat', entry: planned } });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ refused: 'not-found', current: null });
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(0);
  });

  it('refuses a malformed envelope', async () => {
    const res = await send('commands/tick-card', { baseVersion: null, input: { exerciseId: 'squat', entry: planned } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
    expect((await refusedWrites())[0]).toMatchObject({ command: 'tick-card', reason: 'bad-envelope' });
  });

  it('needs a signed-in user', async () => {
    const res = await fetch(`${base}/api/commands/tick-card`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});

// The board's Undo after an untick: the phone names the tombstone's own version to bring the check-off back.
describe('tick-card restores an unticked check-off', () => {
  const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();
  const untick = () => send('commands/untick-card', { clientId: 'u1', baseVersion: null, input: { slot: 's1', wk: '2026-10-04' } });
  const restore = (baseVersion: number, clientId = 't1', entry: object = planned) => send('commands/tick-card', { clientId, baseVersion, input: { exerciseId: 'squat', entry } });
  const row = (clientId = 't1') => db.selectFrom('log_entries').selectAll().where('client_id', '=', clientId).executeTakeFirstOrThrow();

  it('brings the same check-off back, with a higher version and seq', async () => {
    await tick('t1');
    const gone = await untick();
    expect(gone.body.rows[0].version).toBe(2);
    const res = await restore(2);
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ client_id: 't1', version: 3, deleted_at: null, auto: true, slot: 's1', wk: '2026-10-04' });
    expect(Number(res.body.cursor)).toBeGreaterThan(Number(gone.body.cursor));
    expect(await live()).toHaveLength(1);
  });

  it('a tick with no base version still only returns the tombstone', async () => {
    await tick('t1');
    await untick();
    const dup = await tick('t1');
    expect(dup.status).toBe(200);
    expect(dup.body.rows[0].deleted_at).not.toBeNull();
    expect(await live()).toHaveLength(0);
  });

  it('a restore that names the wrong version is refused with the tombstone', async () => {
    await tick('t1');
    await untick();
    const res = await restore(1);
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('deleted');
    expect(res.body.current).toMatchObject({ version: 2 });
    expect((await row()).deleted_at).not.toBeNull();
  });

  it('a restore of a check-off that is already back is a no-op that returns it', async () => {
    await tick('t1');
    await untick();
    const first = await restore(2);
    const again = await restore(2);
    expect(again.status).toBe(200);
    expect(again.body.rows[0].version).toBe(3);
    expect(again.body.cursor).toBe(first.body.cursor);
  });

  it('a restore when the card has another check-off by then returns that one and changes nothing', async () => {
    await tick('t1');
    await untick();
    await tick('t2');
    const res = await restore(2);
    expect(res.status).toBe(200);
    expect(res.body.rows[0].client_id).toBe('t2');
    expect((await row('t1')).deleted_at).not.toBeNull();
    expect(await live()).toHaveLength(1);
  });

  it('a restore when a session was logged by hand for the card returns that session', async () => {
    await tick('t1');
    await untick();
    await hand('hand1', { d: '2026-10-07', w: 140, s: 3, r: 5, slot: 's1', wk: '2026-10-04' });
    const res = await restore(2);
    expect(res.body.rows[0].client_id).toBe('hand1');
    expect((await row('t1')).deleted_at).not.toBeNull();
  });

  it('is refused for another user, and recorded', async () => {
    await tick('t1');
    await untick();
    const res = await send('commands/tick-card', { clientId: 't1', baseVersion: 2, input: { exerciseId: 'squat', entry: planned } }, 'tester');
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('not-found');
    expect((await row()).deleted_at).not.toBeNull();
    expect((await refusedWrites())[0]).toMatchObject({ command: 'tick-card', reason: 'not-found' });
  });

  it('is delivered by the sync pull as the live check-off', async () => {
    await tick('t1');
    await untick();
    const res = await restore(2);
    const pulled = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
    expect(pulled.rows.map((r: any) => [r.client_id, r.version, r.deleted_at])).toEqual([['t1', 3, null]]);
    expect(pulled.cursor).toBe(res.body.cursor);
  });
});
