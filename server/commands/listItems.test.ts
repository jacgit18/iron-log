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
const count = async () => (await db.selectFrom('list_items').selectAll().execute()).length;

// The same behavior holds for every list, so one suite runs against each (a grocery store, whose id is its name, has its own tests below).
describe.each([
  { list: 'stretch', item: { id: 'scarecrow', n: 'Scarecrow', group: 'Bands', tier: 'primary' }, changed: { id: 'scarecrow', n: 'Scarecrow 2', group: 'Bands', tier: 'secondary' }, stored: { id: 'scarecrow', n: 'Scarecrow', group: 'Bands', tier: 'primary' } },
  { list: 'stretch_experiment', item: { id: 'pigeon', n: 'Pigeon' }, changed: { id: 'pigeon', n: 'Pigeon pose', note: 'hold 30s' }, stored: { id: 'pigeon', n: 'Pigeon' } },
  { list: 'experiment', item: { id: 'x1', ex: 'squat', ph: 'hyp', note: 'try it' }, changed: { id: 'x1', ex: 'squat', ph: 'strength', note: 'heavy' }, stored: { id: 'x1', ex: 'squat', ph: 'hyp', note: 'try it' } },
  { list: 'supplement_item', item: { id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' }, changed: { id: 'creatine', n: 'Creatine', slot: 'night', dose: '5 g' }, stored: { id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' } },
  { list: 'grocery_item', item: { id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, every: false, out: true }, changed: { id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 275, every: false, out: false }, stored: { id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, every: false, out: true } },
])('$list', ({ list, item, changed, stored }) => {
  const id = item.id;
  const put = (baseVersion: number | null, it: object = item, position = 0, clientId = 'c1', user = 'owner') =>
    send('commands/save-list-item', { clientId, baseVersion, input: { list, item: it, position } }, user);
  const del = (baseVersion: number | null, itemId = id, clientId = 'd1', user = 'owner') => send('commands/delete-list-item', { clientId, baseVersion, input: { list, id: itemId } }, user);
  const row = (itemId = id) => db.selectFrom('list_items').selectAll().where('list', '=', list).where('client_id', '=', itemId).executeTakeFirstOrThrow();

  describe('create', () => {
    it('saves one row keyed by the list and the item id, with its position', async () => {
      const res = await put(null, item, 3);
      expect(res.status).toBe(201);
      expect(res.body.rows[0]).toMatchObject({ list, client_id: id, position: 3, version: 1, schema_version: 1, deleted_at: null, data: stored });
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

    it('refuses a different item, or the same item at another position, under an id that already exists', async () => {
      await put(null);
      const other = await put(null, changed, 0, 'c2');
      expect(other.status).toBe(409);
      expect(other.body.refused).toBe('stale');
      expect(other.body.current.data).toEqual(stored);
      const moved = await put(null, item, 5, 'c3');
      expect(moved.status).toBe(409);
      expect(moved.body.current.position).toBe(0);
      expect((await refusedWrites())[0]).toMatchObject({ command: 'save-list-item', reason: 'stale', client_version: 'test-1' });
    });

    it('keeps one row per id, and each user has their own', async () => {
      await put(null);
      expect((await put(null, { ...item, id: 'other-id' }, 1)).status).toBe(201);
      expect((await put(null, item, 0, 'c1', 'tester')).status).toBe(201);
      expect(await count()).toBe(3);
    });

    it('survives the same save sent at once', async () => {
      const results = await Promise.all([put(null), put(null), put(null)]);
      expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);
      expect(await count()).toBe(1);
    });
  });

  describe('edit', () => {
    it('replaces the item with the version the phone saw and keeps the old one in row_history', async () => {
      await put(null);
      const res = await put(1, changed);
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ version: 2, data: changed });
      const history = await db.selectFrom('row_history').selectAll().execute();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ table_name: 'list_items', version: 1 });
    });

    it('moves an item by saving it at a new position', async () => {
      await put(null, item, 0);
      const res = await put(1, item, 4);
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ version: 2, position: 4, data: stored });
    });

    it('refuses a stale edit with the current row, and treats an edit retry as a success', async () => {
      await put(null);
      await put(1, changed);
      const retry = await put(1, changed);
      expect(retry.status).toBe(200);
      expect(retry.body.rows[0].version).toBe(2);
      const stale = await put(1, item);
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

  describe('delete', () => {
    it('tombstones the row, bumps version and seq, and keeps the item', async () => {
      const made = await put(null);
      const res = await del(1);
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ list, client_id: id, version: 2 });
      expect(res.body.rows[0].deleted_at).not.toBeNull();
      expect(Number(res.body.cursor)).toBeGreaterThan(Number(made.body.cursor));
      expect((await row()).data).toEqual(stored);
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
      await put(1, changed);
      const res = await del(1);
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('stale');
      expect((await row()).deleted_at).toBeNull();
    });

    it("refuses an id with no row, and can't reach another user's", async () => {
      expect((await del(1, 'nope')).body.refused).toBe('not-found');
      await put(null, item, 0, 'c1', 'tester');
      expect((await del(1)).body.refused).toBe('not-found');
      expect((await row()).deleted_at).toBeNull();
    });

    it('then refuses an edit of the deleted item with the tombstone (FM-05)', async () => {
      await put(null);
      await del(1);
      const res = await put(1, changed);
      expect(res.status).toBe(409);
      expect(res.body.refused).toBe('deleted');
      expect(res.body.current.deleted_at).not.toBeNull();
    });

    it('revives the same row, at its new position, when the deleted id is saved again', async () => {
      const first = await put(null);
      await del(1);
      const res = await put(null, changed, 2, 'c2');
      expect(res.status).toBe(200);
      expect(res.body.rows[0]).toMatchObject({ id: first.body.rows[0].id, version: 3, position: 2, deleted_at: null, data: changed });
      expect(await count()).toBe(1);
    });
  });

  it('is delivered by the sync pull as the item and its tombstone (reconciliation)', async () => {
    await put(null);
    await put(null, { ...item, id: 'second' }, 1);
    const res = await del(1, 'second');
    const page = await pull();
    expect(page.rows.map((r: any) => [r.table, r.list, r.client_id, r.deleted_at !== null])).toEqual([
      ['list_items', list, id, false],
      ['list_items', list, 'second', true],
    ]);
    expect(page.cursor).toBe(res.body.cursor);
    expect(page.more).toBe(false);
  });
});

