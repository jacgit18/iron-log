import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import { createPiiCrypto, parsePiiKey } from './piiCrypto.ts';

/* ---------- Is this the right database key? Asked once, at boot (backlog audit #2 and #4; ADR 046) ----------
   A missing key stores names and emails in the clear without a word, and a wrong key turns every signed-in request into a generic
   500. Both are found here instead, before the server takes a request: in production the server stops with a plain reason. A new
   revision that stops this way fails its smoke check and never gets traffic (the candidate flow), so the revision that works keeps serving.

   Three checks, production only (development, tests and local runs may have no key):
   1. the key is set and is 32 bytes of base64;
   2. it seals and opens a probe string;
   3. it opens one real sealed email in auth."user" (the canary). No sealed row yet (a fresh or just-emptied database) is not a failure.
   With PII_PLAINTEXT_DONE=true it also checks that no row still holds a plaintext email, because the adapter then rejects those. */

export interface PiiBootResult {
  /** Why the server must not start. Never holds the key or a stored value. */
  problem?: string;
  /** What was checked, for the start-up log. */
  note?: string;
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function piiBootCheck(env: NodeJS.ProcessEnv, db: Kysely<DB> | undefined): Promise<PiiBootResult> {
  if (env.NODE_ENV !== 'production') return { note: 'not checked outside production' };
  const parsed = parsePiiKey(env.PII_ENCRYPTION_KEY);
  if ('error' in parsed) return { problem: parsed.error };
  const crypto = createPiiCrypto(parsed.key);
  try {
    if (crypto.open(crypto.seal('probe')) !== 'probe') return { problem: 'the database key does not open what it just sealed' };
  } catch {
    return { problem: 'the database key does not open what it just sealed' };
  }
  if (!db) return { note: 'no database is set, so there is no sealed value to check' };

  let sealed: string | undefined;
  try {
    sealed = (await sql<{ email: string }>`select email from auth."user" where email like 'enc1:%' limit 1`.execute(db)).rows[0]?.email;
  } catch (e) {
    return { problem: `could not read auth."user" to check the database key: ${reason(e)}` };
  }
  if (env.PII_PLAINTEXT_DONE === 'true') {
    try {
      const { n } = (await sql<{ n: string }>`select count(*) as n from auth."user" where email not like 'enc1:%'`.execute(db)).rows[0]!;
      if (Number(n) > 0) return { problem: `PII_PLAINTEXT_DONE is true but ${n} row(s) in auth."user" still hold a plaintext email: run scripts/encrypt-users.mjs, or unset PII_PLAINTEXT_DONE` };
    } catch (e) {
      return { problem: `could not read auth."user" to check for plaintext emails: ${reason(e)}` };
    }
  }
  if (sealed === undefined) return { note: 'the key is valid; no sealed value in auth."user" yet, so nothing to open' };
  try {
    crypto.open(sealed);
  } catch {
    return { problem: 'canary failed: PII_ENCRYPTION_KEY does not open a sealed email stored in auth."user" (the wrong key, or a damaged value)' };
  }
  return { note: 'the key opened a sealed value in auth."user"' };
}
