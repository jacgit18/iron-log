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

// Rule 2: a hand-logged session replaces the check-off for the same card and week.
describe('log-session replaces a check-off', () => {
  const week = '2026-10-04';
  const carded = { ...entry, slot: 's1', wk: week };

  async function checkOff(clientId = 'tick1', over: Partial<{ exercise_id: string; slot: string; wk: string }> = {}) {
    const me = (await (await fetch(`${base}/api/me`, { headers: { 'x-dev-user': 'owner' } })).json()) as { userId: string };
    await db
      .insertInto('log_entries')
      .values({ user_id: me.userId, client_id: clientId, seq: '1', exercise_id: 'squat', d: '2026-10-05', slot: 's1', wk: week, auto: true, ...over })
      .execute();
  }
  const live = (clientId: string) => db.selectFrom('log_entries').selectAll().where('client_id', '=', clientId).executeTakeFirstOrThrow();

  it('tombstones the check-off in the same command and returns both rows', async () => {
    await checkOff();
    const res = await create('hand1', carded);
    expect(res.status).toBe(201);
    expect(res.body.rows.map((r: any) => r.client_id)).toEqual(['hand1', 'tick1']);
    const tick = await live('tick1');
    expect(tick.deleted_at).not.toBeNull();
    expect(tick.version).toBe(2);
    expect(tick.seq).toBe(res.body.rows[0].seq);
    expect(await db.selectFrom('row_history').select('version').where('row_id', '=', tick.id).execute()).toEqual([{ version: 1 }]);
  });

  it('delivers the new session and the tombstone through sync', async () => {
    await checkOff();
    await create('hand1', carded);
    const pulled = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
    expect(pulled.rows.map((r: any) => [r.client_id, r.deleted_at !== null]).sort()).toEqual([['hand1', false], ['tick1', true]]);
  });

  it('a retry does not touch anything again', async () => {
    await checkOff();
    const first = await create('hand1', carded);
    const retry = await create('hand1', carded);
    expect(retry.status).toBe(200);
    expect(retry.body.rows).toHaveLength(1);
    expect((await live('tick1')).seq).toBe(first.body.rows[0].seq);
  });

  it.each([
    ['another week', { wk: '2026-09-27' }],
    ['another card slot', { slot: 's2' }],
    ['another exercise', { exercise_id: 'bench' }],
  ])('leaves the check-off for %s', async (_name, over) => {
    await checkOff('tick1', over);
    await create('hand1', carded);
    expect((await live('tick1')).deleted_at).toBeNull();
  });

  it('leaves the check-off when the session has no slot or week', async () => {
    await checkOff();
    await create('hand1');
    expect((await live('tick1')).deleted_at).toBeNull();
  });

  it('does not replace another hand-logged session', async () => {
    await create('hand1', carded);
    await create('hand2', carded);
    expect((await live('hand1')).deleted_at).toBeNull();
    expect((await live('hand2')).deleted_at).toBeNull();
  });

  it('replaces the check-off when an edit adds the slot and week', async () => {
    await create('hand1');
    await checkOff();
    const res = await post({ clientId: 'hand1', baseVersion: 1, input: { exerciseId: 'squat', entry: carded } });
    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: any) => r.client_id)).toEqual(['hand1', 'tick1']);
    expect((await live('tick1')).deleted_at).not.toBeNull();
  });

  it('leaves an already-deleted check-off alone', async () => {
    await checkOff();
    await db.updateTable('log_entries').set({ deleted_at: new Date(), version: 2, seq: '7' }).execute();
    const res = await create('hand1', carded);
    expect(res.body.rows).toHaveLength(1);
    expect((await live('tick1')).seq).toBe('7');
  });

  it('keeps at most one live check-off per card and week afterwards', async () => {
    await checkOff();
    await create('hand1', carded);
    const live = await db.selectFrom('log_entries').select('id').where('auto', '=', true).where('deleted_at', 'is', null).execute();
    expect(live).toHaveLength(0);
  });
});
