import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { resetAccounts } from './resetAccounts.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;

beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await stop?.(); });
beforeEach(async () => { await db.deleteFrom('users').execute(); });

const ADMIN = 'dev:owner';
// Stand-ins for the built-in plan and default stretches (app code the server may not import, ADR 015).
const BUILTIN = { A: { key: 'A', days: [{ title: 'Day 1', slots: [{ id: 'A-d1s1', items: [{ ex: 'squat' }] }] }] }, B: { key: 'B', days: [] } };
const DEFAULT_STRETCHES = [{ id: 'scarecrow', n: 'Scarecrow', group: 'Bands', tier: 'primary' }, { id: 'reach', n: 'Reach', group: 'Back', tier: 'primary' }];
const defaults = { programs: BUILTIN, stretches: DEFAULT_STRETCHES };
const run = (apply = true) => resetAccounts(db, { admin: ADMIN, apply, defaults });

// An account with everything the reset touches and everything it must leave alone.
async function seed(authId: string, { programs = true, stretches = true } = {}) {
  const { id } = await db.insertInto('users').values({ auth_user_id: authId, change_seq: 9, is_admin: authId === ADMIN }).returning('id').executeTakeFirstOrThrow();
  const common = { user_id: id, seq: 1 };
  await db.insertInto('library_items').values({ ...common, client_id: 'v1', data: JSON.stringify({ id: 'v1', name: 'Push Pull v2' }) }).execute();
  if (stretches) await db.insertInto('list_items').values({ ...common, list: 'stretch', client_id: 's1', position: 0, data: JSON.stringify({ id: 's1', n: 'Reach' }) }).execute();
  await db.insertInto('list_items').values([
    { ...common, list: 'stretch_experiment', client_id: 'se1', position: 0, data: JSON.stringify({ id: 'se1', n: 'Pigeon' }) },
    { ...common, list: 'experiment', client_id: 'x1', position: 0, data: JSON.stringify({ id: 'x1', ex: 'squat' }) },
    { ...common, list: 'supplement_item', client_id: 'creatine', position: 0, data: JSON.stringify({ id: 'creatine', n: 'Creatine' }) },
  ]).execute();
  if (programs) await db.insertInto('programs').values([{ ...common, key: 'A', data: '{"key":"A","days":[]}' }, { ...common, key: 'B', data: '{"key":"B","days":[]}' }]).execute();
  await db.insertInto('config').values({ ...common, data: JSON.stringify({ mode: 2, rest: 90, ex: { mine: { n: 'Mine' } }, muscleMap: { squat: {} }, progNames: { A: 'Mine' }, phDef: { s1: 'hyp' } }) }).execute();
  await db.insertInto('log_entries').values({ ...common, client_id: 'e1', exercise_id: 'squat', d: '2026-10-07' }).execute();
  await db.insertInto('body_entries').values({ ...common, wk: '2026-10-04', d: '2026-10-07', weight_lb: '180' }).execute();
  return id;
}

const live = async (table: 'programs' | 'library_items' | 'list_items' | 'log_entries' | 'body_entries', userId: string) =>
  db.selectFrom(table).selectAll().where('user_id', '=', userId).where('deleted_at', 'is', null).execute();
const configOf = async (userId: string) => (await db.selectFrom('config').select('data').where('user_id', '=', userId).executeTakeFirstOrThrow()).data;

