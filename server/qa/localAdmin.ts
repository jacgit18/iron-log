import type pg from 'pg';

/* The one admin of the QA Runner's scratch stack (brief: qa-runner-test-admin). The QA test-accounts picker is admin-only, so S-35 needs one. It exists only in the
   scratch database that scripts/qa-local.mjs makes, and only this address is in the spawned server's ADMIN_EMAILS; .invalid can never be a real address. */
export const LOCAL_ADMIN_ID = 'qa-local-admin';
export const LOCAL_ADMIN_EMAIL = 'qa-local-admin@qa.invalid';

/** What the spawned server needs for the picker (Switch and Reset): the setting, the one test admin, and the scratch database as the owner URL Reset seeds through. */
export const pickerEnv = (scratchUrl: string) => ({ QA_PERSONAS: 'true', ADMIN_EMAILS: LOCAL_ADMIN_EMAIL, QA_OWNER_DATABASE_URL: scratchUrl });

/** Seeds the test admin: a verified auth user and its password login, nothing else (no app data row; the app makes it on first use). `passwordHash` is better-auth's hash of the test password. Safe to run twice. */
export async function seedLocalAdmin(c: Pick<pg.Client, 'query'>, passwordHash: string): Promise<void> {
  await c.query(`insert into auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") values ($1, 'QA test admin', $2, true, null, now(), now()) on conflict (id) do nothing`, [LOCAL_ADMIN_ID, LOCAL_ADMIN_EMAIL]);
  await c.query(`insert into auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, 'credential', $2, $3, now(), now())
    on conflict (id) do update set password = excluded.password`, [`qa-local-${LOCAL_ADMIN_ID}`, LOCAL_ADMIN_ID, passwordHash]);
}
