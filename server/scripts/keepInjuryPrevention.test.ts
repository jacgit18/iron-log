import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { keepInjuryPrevention } from './keepInjuryPrevention.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;

beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await stop?.(); });
beforeEach(async () => { await db.deleteFrom('users').execute(); });

async function user(authId: string, config?: object, deleted = false) {
  const { id } = await db.insertInto('users').values({ auth_user_id: authId, change_seq: 5 }).returning('id').executeTakeFirstOrThrow();
  if (config) await db.insertInto('config').values({ user_id: id, seq: 1, data: JSON.stringify(config), ...(deleted ? { deleted_at: new Date() } : {}) }).execute();
  return id;
}
const configOf = async (userId: string) => db.selectFrom('config').selectAll().where('user_id', '=', userId).executeTakeFirst();

describe('keepInjuryPrevention', () => {
  it('gives every account that had not chosen injury prevention On, keeping its other settings', async () => {
    const a = await user('dev:a', { rest: 90, mode: 2 });
    const result = await keepInjuryPrevention(db, { apply: true });
    expect(result).toEqual({ applied: true, written: 1, chosen: 0 });
    const row = await configOf(a);
    expect(row?.data).toEqual({ rest: 90, mode: 2, injuryPrevention: true });
    expect(row?.version).toBe(2);
    expect(Number(row?.seq)).toBeGreaterThan(1); // a new seq, so the account's phones pull it
  });

  it('leaves an account that turned it off, or on, alone', async () => {
    const off = await user('dev:off', { injuryPrevention: false });
    const on = await user('dev:on', { injuryPrevention: true });
    expect(await keepInjuryPrevention(db, { apply: true })).toEqual({ applied: true, written: 0, chosen: 2 });
    expect((await configOf(off))?.data).toEqual({ injuryPrevention: false });
    expect((await configOf(on))?.version).toBe(1);
  });

  it('creates a config row for an account with none, and an erased row gets only that key', async () => {
    const none = await user('dev:none');
    const erased = await user('dev:erased', { rest: 60, injuryPrevention: false }, true);
    await keepInjuryPrevention(db, { apply: true });
    expect((await configOf(none))?.data).toEqual({ injuryPrevention: true });
    const row = await configOf(erased);
    expect(row?.data).toEqual({ injuryPrevention: true });
    expect(row?.deleted_at).toBeNull();
  });

  it('writes nothing on a dry run, and nothing on a second run', async () => {
    const a = await user('dev:a', { rest: 90 });
    expect(await keepInjuryPrevention(db, { apply: false })).toEqual({ applied: false, written: 1, chosen: 0 });
    expect((await configOf(a))?.data).toEqual({ rest: 90 });
    await keepInjuryPrevention(db, { apply: true });
    expect(await keepInjuryPrevention(db, { apply: true })).toEqual({ applied: true, written: 0, chosen: 1 });
    expect((await configOf(a))?.version).toBe(2);
  });
});