describe('lists together', () => {
  it('lets the same id live in two lists', async () => {
    const a = await send('commands/save-list-item', { clientId: 'a', baseVersion: null, input: { list: 'stretch', item: { id: 'shared', n: 'Shared' }, position: 0 } });
    const b = await send('commands/save-list-item', { clientId: 'b', baseVersion: null, input: { list: 'stretch_experiment', item: { id: 'shared', n: 'Shared' }, position: 0 } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await count()).toBe(2);
    await send('commands/delete-list-item', { clientId: 'd', baseVersion: 1, input: { list: 'stretch', id: 'shared' } });
    const live = await db.selectFrom('list_items').select('list').where('deleted_at', 'is', null).execute();
    expect(live.map(r => r.list)).toEqual(['stretch_experiment']);
  });

  it('pages across lists and tables without splitting a command', async () => {
    await send('commands/save-list-item', { clientId: 'a', baseVersion: null, input: { list: 'stretch', item: { id: 's1', n: 'One' }, position: 0 } });
    await send('commands/save-list-item', { clientId: 'b', baseVersion: null, input: { list: 'experiment', item: { id: 'x1', ex: 'squat' }, position: 0 } });
    await send('commands/log-session', { clientId: 'e1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-07', w: 135 } } });
    const seen: string[] = [];
    let since = '0';
    for (let i = 0; i < 6; i++) {
      const page = await pull(`since=${since}&limit=1`);
      seen.push(...page.rows.map((r: any) => `${r.table}:${r.list ?? ''}:${r.client_id}`));
      since = page.cursor;
      if (!page.more) break;
    }
    expect(seen).toEqual(['list_items:stretch:s1', 'list_items:experiment:x1', 'log_entries::e1']);
  });
});

