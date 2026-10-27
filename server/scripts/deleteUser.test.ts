import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPiiCrypto } from '../auth/piiCrypto.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { blockedReason, confirmMatches, databaseProblem, deleteUser, parseDeleteUserArgs, planDeletion } from './deleteUser.ts';

describe('parseDeleteUserArgs', () => {
  it('is a dry run by default: no flag is on', () => {
    expect(parseDeleteUserArgs(['  Ada@Example.com '])).toEqual({ email: 'ada@example.com', yes: false, allowProduction: false, billingCancelled: false });
  });
  it('reads each flag, in any position', () => {
    expect(parseDeleteUserArgs(['--yes', 'a@b.co', '--allow-production', '--billing-cancelled'])).toEqual({ email: 'a@b.co', yes: true, allowProduction: true, billingCancelled: true });
  });
  it('refuses a missing, extra or malformed address and an unknown option', () => {
    expect(parseDeleteUserArgs([])).toHaveProperty('error');
    expect(parseDeleteUserArgs(['a@b.co', 'c@d.co'])).toHaveProperty('error');
    expect(parseDeleteUserArgs(['margarette'])).toMatchObject({ error: expect.stringContaining('not an email') });
    expect(parseDeleteUserArgs(['a@b.co', '--force'])).toMatchObject({ error: expect.stringContaining('unknown option') });
  });
});

describe('databaseProblem', () => {
  it('accepts a database on this machine without a flag', () => {
    for (const u of ['postgres://u:p@127.0.0.1:5433/ironlog', 'postgres://u:p@localhost/ironlog', 'postgres://u:p@[::1]:5433/ironlog']) expect(databaseProblem(u, false)).toBeNull();
  });
  it('refuses a remote database, or one hidden behind ?host=, unless --allow-production', () => {
    for (const u of ['postgres://u:p@ep-x-pooler.neon.tech/neondb', 'postgres://u:p@localhost/x?host=db.prod.example']) {
      expect(databaseProblem(u, false)).toMatch(/not on this machine/);
      expect(databaseProblem(u, true)).toBeNull();
    }
  });
  it('refuses a missing or invalid URL even with the flag', () => {
    expect(databaseProblem(undefined, true)).toMatch(/not set/);
    expect(databaseProblem('not a url', true)).toMatch(/valid URL/);
  });
});

describe('confirmMatches and blockedReason', () => {
  it('matches the address typed again, ignoring case and spacing, and nothing else', () => {
    expect(confirmMatches(' ADA@example.com\n', 'ada@example.com')).toBe(true);
    expect(confirmMatches('ada@example.org', 'ada@example.com')).toBe(false);
    expect(confirmMatches('', 'ada@example.com')).toBe(false);
  });
  const plan = (over: Partial<{ isAdmin: boolean; hasStripeCustomer: boolean }>) =>
    ({ user: { id: '1', plan: 'free', planSource: 'manual', isAdmin: over.isAdmin ?? false, createdAt: '', sealed: true }, rows: {}, hasStripeCustomer: over.hasStripeCustomer ?? false });
  it('blocks an admin, and a Stripe customer until the owner says the subscription is ended', () => {
    expect(blockedReason(plan({}), false)).toBeNull();
    expect(blockedReason(plan({ isAdmin: true }), true)).toMatch(/admin/);
    expect(blockedReason(plan({ hasStripeCustomer: true }), false)).toMatch(/Stripe/);
    expect(blockedReason(plan({ hasStripeCustomer: true }), true)).toBeNull();
  });
});

describe('the command line', () => {
  const run = (args: string[], env: Record<string, string>) =>
    new Promise<{ status: number; stderr: string }>(done =>
      execFile('npx', ['tsx', resolve('scripts/delete-user.mjs'), ...args], { env: { ...process.env, ...env, PII_ENCRYPTION_KEY: randomBytes(32).toString('base64') }, encoding: 'utf8', timeout: 30_000 }, (err, _out, stderr) =>
        done({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stderr })));
  it('exits 2 before connecting for a remote database without --allow-production', async () => {
    const out = await run(['a@b.co', '--yes'], { DATABASE_URL: 'postgres://u:p@db.prod.example/x' });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain('Refusing');
  });
  it('exits 2 without an address', async () => {
    expect((await run([], { DATABASE_URL: 'postgres://u:p@localhost/x' })).status).toBe(2);
  });
});

