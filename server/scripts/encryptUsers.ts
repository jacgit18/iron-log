import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import type { PiiCrypto } from '../auth/piiCrypto.ts';

// Seals the name, email and photo address of every row in auth."user" and the address in auth.verification.identifier that is still
// plaintext (ADR 046). Safe to run again: a value that is already sealed is skipped. Run by hand: scripts/encrypt-users.mjs.
// Without `apply` it only counts.

export interface EncryptResult {
  applied: boolean;
  users: { total: number; toSeal: number; sealed: number };
  verifications: { toSeal: number; sealed: number };
}

export async function encryptUsers(db: Kysely<DB>, crypto: PiiCrypto, apply: boolean): Promise<EncryptResult> {
  return db.transaction().execute(async trx => {
    const users = (await sql<{ id: string; email: string; name: string; image: string | null }>`
      select id, email, name, image from auth."user" order by id for update`.execute(trx)).rows;
    const result: EncryptResult = { applied: apply, users: { total: users.length, toSeal: 0, sealed: 0 }, verifications: { toSeal: 0, sealed: 0 } };
    for (const u of users) {
      if (crypto.isSealed(u.email) && crypto.isSealed(u.name) && (u.image === null || crypto.isSealed(u.image))) continue;
      result.users.toSeal++;
      if (!apply) continue;
      await sql`update auth."user" set email = ${crypto.isSealed(u.email) ? u.email : crypto.sealStable(u.email)},
        name = ${crypto.isSealed(u.name) ? u.name : crypto.seal(u.name)},
        image = ${u.image === null || crypto.isSealed(u.image) ? u.image : crypto.seal(u.image)} where id = ${u.id}`.execute(trx);
      result.users.sealed++;
    }
    const vs = (await sql<{ id: string; identifier: string }>`select id, identifier from auth.verification where identifier like '%@%' for update`.execute(trx)).rows;
    for (const v of vs) {
      if (crypto.isSealed(v.identifier)) continue;
      result.verifications.toSeal++;
      if (!apply) continue;
      await sql`update auth.verification set identifier = ${crypto.sealStable(v.identifier)} where id = ${v.id}`.execute(trx);
      result.verifications.sealed++;
    }
    return result;
  });
}
