import { randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPiiCrypto } from '../auth/piiCrypto.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { encryptUsers } from './encryptUsers.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
const crypto = createPiiCrypto(randomBytes(32));
beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterAll(async () => { await stop?.(); });

describe('encryptUsers', () => {
  it('counts on a dry run, seals on apply, and is safe to run twice', async () => {
    await sql`insert into auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
      values ('u1', 'Ada', 'ada@example.com', true, 'https://x/y.png', now(), now()), ('u2', 'Bob', ${crypto.sealStable('bob@example.com')}, true, null, now(), now())`.execute(db);
    await sql`insert into auth.verification (id, identifier, value, "expiresAt", "createdAt", "updatedAt") values ('v1', 'sign-in-otp-ada@example.com', 'x', now(), now(), now()), ('v2', 'oauth-state-abc', 'x', now(), now(), now())`.execute(db);

    const dry = await encryptUsers(db, crypto, false);
    expect(dry).toMatchObject({ applied: false, users: { total: 2, toSeal: 2, sealed: 0 }, verifications: { toSeal: 1, sealed: 0 } });
    expect((await sql<{ email: string }>`select email from auth."user" where id = 'u1'`.execute(db)).rows[0]!.email).toBe('ada@example.com');

    const done = await encryptUsers(db, crypto, true);
    expect(done).toMatchObject({ users: { sealed: 2 }, verifications: { sealed: 1 } });
    const rows = (await sql<{ id: string; email: string; name: string; image: string | null }>`select id, email, name, image from auth."user" order by id`.execute(db)).rows;
    expect(rows.map(r => crypto.open(r.email))).toEqual(['ada@example.com', 'bob@example.com']);
    expect(rows.map(r => crypto.open(r.name))).toEqual(['Ada', 'Bob']);
    expect(crypto.open(rows[0]!.image!)).toBe('https://x/y.png');
    expect(rows[1]!.image).toBeNull();
    const ids = (await sql<{ identifier: string }>`select identifier from auth.verification order by id`.execute(db)).rows.map(r => r.identifier);
    expect(crypto.open(ids[0]!)).toBe('sign-in-otp-ada@example.com');
    expect(ids[1]).toBe('oauth-state-abc');

    expect(await encryptUsers(db, crypto, true)).toMatchObject({ users: { toSeal: 0 }, verifications: { toSeal: 0 } });
  });
});
