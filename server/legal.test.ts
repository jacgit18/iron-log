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

  it('the pages link to each other and carry a date and version', () => {
    expect(policy).toContain('href="terms.html"');
    expect(read('public/terms.html')).toContain('href="privacy.html"');
    for (const page of [policy, read('public/terms.html')]) expect(page).toMatch(/Last updated: \d+ \w+ \d{4} · Version \d+\.\d+/);
  });
});
