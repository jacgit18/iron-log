import { sql, type Kysely } from 'kysely';
import type { PiiCrypto } from '../auth/piiCrypto.ts';
import type { DB } from '../db/types.ts';

// Finds the account behind one email address, for the owner to read (runbook: production access). Names and emails are sealed in
// auth."user" (ADR 046), so the address is sealed the same way (deterministic) and matched; a row not yet sealed is matched on the plain
// address too. It READS only, and returns the app account (id, plan, admin flag, dates), never the address or name. Run by hand:
// scripts/find-user.mjs, or `npm run prod:db -- find-user <email>`.

export interface FoundUser {
  id: string;
  plan: string;
  planSource: string;
  isAdmin: boolean;
  createdAt: string;
  sealed: boolean;
}

export async function findUser(db: Kysely<DB>, crypto: PiiCrypto, email: string): Promise<FoundUser[]> {
  const address = email.trim().toLowerCase();
  if (!address.includes('@')) throw new Error('that is not an email address');
  const sealed = crypto.sealStable(address);
  const { rows } = await sql<{ id: string; plan: string; plan_source: string; is_admin: boolean; created_at: string; email: string }>`
    select u.id, u.plan, u.plan_source, u.is_admin, u.created_at, a.email
      from auth."user" a join users u on u.auth_user_id = a.id
     where a.email = ${sealed} or lower(a.email) = ${address}
     order by u.id`.execute(db);
  return rows.map(r => ({ id: r.id, plan: r.plan, planSource: r.plan_source, isAdmin: r.is_admin, createdAt: new Date(r.created_at).toISOString(), sealed: crypto.isSealed(r.email) }));
}
