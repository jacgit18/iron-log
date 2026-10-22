import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The words the policy promises must match what the system does. These are the numbers that live in two places.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the policy and the system agree', () => {
  const policy = read('public/privacy.html');
  const text = policy.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('backups are kept as many days as the policy says', () => {
    // A file is deleted after RETENTION_DAYS and stays recoverable for SOFT_DELETE_DAYS more (an operator's undo), so the two together are
    // what the policy promises. Both are set explicitly in the script, so a Google default cannot change the promise.
    const script = read('scripts/backup-cloud-run.sh');
    const kept = Number(/RETENTION_DAYS="\$\{RETENTION_DAYS:-(\d+)\}"/.exec(script)?.[1]);
    const undo = Number(/SOFT_DELETE_DAYS="\$\{SOFT_DELETE_DAYS:-(\d+)\}"/.exec(script)?.[1]);
    expect(kept + undo).toBe(30);
    expect(script).toMatch(/buckets create[^\n]*\\\n\s*--soft-delete-duration/); // a new bucket is made with it
    expect(script).toMatch(/buckets update[^\n]*--soft-delete-duration/); // and an existing one is brought into line
    expect(text).toContain('within 30 days');
    expect(text).toMatch(/Nightly backups[^.]*30 days/);
  });

  it('the sign-in lifetime matches the session wording', () => {
    expect(/export const SESSION_DAYS = (\d+)/.exec(read('server/auth/betterAuth.ts'))?.[1]).toBe('30');
    expect(text).toContain('Up to 30 days from last use');
  });

  it('paid plans: the sentences about Stripe are tied to the code that does them, so the text cannot go live ahead of the code', () => {
    // Deleting the account ends the subscription first by deleting the Stripe customer, and the customer id is stored in `users`.
    expect(text).toContain('deleting your account also deletes your customer record at Stripe');
    expect(read('server/commands/account.ts')).toContain('cancelBilling');
    expect(read('server/billing.ts')).toMatch(/customers\.del\(/);
    expect(read('db/migrations/20261022000001_billing_plan_state.sql')).toContain('stripe_customer_id');
    // The Terms send people to Manage billing in Settings: the button must say exactly that.
    const terms = read('public/terms.html');
    expect(terms).toContain('(Manage billing)');
    expect(read('src/components/settings/BillingPanel.tsx')).toContain('Manage billing</button>');
    // The refund window the Terms state.
    expect(terms).toContain('refund within 14 days');
    // The summary and the transfers section name Stripe, as the processor table does.
    expect(text).toMatch(/Stripe takes the payment/);
    expect(text).toMatch(/including Stripe for payments/);
  });

  it('names the operator and one contact, the same on both pages, and the minimum age', () => {
    const terms = read('public/terms.html');
    for (const page of [policy, terms]) {
      expect(page).toContain('Joshua Carpentier');
      expect(page).toContain('mailto:joshuaxcarpentier@gmail.com');
    }
    expect(text).toContain('16 and over');
    expect(terms).toContain('16 years old');
  });

  it('says what the app really keeps about sessions and what it never does', () => {
    expect(text).toMatch(/IP address and (the )?browser or device description/);
    expect(text).toContain('no advertising, no analytics and no tracking');
    expect(text).toContain('do not sell');
  });

  it('push alerts: the policy names what is kept and for how long, as the system does', () => {
    // The 3 hours a queued alert can wait is the most the server accepts (MAX_AHEAD_MS), and the policy says so.
    expect(/export const MAX_AHEAD_MS = (\d+) \* 60 \* 60_000/.exec(read('server/push/validate.ts'))?.[1]).toBe('3');
    expect(text).toContain('at most 3 hours ahead');
    expect(text).toMatch(/Push alerts \(only if you turn them on/);
    expect(text).toContain('Cloud Tasks');
    expect(text).toMatch(/notification service of your browser or phone maker/);
    expect(text).toMatch(/Push alerts: your device’s address and keys/);
    // An alert carries the device entry, a time and a short text, never workout data: the fire route's payload has exactly these fields, plus, for the
    // drink-water reminder only, how often it repeats and when its hours end (`repeat`), which the policy names.
    expect(read('server/push/cloudTasks.ts')).toMatch(/payload = \{ subscriptionId: job\.subscriptionId, kind: job\.kind, key: job\.key, at: job\.at, body: job\.body, \.\.\.\(job\.repeat \? \{ repeat: job\.repeat \} : \{\}\) \}/);
    expect(text).toMatch(/drink-water reminder[\s\S]*?asks for the next one after each is sent/);
    expect(text).toMatch(/how often it repeats and when your reminder hours end/);
  });

  it('push alerts: the deletion triggers the policy lists are the ones in the database', () => {
    // "turn off" is the unsubscribe route; "erase" is erase_my_data(); "delete your account" is the foreign key's cascade.
    expect(read('server/push/routes.ts')).toMatch(/router\.post\('\/unsubscribe'[\s\S]*deleteFrom\('push_subscription'\)/);
    expect(read('db/migrations/20261014000003_push_subscription.sql')).toMatch(/delete from push_subscription where user_id = uid/);
    expect(read('db/migrations/20261014000003_push_subscription.sql')).toMatch(/user_id\s+bigint not null references users \(id\) on delete cascade/);
    // "sign out": the Sign out button takes this phone off the server first, while still signed in (PR 6).
    expect(read('src/components/settings/AccountPanel.tsx')).toMatch(/await disablePush\(\)[^\n]*\n\s*const done = await account\.signOut\(\)/);
    expect(text).toMatch(/Push alerts: your device’s address and keys[^.]*turn the alerts off[^.]*erase your data or delete your account/);
  });

  it('the pages link to each other and carry a date and version', () => {
    expect(policy).toContain('href="terms.html"');
    expect(read('public/terms.html')).toContain('href="privacy.html"');
    for (const page of [policy, read('public/terms.html')]) expect(page).toMatch(/Last updated: \d+ \w+ \d{4} · Version \d+\.\d+/);
  });
});
