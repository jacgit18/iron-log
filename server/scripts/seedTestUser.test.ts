import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { seedTestUser } from './seedTestUser.ts';

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

// The dev sign-in names an account "dev:<name>", so the seeded account can be read back through the API.
const FROM = 'dev:owner';
const TO = 'dev:tester';
const apply = (over: Partial<{ from: string; to: string; apply: boolean }> = {}) => seedTestUser(db, { from: FROM, to: TO, apply: true, ...over });
const idOf = async (authId: string) => (await db.selectFrom('users').select('id').where('auth_user_id', '=', authId).executeTakeFirst())?.id;

// The owner's account: everything the app can hold, so the test shows what is and is not copied.
async function seedOwner() {
  const { id } = await db.insertInto('users').values({ auth_user_id: FROM, change_seq: 9 }).returning('id').executeTakeFirstOrThrow();
  const common = { user_id: id, seq: 1 };
  await db.insertInto('library_items').values([
    { ...common, client_id: 'v1', data: JSON.stringify({ id: 'v1', name: 'My cut' }) },
    { ...common, client_id: 'v2', data: JSON.stringify({ id: 'v2', name: 'Bulk' }) },
    { ...common, client_id: 'v-gone', deleted_at: new Date(), data: JSON.stringify({ id: 'v-gone', name: 'Deleted' }) },
  ]).execute();
  await db.insertInto('list_items').values([
    { ...common, list: 'stretch', client_id: 's1', position: 0, data: JSON.stringify({ id: 's1', n: 'Scarecrow' }) },
    { ...common, list: 'stretch', client_id: 's2', position: 1, data: JSON.stringify({ id: 's2', n: 'Reach' }) },
    { ...common, list: 'stretch_experiment', client_id: 'se1', position: 0, data: JSON.stringify({ id: 'se1', n: 'Pigeon' }) },
    { ...common, list: 'experiment', client_id: 'x1', position: 0, data: JSON.stringify({ id: 'x1', ex: 'squat' }) },
    { ...common, list: 'supplement_item', client_id: 'creatine', position: 0, data: JSON.stringify({ id: 'creatine', n: 'Creatine' }) },
    { ...common, list: 'stretch', client_id: 's-gone', position: 2, deleted_at: new Date(), data: JSON.stringify({ id: 's-gone', n: 'Deleted' }) },
  ]).execute();
  await db.insertInto('programs').values({ ...common, key: 'A', data: '{}' }).execute();
  await db.insertInto('config').values({ ...common, data: '{"mode":2}' }).execute();
  await db.insertInto('weeks').values({ ...common, week_start: '2026-10-04', data: '{}' }).execute();
  await db.insertInto('stretch_weeks').values({ ...common, week_start: '2026-10-04', data: '{}' }).execute();
  await db.insertInto('supplement_days').values({ ...common, day: '2026-10-07' }).execute();
  await db.insertInto('body_entries').values({ ...common, wk: '2026-10-04', d: '2026-10-07', weight_lb: '180' }).execute();
  await db.insertInto('log_entries').values({ ...common, client_id: 'e1', exercise_id: 'squat', d: '2026-10-07' }).execute();
  return id;
}

const listOf = async (userId: string) => (await db.selectFrom('list_items').select(['list', 'client_id', 'position']).where('user_id', '=', userId).orderBy('list').orderBy('client_id').execute());
const libraryOf = async (userId: string) => (await db.selectFrom('library_items').select('client_id').where('user_id', '=', userId).orderBy('client_id').execute()).map(r => r.client_id);

