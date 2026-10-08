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

// A six-day program with one card a day; the server pads it to seven days.
const program = (squatW = 135) => ({ days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [{ id: `A-d${i + 1}s1`, items: [{ ex: 'squat', ph: 'strength', w: squatW }] }] })) });
const item = (over: object = {}) => ({ id: 'v1', name: 'My cut', from: 'A', at: '2026-10-07T12:00:00Z', prog: program(), ...over });

const put = (baseVersion: number | null, it: object = item(), clientId = 'c1', user = 'owner') => send('commands/save-library-item', { clientId, baseVersion, input: { item: it } }, user);
const del = (baseVersion: number | null, id = 'v1', clientId = 'd1', user = 'owner') => send('commands/delete-library-item', { clientId, baseVersion, input: { id } }, user);
const row = (id = 'v1') => db.selectFrom('library_items').selectAll().where('client_id', '=', id).executeTakeFirstOrThrow();
const count = async () => (await db.selectFrom('library_items').selectAll().execute()).length;
const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();
const pull = async (query = 'since=0') => (await (await fetch(`${base}/api/sync?${query}`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;

describe('save-library-item create', () => {
  it('saves one row keyed by the item id, with the program padded to seven days', async () => {
    const res = await put(null);
    expect(res.status).toBe(201);
    expect(res.body.rows[0]).toMatchObject({ client_id: 'v1', version: 1, schema_version: 1, deleted_at: null });
    expect(res.body.rows[0].data).toMatchObject({ id: 'v1', name: 'My cut', from: 'A', at: '2026-10-07T12:00:00Z' });
    expect(res.body.rows[0].data.prog.days).toHaveLength(7);
    expect(res.body.cursor).toBe(res.body.rows[0].seq);
    const user = await db.selectFrom('users').select('change_seq').executeTakeFirstOrThrow();
    expect(user.change_seq).toBe(res.body.cursor);
  });

  it('returns the same row for a retry and writes nothing new', async () => {
    const first = await put(null);
    const retry = await put(null);
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].id).toBe(first.body.rows[0].id);
    expect(retry.body.cursor).toBe(first.body.cursor);
    expect(await count()).toBe(1);
  });

  it('refuses a different version saved under an id that already exists, with the current row', async () => {
    await put(null);
    const res = await put(null, item({ name: 'Other' }), 'c2');
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect(res.body.current.data.name).toBe('My cut');
    expect((await refusedWrites())[0]).toMatchObject({ command: 'save-library-item', reason: 'stale', client_version: 'test-1' });
  });

  it('keeps one row per id, and each user has their own', async () => {
    await put(null);
    expect((await put(null, item({ id: 'v2' }))).status).toBe(201);
    expect((await put(null, item(), 'c1', 'tester')).status).toBe(201);
    expect(await count()).toBe(3);
  });

  it('survives the same save sent at once', async () => {
    const results = await Promise.all([put(null), put(null), put(null)]);
    expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
    expect(await count()).toBe(1);
  });

  it('stores the cleaned item, not the raw one', async () => {
    const res = await put(null, item({ junk: 1, name: '' }));
    expect(res.body.rows[0].data.junk).toBeUndefined();
    expect(res.body.rows[0].data.name).toBe('Saved version');
  });
});

describe('save-library-item edit', () => {
  it('replaces the item with the version the phone saw and keeps the old one in row_history', async () => {
    await put(null);
    const res = await put(1, item({ name: 'Renamed' }));
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ version: 2 });
    expect(res.body.rows[0].data.name).toBe('Renamed');
    const history = await db.selectFrom('row_history').selectAll().execute();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ table_name: 'library_items', version: 1 });
  });

  it('refuses a stale edit with the current row, and treats an edit retry as a success', async () => {
    await put(null);
    await put(1, item({ name: 'Renamed' }));
    const retry = await put(1, item({ name: 'Renamed' }));
    expect(retry.status).toBe(200);
    expect(retry.body.rows[0].version).toBe(2);
    const stale = await put(1, item({ name: 'Third' }));
    expect(stale.status).toBe(409);
    expect(stale.body.refused).toBe('stale');
    expect(stale.body.current).toMatchObject({ version: 2 });
    expect(await refusedWrites()).toHaveLength(1);
  });

  it('refuses an edit of an id that has no row', async () => {
    const res = await put(1);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ refused: 'not-found', current: null });
  });
});