describe('planDeletion and deleteUser (real database)', () => {
  let db: Kysely<DB>;
  let stop: () => Promise<void>;
  const crypto = createPiiCrypto(randomBytes(32));
  beforeAll(async () => {
    ({ db, stop } = await startTestDatabase());
    await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values
      ('a1', ${crypto.seal('Ada')}, ${crypto.sealStable('ada@example.com')}, true, now(), now()),
      ('b1', ${crypto.seal('Bob')}, ${crypto.sealStable('bob@example.com')}, true, now(), now())`.execute(db);
    await sql`insert into auth.session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") values ('s1', now() + interval '1 day', 't1', now(), now(), 'a1'), ('s2', now() + interval '1 day', 't2', now(), now(), 'b1')`.execute(db);
    await sql`insert into auth.verification (id, identifier, value, "expiresAt") values
      ('v1', ${crypto.sealStable('sign-in-otp-ada@example.com')}, 'x', now() + interval '1 hour'),
      ('v2', ${crypto.sealStable('sign-in-otp-bob@example.com')}, 'x', now() + interval '1 hour')`.execute(db);
    await sql`insert into users (auth_user_id) values ('a1'), ('b1')`.execute(db);
    for (const [uid, who] of [['a1', 'ann'], ['b1', 'bob']] as const) {
      const id = (await db.selectFrom('users').select('id').where('auth_user_id', '=', uid).executeTakeFirstOrThrow()).id;
      await db.insertInto('log_entries').values({ user_id: id, client_id: `e-${who}`, seq: '1', exercise_id: 'squat', d: '2026-10-05', note: 'private note' }).execute();
      await db.insertInto('weeks').values({ user_id: id, seq: '1', week_start: '2026-10-04', data: '{}' }).execute();
    }
  }, 120_000);
  afterAll(async () => { await stop?.(); });

  const count = async (q: ReturnType<typeof sql>) => Number(((await q.execute(db)).rows[0] as { n: string }).n);

  it('plans with counts only, never the address, name or note', async () => {
    const plan = await planDeletion(db, crypto, 'Ada@example.com');
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.rows).toMatchObject({ log_entries: 1, weeks: 1, body_entries: 0 });
    expect(plan.hasStripeCustomer).toBe(false);
    expect(JSON.stringify(plan)).not.toMatch(/ada@|Ada|private note/);
  });
  it('says so for an unknown address and plans nothing', async () => {
    expect(await planDeletion(db, crypto, 'nobody@example.com')).toEqual({ error: 'No account with that address.' });
  });
  it('a plan changes nothing (the dry run)', async () => {
    await planDeletion(db, crypto, 'ada@example.com');
    expect(await count(sql`select count(*) as n from users`)).toBe(2);
  });
  it('deletes the one account like the in-app path, and leaves the other alone', async () => {
    const plan = await planDeletion(db, crypto, 'ada@example.com');
    if ('error' in plan) throw new Error(plan.error);
    await deleteUser(db, crypto, plan, 'ada@example.com');
    expect(await count(sql`select count(*) as n from users where auth_user_id = 'a1'`)).toBe(0);
    expect(await count(sql`select count(*) as n from log_entries where user_id = ${plan.user.id}`)).toBe(0);
    expect(await count(sql`select count(*) as n from auth."user" where id = 'a1'`)).toBe(0);
    expect(await count(sql`select count(*) as n from auth.session where "userId" = 'a1'`)).toBe(0);
    expect(await count(sql`select count(*) as n from auth.verification where id = 'v1'`)).toBe(0);
    expect(await count(sql`select count(*) as n from users where auth_user_id = 'b1'`)).toBe(1);
    expect(await count(sql`select count(*) as n from log_entries`)).toBe(1);
    expect(await count(sql`select count(*) as n from auth.verification where id = 'v2'`)).toBe(1);
    expect(await planDeletion(db, crypto, 'ada@example.com')).toHaveProperty('error');
  });
});