describe('seedTestUser', () => {
  it('creates a blank test account and copies the libraries and the three lists', async () => {
    await seedOwner();
    const result = await apply();
    expect(result).toEqual({ applied: true, targetCreated: true, libraryItems: { copied: 2, skipped: 0 }, listItems: { copied: 4, skipped: 0 } });
    const to = (await idOf(TO))!;
    expect(await libraryOf(to)).toEqual(['v1', 'v2']);
    expect(await listOf(to)).toEqual([
      { list: 'experiment', client_id: 'x1', position: 0 },
      { list: 'stretch', client_id: 's1', position: 0 },
      { list: 'stretch', client_id: 's2', position: 1 },
      { list: 'stretch_experiment', client_id: 'se1', position: 0 },
    ]);
    const copied = await db.selectFrom('library_items').selectAll().where('user_id', '=', to).where('client_id', '=', 'v1').executeTakeFirstOrThrow();
    expect(copied).toMatchObject({ version: 1, deleted_at: null, data: { id: 'v1', name: 'My cut' } });
  });

  it('copies nothing else: no programs, config, weeks, body weight, supplements or log entries', async () => {
    await seedOwner();
    await apply();
    const to = (await idOf(TO))!;
    for (const table of ['programs', 'config', 'weeks', 'stretch_weeks', 'supplement_days', 'body_entries', 'log_entries'] as const) {
      expect(await db.selectFrom(table).select('id').where('user_id', '=', to).execute(), table).toEqual([]);
    }
    expect((await listOf(to)).some(r => r.list === 'supplement_item')).toBe(false);
  });

  it('does not copy what the owner deleted', async () => {
    await seedOwner();
    await apply();
    const to = (await idOf(TO))!;
    expect(await libraryOf(to)).not.toContain('v-gone');
    expect((await listOf(to)).map(r => r.client_id)).not.toContain('s-gone');
  });

  it('gives every copied row one seq and moves the test account cursor once', async () => {
    await seedOwner();
    await apply();
    const to = (await idOf(TO))!;
    const seqs = new Set([
      ...(await db.selectFrom('library_items').select('seq').where('user_id', '=', to).execute()).map(r => r.seq),
      ...(await db.selectFrom('list_items').select('seq').where('user_id', '=', to).execute()).map(r => r.seq),
    ]);
    expect(seqs).toEqual(new Set(['1']));
    expect((await db.selectFrom('users').select('change_seq').where('id', '=', to).executeTakeFirstOrThrow()).change_seq).toBe('1');
  });

  it('leaves the owner account exactly as it was', async () => {
    const from = await seedOwner();
    const before = JSON.stringify([await listOf(from), await libraryOf(from), (await db.selectFrom('users').selectAll().where('id', '=', from).executeTakeFirstOrThrow())]);
    await apply();
    const after = JSON.stringify([await listOf(from), await libraryOf(from), (await db.selectFrom('users').selectAll().where('id', '=', from).executeTakeFirstOrThrow())]);
    expect(after).toBe(before);
  });

  it('delivers the copied rows to the test account through the sync pull', async () => {
    await seedOwner();
    await apply();
    const page = (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-dev-user': 'tester' } })).json()) as any;
    expect(page.rows.map((r: any) => `${r.table}:${r.list ?? ''}:${r.client_id}`).sort()).toEqual([
      'library_items::v1',
      'library_items::v2',
      'list_items:experiment:x1',
      'list_items:stretch:s1',
      'list_items:stretch:s2',
      'list_items:stretch_experiment:se1',
    ]);
    expect(page.cursor).toBe('1');
    expect(page.more).toBe(false);
  });

  describe('running it again', () => {
    it('copies nothing, adds no rows and does not move the cursor', async () => {
      await seedOwner();
      await apply();
      const to = (await idOf(TO))!;
      const rows = async () => JSON.stringify([await listOf(to), await libraryOf(to), (await db.selectFrom('users').select('change_seq').where('id', '=', to).executeTakeFirstOrThrow()).change_seq]);
      const before = await rows();
      const again = await apply();
      expect(again).toEqual({ applied: true, targetCreated: false, libraryItems: { copied: 0, skipped: 2 }, listItems: { copied: 0, skipped: 4 } });
      expect(await rows()).toBe(before);
    });

    it('copies only what is new in the owner account since', async () => {
      const from = await seedOwner();
      await apply();
      await db.insertInto('library_items').values({ user_id: from, client_id: 'v3', seq: 2, data: '{"id":"v3","name":"New"}' }).execute();
      await db.insertInto('list_items').values({ user_id: from, list: 'experiment', client_id: 'x2', position: 1, seq: 2, data: '{"id":"x2","ex":"bench"}' }).execute();
      const again = await apply();
      expect(again).toMatchObject({ libraryItems: { copied: 1, skipped: 2 }, listItems: { copied: 1, skipped: 4 } });
      const to = (await idOf(TO))!;
      expect(await libraryOf(to)).toEqual(['v1', 'v2', 'v3']);
      expect((await db.selectFrom('users').select('change_seq').where('id', '=', to).executeTakeFirstOrThrow()).change_seq).toBe('2');
    });

    it('does not bring back an item the test user deleted, and does not overwrite one they edited', async () => {
      await seedOwner();
      await apply();
      const to = (await idOf(TO))!;
      await db.updateTable('library_items').set({ deleted_at: new Date(), version: 2 }).where('user_id', '=', to).where('client_id', '=', 'v1').execute();
      await db.updateTable('list_items').set({ data: '{"id":"s1","n":"My own name"}', version: 2 }).where('user_id', '=', to).where('client_id', '=', 's1').execute();
      const again = await apply();
      expect(again).toMatchObject({ libraryItems: { copied: 0 }, listItems: { copied: 0 } });
      expect((await db.selectFrom('library_items').select('deleted_at').where('user_id', '=', to).where('client_id', '=', 'v1').executeTakeFirstOrThrow()).deleted_at).not.toBeNull();
      expect((await db.selectFrom('list_items').select('data').where('user_id', '=', to).where('client_id', '=', 's1').executeTakeFirstOrThrow()).data).toEqual({ id: 's1', n: 'My own name' });
    });

    it('keeps the same client id in two lists apart', async () => {
      const from = await seedOwner();
      await db.insertInto('list_items').values({ user_id: from, list: 'experiment', client_id: 's1', position: 5, seq: 1, data: '{"id":"s1","ex":"squat"}' }).execute();
      const result = await apply();
      expect(result.listItems.copied).toBe(5);
      const to = (await idOf(TO))!;
      expect((await listOf(to)).filter(r => r.client_id === 's1').map(r => r.list).sort()).toEqual(['experiment', 'stretch']);
    });
  });

  describe('dry run', () => {
    it('reports what would be copied and writes nothing, not even the test account', async () => {
      await seedOwner();
      const result = await apply({ apply: false });
      expect(result).toEqual({ applied: false, targetCreated: false, libraryItems: { copied: 2, skipped: 0 }, listItems: { copied: 4, skipped: 0 } });
      expect(await idOf(TO)).toBeUndefined();
      expect(await db.selectFrom('library_items').select('id').execute()).toHaveLength(3);
    });

    it('reports the skips for an account that already has some', async () => {
      await seedOwner();
      await apply();
      const result = await apply({ apply: false });
      expect(result).toMatchObject({ applied: false, libraryItems: { copied: 0, skipped: 2 }, listItems: { copied: 0, skipped: 4 } });
    });
  });

  describe('refusals', () => {
    it('refuses to seed an account from itself', async () => {
      await seedOwner();
      await expect(apply({ to: FROM })).rejects.toThrow('same account');
    });

    it('refuses when the source account does not exist, and creates nothing', async () => {
      await expect(apply({ from: 'dev:nobody' })).rejects.toThrow('no account with auth_user_id "dev:nobody"');
      expect(await idOf(TO)).toBeUndefined();
    });

    it('works for an owner with nothing to copy', async () => {
      await db.insertInto('users').values({ auth_user_id: FROM }).execute();
      const result = await apply();
      expect(result).toEqual({ applied: true, targetCreated: true, libraryItems: { copied: 0, skipped: 0 }, listItems: { copied: 0, skipped: 0 } });
      expect((await db.selectFrom('users').select('change_seq').where('id', '=', (await idOf(TO))!).executeTakeFirstOrThrow()).change_seq).toBe('0');
    });
  });
});
