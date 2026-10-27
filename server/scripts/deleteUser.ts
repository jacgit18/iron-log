import { sql, type Kysely } from 'kysely';
import { deleteMyAccount, DELETE_WORD } from '../commands/account.ts';
import type { PiiCrypto } from '../auth/piiCrypto.ts';
import type { DB } from '../db/types.ts';
import { remoteDatabaseProblem } from '../db/localOnly.ts';
import { findUser, type FoundUser } from './findUser.ts';

// Deleting one named person's account on request (Google Play's "request account deletion" page promises it within a month; runbook
// ops/delete-user-on-request.md). It does exactly what Settings > Delete my account does: `deleteMyAccount` (server/commands/account.ts),
// which clears the emailed codes, then runs the owner-run SQL function delete_my_account() (migration 010) inside inUserTransaction, so the
// users row, every data row, the edit-history copies and Better Auth's user, sessions, Google tokens and verification records all go. The
// owner connects as the database owner, who may run that function; it still acts only on the one user id it is given.
// Production-access rule: the script is a dry run unless --yes, asks for the address typed again, refuses a database that is not on this
// machine unless --allow-production, and prints counts and the plan, never the address, a name or any content. Run by hand:
// `npm run delete:user -- <email>` or `npm run prod:db -- delete-user <email> [--apply]`.

export interface DeleteUserArgs {
  email: string;
  yes: boolean;
  allowProduction: boolean;
  /** The owner has already ended the Stripe subscription (or deleted the customer) by hand; needed when the account has one. */
  billingCancelled: boolean;
}

const FLAGS = { '--yes': 'yes', '--allow-production': 'allowProduction', '--billing-cancelled': 'billingCancelled' } as const;

export function parseDeleteUserArgs(argv: string[]): DeleteUserArgs | { error: string } {
  const out: DeleteUserArgs = { email: '', yes: false, allowProduction: false, billingCancelled: false };
  const positional: string[] = [];
  for (const a of argv) {
    if (a in FLAGS) out[FLAGS[a as keyof typeof FLAGS]] = true;
    else if (a.startsWith('-')) return { error: `unknown option ${a}` };
    else positional.push(a);
  }
  if (positional.length !== 1) return { error: 'give exactly one email address' };
  const email = positional[0]!.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return { error: 'that is not an email address' };
  return { ...out, email };
}

/** Why this database may not be touched, or null. Anything that is not on this machine counts as production-like and needs --allow-production. */
export function databaseProblem(url: string | undefined, allowProduction: boolean): string | null {
  if (!url) return 'DATABASE_URL is not set';
  const remote = remoteDatabaseProblem(url, undefined, undefined, '');
  if (remote === null) return null;
  if (remote === 'the database URL is not a valid URL') return remote;
  return allowProduction ? null : 'that database is not on this machine; if it is production, the owner passes --allow-production on purpose';
}

/** True when what was typed is the same address (case and spacing ignored). */
export const confirmMatches = (typed: string, email: string) => typed.trim().toLowerCase() === email.trim().toLowerCase();

export interface DeletionPlan {
  user: FoundUser;
  /** Rows per table that belong to the account (counts only). */
  rows: Record<string, number>;
  hasStripeCustomer: boolean;
}

/** Every table in public with a user_id column, so a table added later is counted without editing this list. */
async function userTables(db: Kysely<DB>): Promise<string[]> {
  const { rows } = await sql<{ table_name: string }>`
    select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
     where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE' order by 1`.execute(db);
  return rows.map(r => r.table_name);
}

/** Finds the one account behind the address and counts what deleting it removes. Reads only. */
export async function planDeletion(db: Kysely<DB>, crypto: PiiCrypto, email: string): Promise<DeletionPlan | { error: string }> {
  const found = await findUser(db, crypto, email);
  if (found.length === 0) return { error: 'No account with that address.' };
  if (found.length > 1) return { error: `${found.length} accounts match that address; not touching any of them. Check by hand.` };
  const user = found[0]!;
  const rows: Record<string, number> = {};
  for (const table of await userTables(db)) {
    rows[table] = Number((await sql<{ n: string }>`select count(*) as n from ${sql.table(table)} where user_id = ${user.id}`.execute(db)).rows[0]!.n);
  }
  const billing = (await sql<{ c: string | null }>`select stripe_customer_id as c from users where id = ${user.id}`.execute(db)).rows[0];
  return { user, rows, hasStripeCustomer: !!billing?.c };
}

/** Why the account may not be deleted yet (an admin, or a Stripe customer the owner has not dealt with), or null. */
export function blockedReason(plan: DeletionPlan, billingCancelled: boolean): string | null {
  if (plan.user.isAdmin) return 'this is an admin account; remove the admin flag by hand first if it really should go';
  if (plan.hasStripeCustomer && !billingCancelled) return 'this account has a Stripe customer; cancel the subscription in the Stripe dashboard (or delete the customer), then pass --billing-cancelled';
  return null;
}

/** Deletes the account the way the in-app path does. Throws on a refusal. */
export async function deleteUser(db: Kysely<DB>, crypto: PiiCrypto, plan: DeletionPlan, email: string): Promise<void> {
  // Same as app.ts: the emailed codes are stored under `<kind>-otp-<email>`, sealed (ADR 046) or, before the switch-on, plain.
  const purge = async () => {
    const ids = ['sign-in', 'email-verification', 'forget-password'].flatMap(kind => {
      const plain = `${kind}-otp-${email.toLowerCase()}`;
      return [plain, crypto.sealStable(plain)];
    });
    await sql`delete from auth.verification where identifier in (${sql.join(ids)})`.execute(db);
  };
  // Billing is the owner's step here (the script has no Stripe key); blockedReason has already insisted it is done.
  const result = await deleteMyAccount(db, plan.user.id, { confirm: DELETE_WORD }, purge);
  if (result.status !== 200) throw new Error(result.body.ok ? 'deletion refused' : result.body.error);
}
