import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { betaToFree } from './betaToFree.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;

beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await stop?.(); });
beforeEach(async () => { await db.deleteFrom('users').execute(); });

async function user(authId: string, plan?: string) {
  const { id } = await db.insertInto('users').values({ auth_user_id: authId, ...(plan ? { plan } : {}) } as never).returning('id').executeTakeFirstOrThrow();
  return String(id);
}
const planOf = async (id: string) => (await db.selectFrom('users').select('plan').where('id', '=', id).executeTakeFirstOrThrow()).plan;

describe('betaToFree', () => {
  it('moves every beta account to free and leaves the other plans alone', async () => {
    const beta = await user('dev:beta', 'beta');
    const free = await user('dev:free', 'free');
    const paid = await user('dev:paid', 'paid');
    const lifetime = await user('dev:lifetime', 'lifetime');
    const founder = await user('dev:founder', 'founder');
    const result = await betaToFree(db, { apply: true });
    expect(result).toEqual({ applied: true, moved: 1, kept: 4, ids: [beta] });
    expect(await Promise.all([beta, free, paid, lifetime, founder].map(planOf))).toEqual(['free', 'free', 'paid', 'lifetime', 'founder']);
  });

  it('keeps plan_source as it was, so a manual plan stays manual', async () => {
    const id = await user('dev:a', 'beta');
    await betaToFree(db, { apply: true });
    expect((await db.selectFrom('users').select('plan_source').where('id', '=', id).executeTakeFirstOrThrow()).plan_source).toBe('manual');
  });

  it('writes nothing on a dry run and reports the same count, and a second run moves nobody', async () => {
    const a = await user('dev:a', 'beta');
    const b = await user('dev:b', 'beta');
    expect(await betaToFree(db, { apply: false })).toEqual({ applied: false, moved: 2, kept: 0, ids: [a, b] });
    expect(await Promise.all([a, b].map(planOf))).toEqual(['beta', 'beta']);
    await betaToFree(db, { apply: true });
    expect(await betaToFree(db, { apply: true })).toEqual({ applied: true, moved: 0, kept: 2, ids: [] });
  });

  it('does nothing when there are no accounts', async () => {
    expect(await betaToFree(db, { apply: true })).toEqual({ applied: true, moved: 0, kept: 0, ids: [] });
  });
});
