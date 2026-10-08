import { sql, type Kysely } from 'kysely';
import { inUserTransaction } from '../auth.ts';
import type { DB } from '../db/types.ts';

// Erasing a person's data, and deleting their account (migration 010). The database does the work in two owner-run functions that
// act only on the signed-in user; this is the thin layer in front of them. Each needs the person to type what they are doing, so a
// stray request or a replayed form cannot do it: the API refuses anything but the exact word.

export const ERASE_WORD = 'ERASE';
export const DELETE_WORD = 'DELETE';

export type AccountResult = { status: 200; body: { ok: true } } | { status: 422; body: { ok: false; error: string } };

const asked = (body: unknown, word: string) => !!body && typeof body === 'object' && (body as { confirm?: unknown }).confirm === word;

export async function eraseMyData(db: Kysely<DB>, userId: string, body: unknown): Promise<AccountResult> {
  if (!asked(body, ERASE_WORD)) return { status: 422, body: { ok: false, error: `send {"confirm":"${ERASE_WORD}"} to erase everything` } };
  await inUserTransaction(db, userId, trx => sql`select erase_my_data()`.execute(trx));
  // What was done, never whose: a count of these is the audit trail without a person in it.
  console.log(JSON.stringify({ msg: 'account data erased' }));
  return { status: 200, body: { ok: true } };
}

export async function deleteMyAccount(db: Kysely<DB>, userId: string, body: unknown): Promise<AccountResult> {
  if (!asked(body, DELETE_WORD)) return { status: 422, body: { ok: false, error: `send {"confirm":"${DELETE_WORD}"} to delete the account` } };
  await inUserTransaction(db, userId, trx => sql`select delete_my_account()`.execute(trx));
  console.log(JSON.stringify({ msg: 'account deleted' }));
  return { status: 200, body: { ok: true } };
}
