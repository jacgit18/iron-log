import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { ownExercises } from './ownExercises.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;

beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await stop?.(); });
beforeEach(async () => { await db.deleteFrom('users').execute(); });

const ADMIN = 'dev:owner';
// Stand-in for the built-in list (app code the server may not import, ADR 015).
const BUILTINS = { squat: { n: 'Squat', eq: 'barbell' }, row: { n: 'Row', url: 'https://youtu.be/x', eq: 'cable' } };
const run = (apply = true, admin = ADMIN) => ownExercises(db, { admin, apply, builtins: BUILTINS });

async function user(authId: string, config?: object) {
  const { id } = await db.insertInto('users').values({ auth_user_id: authId, change_seq: 5, is_admin: authId === ADMIN }).returning('id').executeTakeFirstOrThrow();
  if (config) await db.insertInto('config').values({ user_id: id, seq: 1, data: JSON.stringify(config) }).execute();
  return id;
}
const configOf = async (userId: string) => db.selectFrom('config').selectAll().where('user_id', '=', userId).executeTakeFirst();

describe('ownExercises', () => {
  it("writes every built-in into the admin's exercises, keeping what they set and their other settings", async () => {
    const admin = await user(ADMIN, { rest: 90, ex: { squat: { url: 'https://mine', eq: '' }, mine: { n: 'Mine' } } });
    const result = await run();
    expect(result).toEqual({ applied: true, userId: admin, written: ['squat', 'row'] });
    const row = await configOf(admin);
    expect(row?.data).toEqual({ rest: 90, ex: { squat: { n: 'Squat', eq: '', url: 'https://mine' }, row: BUILTINS.row, mine: { n: 'Mine' } } });
    expect(row?.version).toBe(2);
    expect(Number(row?.seq)).toBeGreaterThan(1); // a new seq, so the admin's phones pull it
  });

  it('creates the config row when the admin has none', async () => {
    const admin = await user(ADMIN);
    await run();
    expect((await configOf(admin))?.data).toEqual({ ex: BUILTINS });
  });

  it('changes nothing on a second run, nor on a dry run', async () => {
    const admin = await user(ADMIN, { ex: {} });
    const dry = await run(false);
    expect(dry.written).toEqual(['squat', 'row']);
    expect((await configOf(admin))?.data).toEqual({ ex: {} });
    await run();
    const before = await configOf(admin);
    expect((await run()).written).toEqual([]);
    expect(await configOf(admin)).toEqual(before);
  });

  it("leaves other accounts alone, and refuses an account that isn't marked admin", async () => {
    const other = await user('dev:someone', { ex: {} });
    await user(ADMIN, {});
    await run();
    expect((await configOf(other))?.data).toEqual({ ex: {} });
    await expect(run(true, 'dev:someone')).rejects.toThrow(/not marked is_admin/);
  });
});
