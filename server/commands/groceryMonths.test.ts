import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { makeSend, startCommandApp } from '../test/commandApp.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
let base: string;

beforeAll(async () => {
  ({ db, base, stop } = await startCommandApp());
}, 120_000);

afterAll(async () => {
  await stop?.();
});

beforeEach(async () => {
  await db.deleteFrom('users').execute();
});

const WS = '2026-10';

const send = makeSend(() => base);
const refusedWrites = () => db.selectFrom('refused_writes').selectAll().execute();

// ADR 039: a month of the grocery list is a document row like a week: the same rules, keyed by the month.
describe.each([
  { name: 'grocery months', save: 'save-grocery-month', remove: 'delete-grocery-month', table: 'grocery_months' as const, doc: { lines: { kale: { got: true, qty: 2, cents: 250 } }, pulled: [] }, other: { lines: { kale: { got: true, qty: 2, cents: 250 }, rice: { got: true } }, pulled: [] } },
])('$name', ({ save, remove, table, doc, other }) => {
  const put = (baseVersion: number | null, record: object = doc, month = WS, clientId = 'c1', user = 'owner') => send(`commands/${save}`, { clientId, baseVersion, input: { month, record } }, user);
  const del = (baseVersion: number | null, month = WS, clientId = 'd1', user = 'owner') => send(`commands/${remove}`, { clientId, baseVersion, input: { month } }, user);
  const row = (month = WS) => db.selectFrom(table).selectAll().where('month', '=', month).executeTakeFirstOrThrow();
  const count = async () => (await db.selectFrom(table).selectAll().execute()).length;

  describe('create', () => {
    it('saves one row and bumps the cursor', async () => {
      const res = await put(null);
      expect(res.status).toBe(201);
      expect(res.body.rows[0]).toMatchObject({ month: WS, version: 1, schema_version: 1, deleted_at: null, data: doc });
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

    it('refuses a different document for a month that already has one, with the current row', async () => {
      await put(null);
      const res = await put(null, other, WS, 'c2');
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('stale');
      expect(res.body.current.data).toEqual(doc);
      expect((await refusedWrites())[0]).toMatchObject({ command: save, reason: 'stale', client_version: 'test-1' });
    });

    it('keeps one row per month, and each user has their own', async () => {
      await put(null);
      expect((await put(null, doc, '2026-11')).status).toBe(201);
      expect((await put(null, doc, WS, 'c1', 'tester')).status).toBe(201);
      expect(await count()).toBe(3);
    });

    it('survives the same save sent at once', async () => {
      const results = await Promise.all([put(null), put(null), put(null)]);
      expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
      expect(await count()).toBe(1);
    });

    it('stores the cleaned document, not the raw one', async () => {
      const res = await put(null, { ...doc, junk: 1, lines: { ...doc.lines, rice: { got: false, junk: 1 } } });
      expect(res.body.rows[0].data).toEqual(doc);
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

    it('refuses an edit of a month that has no row', async () => {
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
      expect(res.body.rows[0]).toMatchObject({ month: WS, version: 2 });
      expect(res.body.rows[0].deleted_at).not.toBeNull();
      expect(Number(res.body.cursor)).toBeGreaterThan(Number(made.body.cursor));
      expect((await row()).data).toEqual(doc);
    });

    it('is a success that changes nothing when the month is already deleted', async () => {
      await put(null);
      const first = await del(1);
      const retry = await del(1);
      expect(retry.status).toBe(200);
      expect(retry.body.cursor).toBe(first.body.cursor);
      expect(await refusedWrites()).toHaveLength(0);
    });

    it('refuses with the current row when the month was edited since (FM-05)', async () => {
      await put(null);
      await put(1, other);
      const res = await del(1);
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('stale');
      expect(res.body.current).toMatchObject({ version: 2 });
      expect((await row()).deleted_at).toBeNull();
    });

    it("refuses a month with no row, and can't reach another user's", async () => {
      expect((await del(1, '2026-11')).body.refused).toBe('not-found');
      await put(null, doc, WS, 'c1', 'tester');
      expect((await del(1)).body.refused).toBe('not-found');
      expect((await row()).deleted_at).toBeNull();
    });

    it('then refuses an edit of the deleted month with the tombstone (FM-05)', async () => {
      await put(null);
      await del(1);
      const res = await put(1, other);
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('deleted');
      expect(res.body.current.deleted_at).not.toBeNull();
    });

    it('revives the same row when the deleted month is saved again', async () => {
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
      await put(null, doc, '2026-11');
      const res = await del(1, '2026-11');
      const page = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'owner' } })).json()) as any;
      expect(page.rows.map((r: any) => [r.table, r.month, r.deleted_at !== null])).toEqual([
        [table, WS, false],
        [table, '2026-11', true],
      ]);
      expect(page.cursor).toBe(res.body.cursor);
      expect(page.more).toBe(false);
    });
  });

  describe('refusals', () => {
    it.each([
      ['a bad month', save, { month: '2026-13', record: doc }, null],
      ['a day instead of a month', save, { month: '2026-10-04', record: doc }, null],
      ['a missing record', save, { month: WS }, null],
      ['a record that is not an object', save, { month: WS, record: 'x' }, null],
      ['no base version on a delete', remove, { month: WS }, null],
      ['a bad month on a delete', remove, { month: 'nope' }, 1],
    ])('refuses %s with 422 and records it', async (_name, command, input, baseVersion) => {
      const res = await send(`commands/${command}`, { clientId: 'x1', baseVersion, input });
      expect(res.status).toBe(422);
      expect(res.body.refused).toBe('invalid-input');
      expect(await count()).toBe(0);
      expect((await refusedWrites())[0]).toMatchObject({ command, reason: 'invalid-input' });
    });

    it.each([save, remove])('refuses a malformed %s envelope', async command => {
      const res = await send(`commands/${command}`, { baseVersion: 1, input: { month: WS } });
      expect(res.status).toBe(422);
      expect(res.body.refused).toBe('bad-envelope');
    });

    it.each([save, remove])('needs a signed-in user for %s', async command => {
      const res = await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(res.status).toBe(401);
    });
  });
});