describe('delete-library-item', () => {
  it('tombstones the row, bumps version and seq, and keeps the item', async () => {
    const made = await put(null);
    const res = await del(1);
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ client_id: 'v1', version: 2 });
    expect(res.body.rows[0].deleted_at).not.toBeNull();
    expect(Number(res.body.cursor)).toBeGreaterThan(Number(made.body.cursor));
    expect((await row()).data).toMatchObject({ name: 'My cut' });
  });

  it('is a success that changes nothing when the item is already deleted', async () => {
    await put(null);
    const first = await del(1);
    const retry = await del(1);
    expect(retry.status).toBe(200);
    expect(retry.body.cursor).toBe(first.body.cursor);
    expect(await refusedWrites()).toHaveLength(0);
  });

  it('refuses with the current row when the item was edited since (FM-05)', async () => {
    await put(null);
    await put(1, item({ name: 'Renamed' }));
    const res = await del(1);
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('stale');
    expect((await row()).deleted_at).toBeNull();
  });

  it("refuses an id with no row, and can't reach another user's", async () => {
    expect((await del(1, 'nope')).body.refused).toBe('not-found');
    await put(null, item(), 'c1', 'tester');
    expect((await del(1)).body.refused).toBe('not-found');
    expect((await row()).deleted_at).toBeNull();
  });

  it('then refuses an edit of the deleted item with the tombstone (FM-05)', async () => {
    await put(null);
    await del(1);
    const res = await put(1, item({ name: 'Renamed' }));
    expect(res.status).toBe(409);
    expect(res.body.refused).toBe('deleted');
    expect(res.body.current.deleted_at).not.toBeNull();
  });

  it('revives the same row when the deleted id is saved again', async () => {
    const first = await put(null);
    await del(1);
    const res = await put(null, item({ name: 'Back' }), 'c2');
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ id: first.body.rows[0].id, version: 3, deleted_at: null });
    expect(res.body.rows[0].data.name).toBe('Back');
    expect(await count()).toBe(1);
  });
});

describe('library items in the sync pull (reconciliation)', () => {
  it('delivers the item and its tombstone in seq order', async () => {
    await put(null);
    await put(null, item({ id: 'v2' }));
    const res = await del(1, 'v2');
    const page = await pull();
    expect(page.rows.map((r: any) => [r.table, r.client_id, r.deleted_at !== null])).toEqual([
      ['library_items', 'v1', false],
      ['library_items', 'v2', true],
    ]);
    expect(page.cursor).toBe(res.body.cursor);
    expect(page.more).toBe(false);
  });
});

describe('library item refusals', () => {
  it.each([
    ['no item', 'save-library-item', {}, null],
    ['a bad id', 'save-library-item', { item: item({ id: 'a b' }) }, null],
    ['a program with the wrong shape', 'save-library-item', { item: item({ prog: { days: 'x' } }) }, null],
    ['no base version on a delete', 'delete-library-item', { id: 'v1' }, null],
    ['an empty id on a delete', 'delete-library-item', { id: '' }, 1],
  ])('refuses %s with 422 and records it', async (_name, command, input, baseVersion) => {
    const res = await send(`commands/${command}`, { clientId: 'x1', baseVersion, input });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await count()).toBe(0);
    expect((await refusedWrites())[0]).toMatchObject({ command, reason: 'invalid-input' });
  });

  it.each(['save-library-item', 'delete-library-item'])('refuses a malformed %s envelope', async command => {
    const res = await send(`commands/${command}`, { baseVersion: 1, input: { id: 'v1' } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
  });

  it.each(['save-library-item', 'delete-library-item'])('needs a signed-in user for %s', async command => {
    const res = await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});
