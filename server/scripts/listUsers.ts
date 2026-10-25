import { sql, type Kysely } from 'kysely';
import type { PiiCrypto } from '../auth/piiCrypto.ts';
import type { DB } from '../db/types.ts';

// Lists every app account, for the owner to read (runbook: production access). It READS only. Names and emails are sealed in
// auth."user" (ADR 046); they stay sealed in the output unless `reveal` is set, which opens them with the key for this one run. Run by
// hand: scripts/list-users.mjs, or `npm run prod:db -- list-users [--reveal]`.

export interface ListedUser {
  id: string;
  plan: string;
  planSource: string;
  isAdmin: boolean;
  createdAt: string;
  name?: string;
  email?: string;
}

export async function listUsers(db: Kysely<DB>, crypto: PiiCrypto, reveal = false): Promise<ListedUser[]> {
  const { rows } = await sql<{ id: string; plan: string; plan_source: string; is_admin: boolean; created_at: string; name: string; email: string }>`
    select u.id, u.plan, u.plan_source, u.is_admin, u.created_at, a.name, a.email
      from users u left join auth."user" a on a.id = u.auth_user_id
     order by u.created_at, u.id`.execute(db);
  return rows.map(r => ({
    id: r.id,
    plan: r.plan,
    planSource: r.plan_source,
    isAdmin: r.is_admin,
    createdAt: new Date(r.created_at).toISOString(),
    ...(reveal ? { name: r.name == null ? '' : crypto.open(r.name), email: r.email == null ? '' : crypto.open(r.email) } : {}),
  }));
}
