import { randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPiiCrypto } from '../auth/piiCrypto.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { findUser } from './findUser.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
const crypto = createPiiCrypto(randomBytes(32));
beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
    ('a1', ${crypto.seal('Ada')}, ${crypto.sealStable('ada@example.com')}, true, now(), now()),
    ('b1', 'Bob', 'bob@example.com', true, now(), now()),
    ('c1', ${crypto.seal('Cy')}, ${crypto.sealStable('cy@example.com')}, true, now(), now())`.execute(db);
  await sql`insert into users (auth_user_id, plan, is_admin) values ('a1', 'paid', false), ('b1', 'beta', false), ('c1', 'founder', true)`.execute(db);
}, 120_000);
afterAll(async () => { await stop?.(); });

describe('findUser', () => {
  it('finds a sealed address, whatever its case or spacing, and returns the account without the address', async () => {
    const found = await findUser(db, crypto, '  Ada@Example.com ');
    expect(found).toEqual([expect.objectContaining({ plan: 'paid', planSource: 'manual', isAdmin: false, sealed: true })]);
    expect(JSON.stringify(found)).not.toMatch(/ada@|Ada/);
  });
  it('still finds a row that is not sealed yet, and says so', async () => {
    expect(await findUser(db, crypto, 'bob@example.com')).toEqual([expect.objectContaining({ plan: 'beta', sealed: false })]);
  });
  it('finds an admin, and nothing for an unknown address', async () => {
    expect((await findUser(db, crypto, 'cy@example.com'))[0]).toMatchObject({ plan: 'founder', isAdmin: true });
    expect(await findUser(db, crypto, 'nobody@example.com')).toEqual([]);
  });
  it('refuses something that is not an address', async () => {
    await expect(findUser(db, crypto, 'margarette')).rejects.toThrow('not an email');
  });
});