describe('list item cleaning and refusals', () => {
  const put = (input: object, baseVersion: number | null = null) => send('commands/save-list-item', { clientId: 'x1', baseVersion, input });

  it('stores the cleaned item: junk dropped, a bad stretch url removed, an unknown supplement slot kept in the library', async () => {
    const a = await put({ list: 'stretch', position: 0, item: { id: 's1', n: 'Reach', url: 'javascript:alert(1)', junk: 1 } });
    expect(a.body.rows[0].data).toEqual({ id: 's1', n: 'Reach', group: 'Other', tier: '' });
    const b = await put({ list: 'supplement_item', position: 0, item: { id: 'zinc', n: 'Zinc', slot: 'weekly' } });
    expect(b.body.rows[0].data).toEqual({ id: 'zinc', n: 'Zinc', slot: '' });
  });

  it.each([
    ['another list', { list: 'other', position: 0, item: { id: 'a', n: 'A' } }],
    ['no position', { list: 'stretch', item: { id: 'a', n: 'A' } }],
    ['a position below 0', { list: 'stretch', position: -1, item: { id: 'a', n: 'A' } }],
    ['a position that is not a whole number', { list: 'stretch', position: 1.5, item: { id: 'a', n: 'A' } }],
    ['no item', { list: 'stretch', position: 0 }],
    ['an item with no name', { list: 'stretch', position: 0, item: { id: 'a' } }],
    ['an experiment with no exercise', { list: 'experiment', position: 0, item: { id: 'a' } }],
    ['an id over 100 characters', { list: 'experiment', position: 0, item: { id: 'x'.repeat(101), ex: 'squat' } }],
  ])('refuses %s with 422 and records it', async (_name, input) => {
    const res = await put(input);
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await count()).toBe(0);
    expect((await refusedWrites())[0]).toMatchObject({ command: 'save-list-item', reason: 'invalid-input' });
  });

  it.each([
    ['no base version', { list: 'stretch', id: 'a' }, null],
    ['another list', { list: 'other', id: 'a' }, 1],
    ['an empty id', { list: 'stretch', id: '' }, 1],
  ])('refuses a delete with %s', async (_name, input, baseVersion) => {
    const res = await send('commands/delete-list-item', { clientId: 'x1', baseVersion, input });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect((await refusedWrites())[0]).toMatchObject({ command: 'delete-list-item', reason: 'invalid-input' });
  });

  it.each(['save-list-item', 'delete-list-item'])('refuses a malformed %s envelope', async command => {
    const res = await send(`commands/${command}`, { baseVersion: 1, input: { list: 'stretch', id: 'a' } });
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('bad-envelope');
  });

  it.each(['save-list-item', 'delete-list-item'])('needs a signed-in user for %s', async command => {
    const res = await fetch(`${base}/api/commands/${command}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });
});

// ADR 039: the grocery list's stores are rows of their own (the name is the id), and both grocery lists have the app's caps.
describe('grocery lists', () => {
  const item = (i: number) => ({ id: `item-${i}`, n: `Item ${i}`, store: '', qty: 1, cents: null, every: true, out: false });
  const save = (list: string, it: object, position: number, baseVersion: number | null = null, clientId = `c-${list}-${position}`) =>
    send('commands/save-list-item', { clientId, baseVersion, input: { list, item: it, position } });
  const fillDirect = async (list: string, n: number, data: (i: number) => object) => {
    await send('commands/save-list-item', { clientId: 'first', baseVersion: null, input: { list, item: data(0), position: 0 } }); // makes the user
    const { id: userId } = await db.selectFrom('users').select('id').executeTakeFirstOrThrow();
    const rows = Array.from({ length: n - 1 }, (_, k) => ({ user_id: userId, list, client_id: (data(k + 1) as { id: string }).id, position: k + 1, seq: '1', data: JSON.stringify(data(k + 1)) }));
    if (rows.length) await db.insertInto('list_items').values(rows).execute();
  };

  it('keeps a store as {id, n} with the name as the id, and deletes it by name', async () => {
    const res = await save('grocery_store', { id: 'Aldi', n: 'Aldi' }, 0);
    expect(res.status).toBe(201);
    expect(res.body.rows[0]).toMatchObject({ list: 'grocery_store', client_id: 'Aldi', data: { id: 'Aldi', n: 'Aldi' } });
    const del = await send('commands/delete-list-item', { clientId: 'd1', baseVersion: 1, input: { list: 'grocery_store', id: 'Aldi' } });
    expect(del.status).toBe(200);
    expect(del.body.rows[0].deleted_at).not.toBeNull();
  });

  it.each([
    ['a store whose id is not its name', 'grocery_store', { id: 'Aldi', n: 'Lidl' }],
    ['a store name over 40 characters', 'grocery_store', { id: 'x'.repeat(41), n: 'x'.repeat(41) }],
    ['an item name over 80 characters', 'grocery_item', { ...item(1), n: 'x'.repeat(81) }],
    ['an item store over 40 characters', 'grocery_item', { ...item(1), store: 'x'.repeat(41) }],
    ['a count of 0', 'grocery_item', { ...item(1), qty: 0 }],
    ['a count over 999', 'grocery_item', { ...item(1), qty: 1000 }],
    ['a price that is not whole cents', 'grocery_item', { ...item(1), cents: 2.5 }],
    ['a price over $999,999.99', 'grocery_item', { ...item(1), cents: 100_000_000 }],
    ['an Every-month item marked out', 'grocery_item', { ...item(1), every: true, out: true }],
  ])('refuses %s with 422', async (_name, list, it) => {
    const res = await save(list, it, 0);
    expect(res.status).toBe(422);
    expect(res.body.refused).toBe('invalid-input');
    expect(await count()).toBe(0);
  });

  it('refuses a 501st live item, but takes an edit at the cap and a new one once one is deleted', async () => {
    await fillDirect('grocery_item', 500, item);
    const over = await save('grocery_item', item(500), 500);
    expect(over.status).toBe(422);
    expect(over.body.refused).toBe('too-many');
    expect((await refusedWrites()).at(-1)).toMatchObject({ command: 'save-list-item', reason: 'too-many' });
    const { version } = await db.selectFrom('list_items').select('version').where('client_id', '=', 'item-0').executeTakeFirstOrThrow();
    expect((await save('grocery_item', { ...item(0), qty: 3 }, 0, version, 'edit')).status).toBe(200); // an edit is not a new row
    expect((await send('commands/delete-list-item', { clientId: 'd1', baseVersion: version + 1, input: { list: 'grocery_item', id: 'item-0' } })).status).toBe(200);
    expect((await save('grocery_item', item(500), 500)).status).toBe(201);
    // Reviving the deleted one is a new live row too, so it is over the cap again.
    expect((await save('grocery_item', item(0), 0, null, 'revive')).body.refused).toBe('too-many');
  });

  it('refuses a 61st store (30 in use and as many retired), and the cap is per list and per user', async () => {
    await fillDirect('grocery_store', 60, i => ({ id: `Store ${i}`, n: `Store ${i}` }));
    expect((await save('grocery_store', { id: 'One more', n: 'One more' }, 60)).body.refused).toBe('too-many');
    expect((await save('grocery_item', item(1), 0)).status).toBe(201); // items have their own cap
    expect((await send('commands/save-list-item', { clientId: 'other', baseVersion: null, input: { list: 'grocery_store', item: { id: 'Aldi', n: 'Aldi' }, position: 0 } }, 'tester')).status).toBe(201);
  });
});
