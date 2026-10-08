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

const DAY = '2026-10-07';
const record = { day: DAY, water: [16, 8], boost: { hot: true, mins: 45 }, taken: { creatine: true } };
const other = { ...record, water: [16, 8, 12], taken: { creatine: true, zinc: true } };

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const put = (baseVersion: number | null, input: object = record, clientId = 'c1', user = 'owner') => send('commands/save-supplement-day', { clientId, baseVersion, input }, user);
const del = (baseVersion: number | null, day = DAY, clientId = 'd1', user = 'owner') => send('commands/delete-supplement-day', { clientId, baseVersion, input: { day } }, user);
const row = (day = DAY) => db.selectFrom('supplement_days').selectAll().where('day', '=', day).executeTakeFirstOrThrow();
const count = async () => (await db.selectFrom('supplement_days').selectAll().execute()).length;
const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();

describe('save-supplement-day create', () => {
  it('saves one row and bumps the cursor', async () => {
    const res = await put(null);
    expect(res.status).toBe(201);
    expect(res.body.rows[0]).toMatchObject({ day: DAY, version: 1, deleted_at: null, water: [16, 8], boost: { hot: true, mins: 45 }, taken: { creatine: true } });
    expect(res.body.cursor).toBe(res.body.rows[0].seq);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(res.body.cursor);
  });

  it('stores a day with no boost as null and cleans the values', async () => {
    const res = await put(null, { day: DAY, water: [16, 0, 999, '8.04'], taken: { zinc: false, creatine: true }, junk: 1 });
    expect(res.body.rows[0]).toMatchObject({ water: [16, 8], boost: null, taken: { creatine: true } });
  });

  it('returns the same row for a retry and writes nothing new', async () => {
    const first = await put(null);
    const retry = await put(null);
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].id).toBe(first.body.rows[0].id);
    expect(retry.body.cursor).toBe(first.body.cursor);
    expect(await count()).toBe(1);
  });

  it('refuses a different record for a day that already has one, with the current row', async () => {
    await put(null);
    const res = await put(null, other, 'c2');
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current).toMatchObject({ water: [16, 8], taken: { creatine: true } });
    expect((await refusedWrites())[0]).toMatchObject({ command: 'save-supplement-day', reason: 'stale', client_version: 'test-1' });
  });

  it('keeps one row per day, and each user has their own', async () => {
    await put(null);
    expect((await put(null, { ...record, day: '2026-10-08' })).status).toBe(201);
    expect((await put(null, record, 'c1', 'tester')).status).toBe(201);
    expect(await count()).toBe(3);
  });

  it('survives the same save sent at once', async () => {
    const results = await Promise.all([put(null), put(null), put(null)]);
    expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
    expect(await count()).toBe(1);
  });
});

describe('save-supplement-day edit', () => {
  it('replaces the record with the version the phone saw and keeps the old one in row_history', async () => {
    await put(null);
    const res = await put(1, other);
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ version: 2, water: [16, 8, 12], taken: { creatine: true, zinc: true } });
    const history = await db.selectFrom('row_history').selectAll().execute();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ table_name: 'supplement_days', version: 1 });
  });

  it('clears the boost when the new record has none', async () => {
    await put(null);
    const res = await put(1, { day: DAY, water: [16, 8], taken: { creatine: true } });
    expect(res.body.rows[0].boost).toBeNull();
  });

  it('refuses a stale edit with the current row', async () => {
    await put(null);
    await put(1, other);
    const res = await put(1, { ...record, water: [] });
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current).toMatchObject({ version: 2, water: [16, 8, 12] });
  });

  it('treats an edit retry as a success once its record is already stored', async () => {
    await put(null);
    await put(1, other);
    const retry = await put(1, other);
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].version).toBe(2);
    expect(await refusedWrites()).toHaveLength(0);
  });

  it('refuses an edit of a day that has no row', async () => {
    const res = await put(1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ refused: 'not-found', current: null });
  });
});

describe('delete-supplement-day', () => {
  it('tombstones the row, bumps version and seq, and keeps the record', async () => {
    const made = await put(null);
    const res = await del(1);
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ day: DAY, version: 2 });
    expect(res.body.rows[0].deleted_at).not.toBeNull();
    expect(Number(res.body.cursor)).toBeGreaterThan(Number(made.body.cursor));
    expect((await row()).water).toEqual([16, 8]);
  });

  it('is a success that changes nothing when the day is already deleted', async () => {
    await put(null);
    const first = await del(1);
    const retry = await del(1);
    expect(retry.status).toBe(200);
    expect(retry.body.cursor).toBe(first.body.cursor);
    expect(await refusedWrites()).toHaveLength(0);
  });

  it('refuses with the current row when the day was edited since (FM-05)', async () => {
    await put(null);
    await put(1, other);
    const res = await del(1);
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect((await row()).deleted_at).toBeNull();
  });

  it("refuses a day with no row, and can't reach another user's", async () => {
    expect((await del(1, '2026-10-08')).body.refused).toBe('not-found');
    await put(null, record, 'c1', 'tester');
    expect((await del(1)).body.refused).toBe('not-found');
    expect((await row()).deleted_at).toBeNull();
  });

  it('then refuses an edit of the deleted day with the tombstone (FM-05)', async () => {
    await put(null);
    await del(1);
    const res = await put(1, other);
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('deleted');
    expect(res.body.current.deleted_at).not.toBeNull();
  });

  it('revives the same row when the deleted day is saved again', async () => {
    const first = await put(null);
    await del(1);
    const res = await put(null, other, 'c2');
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ id: first.body.rows[0].id, version: 3, deleted_at: null, water: [16, 8, 12] });
    expect(await count()).toBe(1);
  });
});

describe('supplement days in the sync pull (reconciliation)', () => {
  it('delivers the record and its tombstone in seq order, next to other tables', async () => {
    await send('commands/log-session', { clientId: 'e1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: DAY, w: 135 } } });
    await put(null);
    await put(null, { ...record, day: '2026-10-08' });
    const res = await del(1, '2026-10-08');
    const page = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
    expect(page.rows.map((r: any) => [r.table, r.day ?? r.client_id, r.deleted_at !== null])).toEqual([
      ['log_entries', 'e1', false],
      ['supplement_days', DAY, false],
      ['supplement_days', '2026-10-08', true],
    ]);
    expect(page.cursor).toBe(res.body.cursor);
    expect(page.more).toBe(false);
  });
});

describe('supplement day refusals', () => {
  it.each([
    ['a bad day', 'save-supplement-day', { day: 'nope', water: [] }, null],
    ['a missing day', 'save-supplement-day', { water: [16] }, null],
    ['no base version on a delete', 'delete-supplement-day', { day: DAY }, null],
    ['a bad day on a delete', 'delete-supplement-day', { day: '2026-02-30' }, 1],
  ])('refuses %s with 422 and records it', async (_name, command, input, baseVersion) => {
    const res = await send(`commands/${command}`, { clientId: 'x1', baseVersion, input });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await count()).toBe(0);
    expect((await refusedWrites())[0]).toMatchObject({ command, reason: 'invalid-input' });
  });

  it.each(['save-supplement-day', 'delete-supplement-day'])('refuses a malformed %s envelope', async command => {
    const res = await send(`commands/${command}`, { baseVersion: 1, input: { day: DAY } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
  });

  it.each(['save-supplement-day', 'delete-supplement-day'])('needs a signed-in user for %s', async command => {
    const res = await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});
