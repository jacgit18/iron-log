import type pg from 'pg';
import { personaEmail } from './personas.ts';

/* The one admin of the QA Runner's scratch stack (brief: qa-runner-test-admin). The QA test-accounts picker is admin-only, so S-35 needs one. It exists only in the
   scratch database that scripts/qa-local.mjs makes, and only this address and the four billing personas' (below) are in the spawned server's ADMIN_EMAILS; .invalid can never be a real address. */
export const LOCAL_ADMIN_ID = 'qa-local-admin';
/** A test value the scratch server stores only for seeded accounts (scripts/qa-local.mjs signs the sign-in page in with it; the server test uses the same). */
export const TEST_PASSWORD = 'correct horse battery staple';
export const LOCAL_ADMIN_EMAIL = 'qa-local-admin@qa.invalid';

/** The four plan accounts whose scenarios read the Billing panel (S-266 to S-269). Billing is admin-only, so on the scratch stack ONLY these test accounts (and the test admin above) are admins: signing in as one, or switching to it from the test admin, shows the panel. Everything else about them is a normal persona (see the picker rules in server/auth/qaPersonas.ts). */
export const BILLING_ADMIN_PERSONAS: readonly string[] = ['lifetime', 'founder', 'legacy-beta', 'paid-past-due'];

/** Stripe settings that turn billing on in the scratch server without a real Stripe account. They are test-looking placeholders: the panel's plan line is read from users.plan and a Stripe call happens only if someone presses Subscribe or Manage billing, which then fails with "Billing is unavailable". They replace any real STRIPE_* in the shell the stack is started from (and BILLING_LIVE is cleared), so a real key can never reach it. */
export const FAKE_BILLING_ENV = { STRIPE_SECRET_KEY: 'sk_test_qa_local_never_called', STRIPE_WEBHOOK_SECRET: 'whsec_qa_local_never_called', STRIPE_PRICE_MONTHLY: 'price_qa_local_month', STRIPE_PRICE_YEARLY: 'price_qa_local_year', BILLING_LIVE: '' };

/** What the spawned server needs: the picker (Switch and Reset: the setting, the admins, and the scratch database as the owner URL Reset seeds through) and the Billing panel (the admin list also holds the four billing personas, and billing is on with placeholder Stripe settings). */
export const pickerEnv = (scratchUrl: string) => ({
  QA_PERSONAS: 'true',
  ADMIN_EMAILS: [LOCAL_ADMIN_EMAIL, ...BILLING_ADMIN_PERSONAS.map(personaEmail)].join(','),
  QA_OWNER_DATABASE_URL: scratchUrl,
  ...FAKE_BILLING_ENV,
});

/** Seeds the test admin: a verified auth user and its password login, nothing else (no app data row; the app makes it on first use). `passwordHash` is better-auth's hash of the test password. Safe to run twice. */
export async function seedLocalAdmin(c: Pick<pg.Client, 'query'>, passwordHash: string): Promise<void> {
  await c.query(`insert into auth."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt") values ($1, 'QA test admin', $2, true, null, now(), now()) on conflict (id) do nothing`, [LOCAL_ADMIN_ID, LOCAL_ADMIN_EMAIL]);
  await c.query(`insert into auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, 'credential', $2, $3, now(), now())
    on conflict (id) do update set password = excluded.password`, [`qa-local-${LOCAL_ADMIN_ID}`, LOCAL_ADMIN_ID, passwordHash]);
}