describe('resetAccounts', () => {
  it('leaves the admin exactly as they were when everything they see is saved', async () => {
    const admin = await seed(ADMIN);
    const before = await Promise.all([live('programs', admin), live('library_items', admin), live('list_items', admin), configOf(admin)]);
    const result = await run();
    expect(result.admin).toEqual({ userId: admin, programsWritten: [], stretchesWritten: 0 });
    expect(await Promise.all([live('programs', admin), live('library_items', admin), live('list_items', admin), configOf(admin)])).toEqual(before);
  });

  it('saves the built-in plan and default stretches the admin was being shown from code', async () => {
    const admin = await seed(ADMIN, { programs: false, stretches: false });
    await db.deleteFrom('list_items').where('user_id', '=', admin).where('list', '=', 'stretch_experiment').execute();
    const result = await run();
    expect(result.admin.programsWritten).toEqual(['A', 'B']);
    expect(result.admin.stretchesWritten).toBe(DEFAULT_STRETCHES.length);
    const progs = await live('programs', admin);
    expect(progs.map(p => [p.key, p.data])).toEqual([['A', BUILTIN.A], ['B', BUILTIN.B]].map(([k, p]) => [k, JSON.parse(JSON.stringify(p))]));
    const str = (await live('list_items', admin)).filter(r => r.list === 'stretch').sort((a, b) => a.position - b.position);
    expect(str.map(r => r.client_id)).toEqual(DEFAULT_STRETCHES.map(s => s.id));
    expect(new Set(progs.concat(str as never).map(r => r.seq)).size).toBe(progs.length + str.length); // each write has its own seq
  });

  it('clears other accounts’ programs, Program library, stretch list and exercise edits, and nothing else', async () => {
    await seed(ADMIN);
    const other = await seed('dev:tester');
    const result = await run();
    expect(result.others).toEqual({ accounts: 1, programs: 2, libraryItems: 1, stretches: 1, configs: 1 });
    expect(await live('programs', other)).toEqual([]);
    expect(await live('library_items', other)).toEqual([]);
    expect((await live('list_items', other)).map(r => r.list).sort()).toEqual(['experiment', 'stretch_experiment', 'supplement_item']);
    expect(await configOf(other)).toEqual({ mode: 2, rest: 90, muscleMap: { squat: {} } }); // squat is in its history, so its tags stay; 'mine' is not
    expect(await live('log_entries', other)).toHaveLength(1);
    expect(await live('body_entries', other)).toHaveLength(1);
    // Soft deletes with a new version and seq, so phones pull them like any delete.
    const gone = await db.selectFrom('library_items').selectAll().where('user_id', '=', other).executeTakeFirstOrThrow();
    expect(gone).toMatchObject({ version: 2 });
    expect(Number(gone.seq)).toBeGreaterThan(9);
  });

  it('keeps the name of a custom exercise the account\u2019s history still uses, and only that', async () => {
    await seed(ADMIN);
    const other = await seed('dev:tester');
    await db.updateTable('config').set({ data: JSON.stringify({ mode: 2, ex: { 'sled-drag': { n: 'Sled Drag', eq: 'sled' }, mine: { n: 'Mine' }, squat: { url: 'https://x.y' } }, muscleMap: { 'sled-drag': { p: ['quads'] }, mine: {} } }) as never }).where('user_id', '=', other).execute();
    await db.insertInto('log_entries').values({ user_id: other, seq: 1, client_id: 'e2', exercise_id: 'sled-drag', d: '2026-10-08' }).execute();
    await db.insertInto('weeks').values({ user_id: other, seq: 1, week_start: '2026-10-04', data: JSON.stringify({ extra: [{ id: 'X-1', day: 1, ex: 'squat' }] }) }).execute();
    await run();
    expect(await configOf(other)).toEqual({ mode: 2, ex: { 'sled-drag': { n: 'Sled Drag', eq: 'sled' }, squat: { url: 'https://x.y' } }, muscleMap: { 'sled-drag': { p: ['quads'] } } });
  });

  it('writes nothing on a dry run', async () => {
    const admin = await seed(ADMIN, { programs: false });
    const other = await seed('dev:tester');
    const result = await run(false);
    expect(result).toMatchObject({ applied: false, admin: { programsWritten: ['A', 'B'] }, others: { programs: 2, libraryItems: 1 } });
    expect(await live('programs', admin)).toEqual([]);
    expect(await live('programs', other)).toHaveLength(2);
    expect(await live('library_items', other)).toHaveLength(1);
  });

  it('refuses to keep an account that is not marked admin, and changes nothing', async () => {
    await seed(ADMIN);
    await seed('dev:tester');
    await expect(resetAccounts(db, { admin: 'dev:tester', apply: true, defaults })).rejects.toThrow(/not marked is_admin/);
    expect(await db.selectFrom('library_items').select('id').where('deleted_at', 'is', null).execute()).toHaveLength(2);
  });

  it('refuses an admin that is not an account', async () => {
    await seed('dev:tester');
    await expect(resetAccounts(db, { admin: 'nobody@example.com', apply: true, defaults })).rejects.toThrow(/no account/);
    expect(await db.selectFrom('library_items').select('id').where('deleted_at', 'is', null).execute()).toHaveLength(1);
  });
});
