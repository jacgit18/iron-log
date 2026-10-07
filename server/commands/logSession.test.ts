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

// Each test starts from an empty database (ADR 014).
beforeEach(async () => {
  await db.deleteFrom('users').execute();
});

const entry = { d: '2026-10-07', w: 135.5, s: 3, r: 5, sets: [{ w: 135.5, r: 5 }, { w: 135.5, r: 5 }, { w: 135.5, r: 4 }], n: 'felt heavy' };

async function post(body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/commands/log-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const create = (clientId = 'c1', e: object = entry) => post({ clientId, baseVersion: null, input: { exerciseId: 'squat', entry: e } });

describe('log-session create', () => {
  it('saves one row and bumps the user cursor', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.rows).toHaveLength(1);
    const row = res.body.rows[0];
    expect(row).toMatchObject({ client_id: 'c1', exercise_id: 'squat', d: '2026-10-07', version: 1, auto: false, note: 'felt heavy', sets_count: 3 });
    expect(row.sets).toHaveLength(3);
    expect(res.body.cursor).toBe(row.seq);
    const stored = await db.selectFrom('log_entries').selectAll().execute();
    expect(stored).toHaveLength(1);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(row.seq);
  });

  it('gives each new row a higher seq', async () => {
    const a = await create('c1');
    const b = await create('c2');
    expect(Number(b.body.rows[0].seq)).toBeGreaterThan(Number(a.body.rows[0].seq));
  });

  it('returns the same row for a retry and writes nothing new', async () => {
    const first = await create();
    const retry = await create();
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].id).toBe(first.body.rows[0].id);
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(1);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(first.body.rows[0].seq);
  });

  it('saves one row when the same create arrives twice at once', async () => {
    const results = await Promise.all([create(), create(), create()]);
    expect(results.map(r => r.status).sort()).toEqual([200, 200, 201]);
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(1);
  });

  it('keeps users apart: the same client id under two users makes two rows', async () => {
    await create('c1');
    await post({ clientId: 'c1', baseVersion: null, input: { exerciseId: 'squat', entry } }, 'tester');
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(2);
  });

  it('answers 401 without a dev user', async () => {
    const res = await fetch(`${base}/api/commands/log-session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});

describe('log-session refusals', () => {
  it('refuses invalid input with 422 and records it without the note', async () => {
    const res = await post({ clientId: 'c1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: 'not-a-date', n: 'private words' } } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await db.selectFrom('log_entries').selectAll().execute()).toHaveLength(0);
    const refused = await db.selectFrom('refused_writes').selectAll().executeTakeFirstOrThrow();
    expect(refused).toMatchObject({ command: 'log-session', client_id: 'c1', reason: 'invalid-input', client_version: 'test-1' });
    expect(JSON.stringify(refused.payload)).not.toContain('private words');
  });

  it('refuses a malformed envelope with 422', async () => {
    const res = await post({ baseVersion: null, input: {} });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
  });

  it('refuses a check-off sent by hand', async () => {
    const res = await create('c1', { d: '2026-10-07', slot: 's1', wk: '2026-10-04', auto: true });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('check-off-not-allowed');
  });
});

describe('log-session edit', () => {
  it('applies an edit made from the current version and keeps the old row in history', async () => {
    const first = (await create()).body.rows[0];
    const res = await post({ clientId: 'c1', baseVersion: 1, input: { exerciseId: 'squat', entry: { ...entry, w: 140 } } });
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ id: first.id, version: 2, weight_lb: '140.0000' });
    expect(Number(res.body.rows[0].seq)).toBeGreaterThan(Number(first.seq));
    const history = await db.selectFrom('row_history').selectAll().execute();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ table_name: 'log_entries', row_id: first.id, version: 1 });
  });

  it('refuses a stale edit with 409, the current row, and a refused_writes row', async () => {
    await create();
    await post({ clientId: 'c1', baseVersion: 1, input: { exerciseId: 'squat', entry: { ...entry, w: 140 } } });
    const res = await post({ clientId: 'c1', baseVersion: 1, input: { exerciseId: 'squat', entry: { ...entry, w: 150 } } });
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current).toMatchObject({ version: 2, weight_lb: '140.0000' });
    const stored = await db.selectFrom('log_entries').select(['version', 'weight_lb']).executeTakeFirstOrThrow();
    expect(stored).toEqual({ version: 2, weight_lb: '140.0000' });
    expect((await db.selectFrom('refused_writes').select('reason').execute()).map(r => r.reason)).toEqual(['stale']);
  });

  it('refuses an edit of a deleted row and returns the tombstone', async () => {
    await create();
    await db.updateTable('log_entries').set({ deleted_at: new Date() }).execute();
    const res = await post({ clientId: 'c1', baseVersion: 1, input: { exerciseId: 'squat', entry } });
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('deleted');
    expect(res.body.current.deleted_at).not.toBeNull();
  });

  it('refuses an edit of a row that does not exist', async () => {
    const res = await post({ clientId: 'nope', baseVersion: 1, input: { exerciseId: 'squat', entry } });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ refused: 'not-found', current: null });
  });

  it('does not let one user edit another user\'s row', async () => {
    await create();
    const res = await post({ clientId: 'c1', baseVersion: 1, input: { exerciseId: 'squat', entry: { ...entry, w: 1 } } }, 'tester');
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('not-found');
  });
});
