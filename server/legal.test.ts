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

  it('names the operator and one contact, the same on both pages, and the minimum age', () => {
    const terms = read('public/terms.html');
    for (const page of [policy, terms]) {
      expect(page).toContain('Joshua Carpentier');
      expect(page).toContain('mailto:hello@loadbearer.app');
    }
    expect(text).toContain('18 and over');
    expect(terms).toContain('18 years old');
  });

  it('the emailed sign-in code wording matches the code rules and names Resend', () => {
    const auth = read('server/auth/betterAuth.ts');
    expect(/export const CODE_MINUTES = (\d+)/.exec(read('server/auth/otpEmail.ts'))?.[1]).toBe('5');
    expect(auth).toMatch(/otpLength: 6[\s\S]*expiresIn: CODE_MINUTES \* 60[\s\S]*allowedAttempts: 3[\s\S]*storeOTP: \{ hash:/);
    expect(text).toContain('six-digit code');
    expect(text).toContain('expires after 5 minutes and allows 3 wrong tries');
    expect(text).toContain('stored only as a hash');
    expect(text).toMatch(/Resend \(email delivery/);
    expect(text).toMatch(/Sign-in codes \(emailed\)/);
    // "removed when you delete your account": the delete route clears every code kept under the address.
    expect(read('server/app.ts')).toMatch(/deleteVerificationByIdentifier\(`\$\{kind\}-otp-\$\{email\.toLowerCase\(\)\}`\)/);
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
    // "sign out": Sign out (the account menu) takes this phone off the server first, while still signed in (PR 6); both places that sign out use the one flow.
    expect(read('src/lib/signOutFlow.ts')).toMatch(/await s\.disablePush\(\)[^\n]*\n\s*const done = await s\.signOut\(\)/);
    expect(read('src/components/AccountBadge.tsx')).toMatch(/signOutFlow\(\{ disablePush,/);
    expect(read('src/components/OtherAccountCard.tsx')).toMatch(/signOutFlow\(\{ disablePush,/);
    expect(text).toMatch(/Push alerts: your device’s address and keys[^.]*turn the alerts off[^.]*erase your data or delete your account/);
  });

  it('the policy and Settings link the public deletion page', () => {
    expect(policy).toContain('href="/delete-account"');
    expect(read('src/components/settings/DeleteMyData.tsx')).toContain('href="/delete-account"');
  });

  it('the deletion page says what the app and the policy say', () => {
    const page = read('public/delete-account.html');
    const words = page.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    // The same operator and contact as the policy and the terms, and the page names the app.
    expect(page).toContain('mailto:hello@loadbearer.app');
    expect(page).toContain('Joshua Carpentier');
    expect(words).toContain('Loadbearer');
    // The in-app path: the group title and the buttons are the ones Settings draws, and the typed word is the one the API wants.
    const settings = read('src/components/settings/Settings.tsx');
    const panel = read('src/components/settings/DeleteMyData.tsx');
    expect(settings).toContain('title="Erase & delete"');
    expect(panel).toContain('Delete my account permanently');
    expect(panel).toContain('Erase everything in my account');
    expect(panel).toContain('Export all data first');
    expect(words).toContain('Erase & delete');
    expect(words).toContain('Delete my account permanently');
    expect(words).toContain('Erase everything in my account');
    expect(words).toContain('Export all data first');
    expect(read('server/commands/account.ts')).toContain("DELETE_WORD = 'DELETE'");
    expect(read('server/commands/account.ts')).toContain("ERASE_WORD = 'ERASE'");
    expect(words).toMatch(/type DELETE and tap/);
    expect(words).toMatch(/type ERASE/);
    // Retention is the policy's: backups 30 days, logs about 30 days, messages to us 24 months, and the answer time is one month.
    expect(words).toMatch(/Nightly backups of the service Up to 30 days/);
    expect(words).toContain('within 30 days');
    expect(words).toMatch(/Platform logs and error reports About 30 days/);
    expect(words).toContain('no longer than 24 months');
    expect(words).toContain('We answer within one month');
    expect(text).toContain('24 months');
    expect(text).toContain('within one month');
  });

  it('serves the deletion page at /delete-account, past the service worker and the preview server', () => {
    expect(read('server/app.ts')).toMatch(/app\.get\('\/delete-account'[\s\S]*sendFile\('delete-account\.html'/);
    // An installed app's worker would otherwise answer a visit to the extensionless address with the app.
    // Workbox tests the denylist against pathname + search, so the query string and a trailing slash must be let through too.
    const line = read('src/sw.ts').split('\n').find(l => l.includes('denylist:')) ?? '';
    const list = [...line.matchAll(/(?<=[\[,]\s)\/(.+?)\/(?=[,\]])/g)].map(m => new RegExp(m[1]!));
    const denied = (path: string) => list.some(re => re.test(path));
    for (const path of ['/delete-account', '/delete-account?from=play', '/delete-account/', '/delete-account/?a=1']) expect(denied(path), path).toBe(true);
    for (const path of ['/', '/delete-accounts', '/delete-account.html', '/board']) expect(denied(path), path).toBe(false);
    expect(read('vite.config.js')).toContain('deleteAccountPage()');
  });

  it('the pages link to each other and carry a date and version', () => {
    expect(policy).toContain('href="terms.html"');
    expect(read('public/terms.html')).toContain('href="privacy.html"');
    for (const page of [policy, read('public/terms.html'), read('public/delete-account.html')]) expect(page).toMatch(/Last updated: \d+ \w+ \d{4} · Version \d+\.\d+/);
  });
});
