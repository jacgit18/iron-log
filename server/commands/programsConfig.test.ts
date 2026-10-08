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

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();
const pull = async (query = 'since=0') => (await (await fetch(`${base}/api/sync?${query}`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;

// A six-day program with one card a day; the server pads it to seven days.
const program = (squatW = 135) => ({ days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `A-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: squatW }] }] })) });

describe('programs', () => {
  const put = (baseVersion: number | null, key = 'A', prog: object = program(), clientId = 'c1', user = 'owner') => send('commands/save-program', { clientId, baseVersion, input: { key, program: prog } }, user);
  const del = (baseVersion: number | null, key = 'A', clientId = 'd1', user = 'owner') => send('commands/delete-program', { clientId, baseVersion, input: { key } }, user);
  const row = (key = 'A') => db.selectFrom('programs').selectAll().where('key', '=', key).executeTakeFirstOrThrow();
  const count = async () => (await db.selectFrom('programs').selectAll().execute()).length;

  it('saves one row per program key, padded to seven days, without the key inside', async () => {
    const res = await put(null);
    expect(res.status).toBe(201);
    expect(res.body.rows[0]).toMatchObject({ key: 'A', version: 1, schema_version: 1, deleted_at: null });
    expect(res.body.rows[0].data.days).toHaveLength(7);
    expect(res.body.rows[0].data.key).toBeUndefined();
    expect(res.body.cursor).toBe(res.body.rows[0].seq);
    expect((await put(null, 'B')).status).toBe(201);
    expect(await count()).toBe(2);
  });

  it('returns the same row for a retry', async () => {
    const first = await put(null);
    const retry = await put(null);
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].id).toBe(first.body.rows[0].id);
    expect(retry.body.cursor).toBe(first.body.cursor);
    expect(await count()).toBe(1);
  });

  it('edits with the version the phone saw, keeps the old body in row_history, and refuses a stale edit', async () => {
    await put(null);
    const edit = await put(1, 'A', program(140));
    expect(edit.status).toBe(200);
    expect(edit.body.rows[0]).toMatchObject({ version: 2 });
    const slot = edit.body.rows[0].data.days[0].slots.find((x: any) => x.id === 'A-d1s1');
    expect(slot.items[0].w).toBe(140);
    expect((await db.selectFrom('row_history').selectAll().execute())[0]).toMatchObject({ table_name: 'programs', version: 1 });
    const stale = await put(1, 'A', program(150));
    expect(stale.status).toBe(409);
    expect(stale.body.refused).toBe('stale');
    expect(stale.body.current).toMatchObject({ version: 2 });
  });

  it('puts a program back to the built-in one by deleting it, and revives it when saved again', async () => {
    const first = await put(null);
    const res = await del(1);
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ key: 'A', version: 2 });
    expect(res.body.rows[0].deleted_at).not.toBeNull();
    expect((await del(1)).body.cursor).toBe(res.body.cursor);
    const edit = await put(1, 'A', program(140));
    expect(edit.status).toBe(409);
    expect(edit.body.refused).toBe('deleted');
    const revived = await put(null, 'A', program(140), 'c2');
    expect(revived.status).toBe(200);
    expect(revived.body.rows[0]).toMatchObject({ id: first.body.rows[0].id, version: 3, deleted_at: null });
  });

  it('refuses a delete based on an old version, an unknown program and another user\'s', async () => {
    await put(null);
    await put(1, 'A', program(140));
    expect((await del(1)).body.refused).toBe('stale');
    expect((await del(1, 'B')).body.refused).toBe('not-found');
    await put(null, 'B', program(), 'c1', 'tester');
    expect((await del(1, 'B')).body.refused).toBe('not-found');
    expect((await row('B')).deleted_at).toBeNull();
  });

  it.each([
    ['another key', 'save-program', { key: 'C', program: program() }, null],
    ['no program', 'save-program', { key: 'A' }, null],
    ['a program with the wrong shape', 'save-program', { key: 'A', program: { days: 'x' } }, null],
    ['a program with too few days', 'save-program', { key: 'A', program: { days: [] } }, null],
    ['no base version on a delete', 'delete-program', { key: 'A' }, null],
    ['another key on a delete', 'delete-program', { key: 'C' }, 1],
  ])('refuses %s with 422 and records it', async (_name, command, input, baseVersion) => {
    const res = await send(`commands/${command}`, { clientId: 'x1', baseVersion, input });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await count()).toBe(0);
    expect((await refusedWrites())[0]).toMatchObject({ command, reason: 'invalid-input' });
  });

  it('is delivered by the sync pull (reconciliation)', async () => {
    await put(null);
    const res = await del(1);
    const page = await pull();
    expect(page.rows.map((r: any) => [r.table, r.key, r.deleted_at !== null])).toEqual([['programs', 'A', true]]);
    expect(page.cursor).toBe(res.body.cursor);
  });
});

describe('config', () => {
  const put = (baseVersion: number | null, config: object = { mode: 2, rest: 90 }, clientId = 'c1', user = 'owner') => send('commands/save-config', { clientId, baseVersion, input: { config } }, user);
  const count = async () => (await db.selectFrom('config').selectAll().execute()).length;

  it('saves one row per user and cleans the document', async () => {
    const res = await put(null, { mode: 2, rest: 90, junk: 1, pct: { hyp: 70, bad: 500 }, waterGoal: 72.04, waterMode: 'fixed' });
    expect(res.status).toBe(201);
    expect(res.body.rows[0]).toMatchObject({ version: 1, schema_version: 1, data: { mode: 2, rest: 90, waterGoal: 72, waterMode: 'fixed' } });
    expect(res.body.rows[0].data.junk).toBeUndefined();
    expect(res.body.rows[0].data.pct).toEqual({ strength: 85, iso: 75, hyp: 70, exp: 45 });
    expect((await put(null, { mode: 1 }, 'c1', 'tester')).status).toBe(201);
    expect(await count()).toBe(2);
  });

  it('never stores the GitHub backup settings or a token', async () => {
    const res = await put(null, { mode: 1, backup: { repo: 'me/data', branch: 'main', hashes: {} }, ghBackup: { repo: 'me/x', token: 'ghp_secret' }, token: 'ghp_secret' });
    expect(res.body.rows[0].data).toEqual({ mode: 1 });
    expect(JSON.stringify(await db.selectFrom('config').selectAll().execute())).not.toContain('ghp_secret');
  });

  it('returns the same row for a retry, and refuses a different config for a user who already has one', async () => {
    const first = await put(null);
    const retry = await put(null);
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].id).toBe(first.body.rows[0].id);
    const other = await put(null, { mode: 3 }, 'c2');
    expect(other.status).toBe(409);
    expect(other.body.refused).toBe('stale');
    expect(other.body.current.data).toEqual({ mode: 2, rest: 90 });
    expect(await count()).toBe(1);
  });

  it('edits with the version the phone saw, treats an edit retry as a success, and refuses a stale edit', async () => {
    await put(null);
    const edit = await put(1, { mode: 3, rest: 120 });
    expect(edit.status).toBe(200);
    expect(edit.body.rows[0]).toMatchObject({ version: 2, data: { mode: 3, rest: 120 } });
    expect((await db.selectFrom('row_history').selectAll().execute())[0]).toMatchObject({ table_name: 'config', version: 1 });
    expect((await put(1, { mode: 3, rest: 120 })).status).toBe(200);
    const stale = await put(1, { mode: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ version: 2 });
    expect(await refusedWrites()).toHaveLength(1);
  });

  it('refuses an edit when there is no config row yet', async () => {
    const res = await put(1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ refused: 'not-found', current: null });
  });

  it('survives the same save sent at once', async () => {
    const results = await Promise.all([put(null), put(null), put(null)]);
    expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
    expect(await count()).toBe(1);
  });

  it('accepts an empty config (settings erased)', async () => {
    await put(null);
    const res = await put(1, {});
    expect(res.status).toBe(200);
    expect(res.body.rows[0].data).toEqual({});
  });

  it.each([
    ['no config', { }],
    ['a config that is not an object', { config: [] }],
  ])('refuses %s with 422 and records it', async (_name, input) => {
    const res = await send('commands/save-config', { clientId: 'x1', baseVersion: null, input });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await count()).toBe(0);
    expect((await refusedWrites())[0]).toMatchObject({ command: 'save-config', reason: 'invalid-input' });
  });

  it('is delivered by the sync pull (reconciliation)', async () => {
    const res = await put(null);
    const page = await pull();
    expect(page.rows.map((r: any) => [r.table, r.data.mode])).toEqual([['config', 2]]);
    expect(page.cursor).toBe(res.body.cursor);
  });
});

describe.each(['save-program', 'delete-program', 'save-config'])('%s', command => {
  it('refuses a malformed envelope', async () => {
    const res = await send(`commands/${command}`, { baseVersion: 1, input: { key: 'A' } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
  });

  it('needs a signed-in user', async () => {
    const res = await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});
