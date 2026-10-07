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

const entry = { d: '2026-10-07', w: 135, s: 3, r: 5, n: 'felt heavy' };

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const create = (clientId = 'e1', e: object = entry, user = 'owner') => send('commands/log-session', { clientId, baseVersion: null, input: { exerciseId: 'squat', entry: e } }, user);
const edit = (clientId: string, baseVersion: number, e: object) => send('commands/log-session', { clientId, baseVersion, input: { exerciseId: 'squat', entry: e } });
const del = (entryId: string, baseVersion: number | null, clientId = 'd1', user = 'owner') => send('commands/delete-entry', { clientId, baseVersion, input: { entryId } }, user);
const row = (clientId: string) => db.selectFrom('log_entries').selectAll().where('client_id', '=', clientId).executeTakeFirstOrThrow();
const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();

describe('delete-entry', () => {
  it('tombstones the row, bumps its version and seq, and returns it', async () => {
    const made = await create();
    const res = await del('e1', 1);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ client_id: 'e1', version: 2 });
    expect(res.body.rows[0].deleted_at).not.toBeNull();
    expect(Number(res.body.cursor)).toBeGreaterThan(Number(made.body.cursor));
    expect(res.body.rows[0].seq).toBe(res.body.cursor);
  });

  it('keeps the row and its data, and the old version in row_history', async () => {
    await create();
    await del('e1', 1);
    expect(await row('e1')).toMatchObject({ note: 'felt heavy', weight_lb: '135.0000' });
    const history = await db.selectFrom('row_history').selectAll().execute();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ table_name: 'log_entries', version: 1 });
  });

  it('is a success that changes nothing when the row is already deleted (retry)', async () => {
    await create();
    const first = await del('e1', 1);
    const retry = await del('e1', 1);
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].version).toBe(2);
    expect(retry.body.cursor).toBe(first.body.cursor);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(first.body.cursor);
    expect(await refusedWrites()).toHaveLength(0);
  });

  it('is a success when another device deleted it first, even with an older base version', async () => {
    await create();
    await edit('e1', 1, { ...entry, w: 140 });
    await del('e1', 2, 'other-device');
    const res = await del('e1', 1);
    expect(res.status).toBe(200);
    expect(res.body.rows[0].version).toBe(3);
  });

  it('refuses with 409 and the current row when the entry was edited since (FM-05)', async () => {
    await create();
    await edit('e1', 1, { ...entry, w: 140 });
    const res = await del('e1', 1);
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current).toMatchObject({ client_id: 'e1', version: 2, weight_lb: '140.0000' });
    expect((await row('e1')).deleted_at).toBeNull();
    expect(await refusedWrites()).toHaveLength(1);
    expect((await refusedWrites())[0]).toMatchObject({ command: 'delete-entry', client_id: 'd1', reason: 'stale', client_version: 'test-1' });
  });

  it('refuses a delete based on a version the server never had', async () => {
    await create();
    const res = await del('e1', 5);
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
  });

  it('refuses an unknown entry with 409', async () => {
    const res = await del('nope', 1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ refused: 'not-found', current: null });
    expect((await refusedWrites())[0]).toMatchObject({ reason: 'not-found' });
  });

  it("cannot reach another user's entry", async () => {
    await create('e1', entry, 'tester');
    const res = await del('e1', 1, 'd1', 'owner');
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('not-found');
    expect((await row('e1')).deleted_at).toBeNull();
  });

  it('then refuses an edit of the deleted row, with the tombstone (FM-05)', async () => {
    await create();
    await del('e1', 1);
    const res = await edit('e1', 1, { ...entry, w: 150 });
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('deleted');
    expect(res.body.current.deleted_at).not.toBeNull();
  });

  it('deletes a check-off too, leaving the other rows alone', async () => {
    await send('commands/tick-card', { clientId: 't1', baseVersion: null, input: { exerciseId: 'squat', entry: { ...entry, slot: 's1', wk: '2026-10-04', auto: true } } });
    await create('e1');
    const res = await del('t1', 1);
    expect(res.status).toBe(200);
    expect((await row('e1')).deleted_at).toBeNull();
  });

  it('is delivered by the sync pull as a tombstone (reconciliation)', async () => {
    await create();
    const res = await del('e1', 1);
    const pulled = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
    expect(pulled.rows.map((r: any) => [r.client_id, r.deleted_at !== null, r.version])).toEqual([['e1', true, 2]]);
    expect(pulled.cursor).toBe(res.body.cursor);
  });
});

describe('delete-entry refusals', () => {
  it.each([
    ['no base version', null, { entryId: 'e1' }],
    ['no entry id', 1, {}],
    ['an empty entry id', 1, { entryId: '' }],
    ['a non-string entry id', 1, { entryId: 5 }],
  ])('refuses %s with 422 and records it', async (_name, baseVersion, input) => {
    await create();
    const res = await send('commands/delete-entry', { clientId: 'd1', baseVersion, input });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect((await row('e1')).deleted_at).toBeNull();
    expect((await refusedWrites())[0]).toMatchObject({ command: 'delete-entry', reason: 'invalid-input' });
  });

  it('refuses a malformed envelope', async () => {
    const res = await send('commands/delete-entry', { baseVersion: 1, input: { entryId: 'e1' } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
  });

  it('needs a signed-in user', async () => {
    const res = await fetch(`${base}/api/commands/delete-entry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});
