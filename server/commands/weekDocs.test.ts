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

const WS = '2026-10-04';

async function send(path: string, body: unknown, user = 'owner') {
  const res = await fetch(`${base}/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-user': user, 'x-client-version': 'test-1' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();

// The same behavior holds for weeks and stretch weeks, so one suite runs against both.
describe.each([
  { name: 'weeks', save: 'save-week', remove: 'delete-week', table: 'weeks' as const, doc: { prog: 'A', done: { 'A-d1s1:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} }, other: { prog: 'A', done: { 'A-d1s1:0': true, 'A-d1s2:0': true }, skipped: {}, moved: {}, ph: {}, warm: {} } },
  { name: 'stretch weeks', save: 'save-stretch-week', remove: 'delete-stretch-week', table: 'stretch_weeks' as const, doc: { done: { '0:scarecrow': true }, skipped: {}, extra: [] }, other: { done: { '0:scarecrow': true, '1:scarecrow': true }, skipped: {}, extra: [] } },
])('$name', ({ save, remove, table, doc, other }) => {
  const put = (baseVersion: number | null, week: object = doc, weekStart = WS, clientId = 'c1', user = 'owner') => send(`commands/${save}`, { clientId, baseVersion, input: { weekStart, week } }, user);
  const del = (baseVersion: number | null, weekStart = WS, clientId = 'd1', user = 'owner') => send(`commands/${remove}`, { clientId, baseVersion, input: { weekStart } }, user);
  const row = (weekStart = WS) => db.selectFrom(table).selectAll().where('week_start', '=', weekStart).executeTakeFirstOrThrow();
  const count = async () => (await db.selectFrom(table).selectAll().execute()).length;

  describe('create', () => {
    it('saves one row and bumps the cursor', async () => {
      const res = await put(null);
      expect(res.status).toBe(201);
      expect(res.body.rows[0]).toMatchObject({ week_start: WS, version: 1, schema_version: 1, deleted_at: null, data: doc });
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

    it('refuses a different document for a week that already has one, with the current row', async () => {
      await put(null);
      const res = await put(null, other, WS, 'c2');
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('stale');
      expect(res.body.current.data).toEqual(doc);
      expect((await refusedWrites())[0]).toMatchObject({ command: save, reason: 'stale', client_version: 'test-1' });
    });

    it('keeps one row per week, and each user has their own', async () => {
      await put(null);
      expect((await put(null, doc, '2026-10-11')).status).toBe(201);
      expect((await put(null, doc, WS, 'c1', 'tester')).status).toBe(201);
      expect(await count()).toBe(3);
    });

    it('survives the same save sent at once', async () => {
      const results = await Promise.all([put(null), put(null), put(null)]);
      expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
      expect(await count()).toBe(1);
    });

    it('stores the cleaned document, not the raw one', async () => {
      const res = await put(null, { ...doc, junk: 1 });
      expect(res.body.rows[0].data.junk).toBeUndefined();
    });
  });

  describe('edit', () => {
    it('replaces the document with the version the phone saw and keeps the old one in row_history', async () => {
      await put(null);
      const res = await put(1, other);
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ version: 2, data: other });
      const history = await db.selectFrom('row_history').selectAll().execute();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ table_name: table, version: 1 });
    });

    it('refuses a stale edit with the current row', async () => {
      await put(null);
      await put(1, other);
      const res = await put(1, { ...doc, done: {} });
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('stale');
      expect(res.body.current).toMatchObject({ version: 2, data: other });
    });

    it('treats an edit retry as a success once its document is already stored', async () => {
      await put(null);
      await put(1, other);
      const retry = await put(1, other);
      expect(retry.status).toBe(200);
      expect(retry.body.rows[0].version).toBe(2);
      expect(await refusedWrites()).toHaveLength(0);
    });

    it('refuses an edit of a week that has no row', async () => {
      const res = await put(1);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ refused: 'not-found', current: null });
    });
  });

  describe('delete', () => {
    it('tombstones the row, bumps version and seq, and keeps the document', async () => {
      const made = await put(null);
      const res = await del(1);
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ week_start: WS, version: 2 });
      expect(res.body.rows[0].deleted_at).not.toBeNull();
      expect(Number(res.body.cursor)).toBeGreaterThan(Number(made.body.cursor));
      expect((await row()).data).toEqual(doc);
    });

    it('is a success that changes nothing when the week is already deleted', async () => {
      await put(null);
      const first = await del(1);
      const retry = await del(1);
      expect(retry.status).toBe(200);
      expect(retry.body.cursor).toBe(first.body.cursor);
      expect(await refusedWrites()).toHaveLength(0);
    });

    it('refuses with the current row when the week was edited since (FM-05)', async () => {
      await put(null);
      await put(1, other);
      const res = await del(1);
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('stale');
      expect(res.body.current).toMatchObject({ version: 2 });
      expect((await row()).deleted_at).toBeNull();
    });

    it("refuses a week with no row, and can't reach another user's", async () => {
      expect((await del(1, '2026-10-11')).body.refused).toBe('not-found');
      await put(null, doc, WS, 'c1', 'tester');
      expect((await del(1)).body.refused).toBe('not-found');
      expect((await row()).deleted_at).toBeNull();
    });

    it('then refuses an edit of the deleted week with the tombstone (FM-05)', async () => {
      await put(null);
      await del(1);
      const res = await put(1, other);
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('deleted');
      expect(res.body.current.deleted_at).not.toBeNull();
    });

    it('revives the same row when the deleted week is saved again', async () => {
      const first = await put(null);
      await del(1);
      const res = await put(null, other, WS, 'c2');
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ id: first.body.rows[0].id, version: 3, deleted_at: null, data: other });
      expect(await count()).toBe(1);
    });
  });

  describe('sync pull (reconciliation)', () => {
    it('delivers the document and its tombstone in seq order', async () => {
      await put(null);
      await put(null, doc, '2026-10-11');
      const res = await del(1, '2026-10-11');
      const page = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
      expect(page.rows.map((r: any) => [r.table, r.week_start, r.deleted_at !== null])).toEqual([
        [table, WS, false],
        [table, '2026-10-11', true],
      ]);
      expect(page.cursor).toBe(res.body.cursor);
      expect(page.more).toBe(false);
    });
  });

  describe('refusals', () => {
    it.each([
      ['a bad week start', save, { weekStart: 'nope', week: doc }, null],
      ['a missing week', save, { weekStart: WS }, null],
      ['a week that is not an object', save, { weekStart: WS, week: 'x' }, null],
      ['no base version on a delete', remove, { weekStart: WS }, null],
      ['a bad week start on a delete', remove, { weekStart: 'nope' }, 1],
    ])('refuses %s with 422 and records it', async (_name, command, input, baseVersion) => {
      const res = await send(`commands/${command}`, { clientId: 'x1', baseVersion, input });
      expect(res.status).toBe(422);
      expect(res.body.refused).toBe('invalid-input');
      expect(await count()).toBe(0);
      expect((await refusedWrites())[0]).toMatchObject({ command, reason: 'invalid-input' });
    });

    it.each([save, remove])('refuses a malformed %s envelope', async command => {
      const res = await send(`commands/${command}`, { baseVersion: 1, input: { weekStart: WS } });
      expect(res.status).toBe(422);
      expect(res.body.refused).toBe('bad-envelope');
    });

    it.each([save, remove])('needs a signed-in user for %s', async command => {
      const res = await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(res.status).toBe(401);
    });
  });
});

describe('weeks and stretch weeks together', () => {
  it('page across both tables in one feed without splitting a command', async () => {
    const week = { prog: 'A', done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
    await send('commands/save-week', { clientId: 'w1', baseVersion: null, input: { weekStart: WS, week } });
    await send('commands/save-stretch-week', { clientId: 's1', baseVersion: null, input: { weekStart: WS, week: { done: {}, skipped: {}, extra: [] } } });
    await send('commands/save-week', { clientId: 'w2', baseVersion: null, input: { weekStart: '2026-10-11', week } });
    const seen: string[] = [];
    let since = '0';
    for (let i = 0; i < 6; i++) {
      const page = (await (await fetch(`${base}/api/sync?since=${since}&limit=1`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
      seen.push(...page.rows.map((r: any) => `${r.table}:${r.week_start}`));
      since = page.cursor;
      if (!page.more) break;
    }
    expect(seen).toEqual([`weeks:${WS}`, `stretch_weeks:${WS}`, 'weeks:2026-10-11']);
  });
});
