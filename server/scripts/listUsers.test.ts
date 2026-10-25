import { randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPiiCrypto } from '../auth/piiCrypto.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { listUsers } from './listUsers.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
const crypto = createPiiCrypto(randomBytes(32));
beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
    ('a1', ${crypto.seal('Ada')}, ${crypto.sealStable('ada@example.com')}, true, now(), now()),
    ('b1', 'Bob', 'bob@example.com', true, now(), now())`.execute(db);
  await sql`insert into users (auth_user_id, plan, is_admin) values ('a1', 'paid', true), ('b1', 'beta', false)`.execute(db);
}, 120_000);
afterAll(async () => { await stop?.(); });

describe('listUsers', () => {
  it('lists every account without a name or email by default', async () => {
    const users = await listUsers(db, crypto);
    expect(users).toHaveLength(2);
    expect(users.map(u => u.plan).sort()).toEqual(['beta', 'paid']);
    expect(users.find(u => u.plan === 'paid')).toMatchObject({ isAdmin: true });
    expect(JSON.stringify(users)).not.toMatch(/ada@|Ada|bob@|Bob/);
  });
  it('opens names and emails only when asked, sealed or not', async () => {
    const users = await listUsers(db, crypto, true);
    expect(users.map(u => [u.name, u.email]).sort()).toEqual([['Ada', 'ada@example.com'], ['Bob', 'bob@example.com']]);
  });
});
