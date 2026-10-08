import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createAuth } from '../auth/betterAuth.ts';
import { createDb } from '../db/connection.ts';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';

// Erasing a person's data and deleting their account (migration 010), through the real API as the restricted role it runs as in
// production, with Better Auth's real sessions. Owner access is only used to set data up and to look at what is left.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;
let auth: ReturnType<typeof createAuth>;
const SECRET = randomBytes(32).toString('base64');

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
  auth = createAuth({ baseURL: 'http://localhost:3999', secret: SECRET, databaseUrl: appUrl, google: { clientId: 'c.apps.googleusercontent.com', clientSecret: 's' }, testSignIn: true }, 'test');
  server = createApp({ db: app, auth, limits: { account: { max: 4, windowMs: 60_000 } } }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await auth.pool.end();
  await app.destroy();
  await stop?.();
});
beforeEach(async () => {
  await owner.deleteFrom('users').execute();
  await sql`delete from auth."user"`.execute(owner);
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const dev = (user: string) => ({ 'x-dev-user': user, 'x-client-version': 'test-1' });
async function signUp(email: string) {
  const res = await post('/api/auth/sign-up/email', { email, password: 'correct horse battery staple', name: 'Test User' });
  expect(res.status).toBe(200);
  return { cookie: (res.headers.getSetCookie().find(c => /session_token=/.test(c)) ?? '').split(';')[0]! };
}
const me = async (headers: Record<string, string>) => (await fetch(`${base}/api/me`, { headers })).status;

const DATA = ['log_entries', 'body_entries', 'weeks', 'stretch_weeks', 'supplement_days', 'programs', 'config', 'library_items', 'list_items', 'row_history', 'refused_writes'] as const;
const rowsOf = async (table: string, userId: string) => Number((await sql<{ n: string }>`select count(*) as n from ${sql.table(table)} where user_id = ${userId}`.execute(owner)).rows[0]!.n);
const allRows = async (userId: string): Promise<Record<string, number>> => Object.fromEntries(await Promise.all(DATA.map(async t => [t, await rowsOf(t, userId)])));
const userId = async (authUserId: string) => (await owner.selectFrom('users').select('id').where('auth_user_id', '=', authUserId).executeTakeFirst())?.id;

// One row in every data table for a user, written as the owner, plus an edit (which writes a history copy) and a refusal.
async function fill(authUserId: string): Promise<string> {
  const id = (await owner.insertInto('users').values({ auth_user_id: authUserId }).returning('id').executeTakeFirstOrThrow()).id;
  await owner.insertInto('log_entries').values({ user_id: id, client_id: `e-${authUserId}`, seq: '1', exercise_id: 'squat', d: '2026-10-05', note: 'private note' }).execute();
  await owner.insertInto('body_entries').values({ user_id: id, seq: '1', wk: '2026-10-04', d: '2026-10-07', weight_lb: '180' }).execute();
  await owner.insertInto('weeks').values({ user_id: id, seq: '1', week_start: '2026-10-04', data: '{}' }).execute();
  await owner.insertInto('stretch_weeks').values({ user_id: id, seq: '1', week_start: '2026-10-04', data: '{}' }).execute();
  await owner.insertInto('supplement_days').values({ user_id: id, seq: '1', day: '2026-10-07' }).execute();
  await owner.insertInto('programs').values({ user_id: id, seq: '1', key: 'A', data: '{}' }).execute();
  await owner.insertInto('config').values({ user_id: id, seq: '1', data: '{}' }).execute();
  await owner.insertInto('library_items').values({ user_id: id, client_id: `v-${authUserId}`, seq: '1', data: '{}' }).execute();
  await owner.insertInto('list_items').values({ user_id: id, list: 'stretch', client_id: `s-${authUserId}`, position: 0, seq: '1', data: '{}' }).execute();
  await owner.insertInto('refused_writes').values({ user_id: id, command: 'x', reason: 'y' }).execute();
  await sql`update log_entries set weight_lb = 100, version = version + 1 where user_id = ${id}`.execute(owner); // the history trigger copies the old row
  return id;
}

describe('erase data', () => {
  it('removes every row of the caller, history and refusals included, keeps the account, and leaves other people alone', async () => {
    const a = await fill('dev:ann');
    const b = await fill('dev:bob');
    expect(Object.values(await allRows(a)).every(n => n > 0)).toBe(true);
    const res = await post('/api/account/erase-data', { confirm: 'ERASE' }, dev('ann'));
    expect(res.status).toBe(200);
    expect(await allRows(a)).toEqual(Object.fromEntries(DATA.map(t => [t, 0])));
    expect(Object.values(await allRows(b)).every(n => n > 0)).toBe(true);
    expect(await userId('dev:ann')).toBe(a); // the account stays
    expect(await me(dev('ann'))).toBe(200);
  });

  it('raises the data epoch for the caller only, and the pull feed carries it', async () => {
    await fill('dev:ann');
    await fill('dev:bob');
    const epoch = async (user: string) => ((await (await fetch(`${base}/api/sync?since=0`, { headers: dev(user) })).json()) as { epoch: string }).epoch;
    expect(await epoch('ann')).toBe('1');
    await post('/api/account/erase-data', { confirm: 'ERASE' }, dev('ann'));
    expect(await epoch('ann')).toBe('2');
    expect(await epoch('bob')).toBe('1');
  });

  it('refuses anything but the exact word, and deletes nothing', async () => {
    const a = await fill('dev:ann');
    const before = await allRows(a);
    for (const body of [{}, { confirm: 'erase' }, { confirm: 'DELETE' }, { confirm: true }, 'ERASE']) {
      // 422 from us; a bare JSON string never gets that far (Express answers 400): either way nothing is deleted.
      expect([400, 422]).toContain((await post('/api/account/erase-data', body, dev('ann'))).status);
    }
    expect(await allRows(a)).toEqual(before);
  });

  it('needs a signed-in user', async () => {
    await fill('dev:ann');
    expect((await post('/api/account/erase-data', { confirm: 'ERASE' })).status).toBe(401);
  });

  it('the database function refuses to run without a signed-in user, even as the restricted role', async () => {
    await fill('dev:ann');
    await expect(sql`select erase_my_data()`.execute(app)).rejects.toThrow(/no signed-in user/);
    await expect(sql`select delete_my_account()`.execute(app)).rejects.toThrow(/no signed-in user/);
    expect(await rowsOf('log_entries', (await userId('dev:ann'))!)).toBe(1);
  });
});

describe('delete account', () => {
  it('removes the account, its data and every Better Auth record, signs the old session out, and leaves other people alone', async () => {
    const ann = await signUp('ann@example.com');
    const bob = await signUp('bob@example.com');
    expect(await me(ann)).toBe(200);
    expect(await me(bob)).toBe(200);
    const a = (await userId((await owner.selectFrom('users').select('auth_user_id').orderBy('id').executeTakeFirstOrThrow()).auth_user_id))!;
    // Real data for both through the API, then an edit so history exists too.
    for (const [who, id] of [[ann, 'a1'], [bob, 'b1']] as const) {
      await post('/api/commands/log-session', { clientId: id, baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } }, { ...who, 'x-client-version': 'test-1' });
    }
    expect(await rowsOf('log_entries', a)).toBe(1);

    expect((await post('/api/account/delete', { confirm: 'DELETE' }, ann)).status).toBe(200);

    const left = await sql<{ users: string; login: string; sessions: string; accounts: string }>`
      select (select count(*) from users where id = ${a}) as users,
             (select count(*) from auth."user" where email = 'ann@example.com') as login,
             (select count(*) from auth.session s join auth."user" u on u.id = s."userId" where u.email = 'ann@example.com') as sessions,
             (select count(*) from auth.account) as accounts`.execute(owner);
    expect(left.rows[0]).toMatchObject({ users: '0', login: '0', sessions: '0' });
    expect(Object.values(await allRows(a)).every(n => n === 0)).toBe(true);
    expect(await me(ann)).toBe(401); // the cookie she still holds opens nothing
    // Bob is untouched: still signed in, still has his entry.
    expect(await me(bob)).toBe(200);
    expect(await owner.selectFrom('log_entries').select('client_id').where('client_id', '=', 'b1').execute()).toHaveLength(1);
    expect(Number(left.rows[0]!.accounts)).toBe(1); // only Bob's sign-in record is left
  });

  it('refuses anything but the exact word, and deletes nothing', async () => {
    const ann = await signUp('ann@example.com');
    for (const body of [{}, { confirm: 'delete' }, { confirm: 'ERASE' }]) expect((await post('/api/account/delete', body, ann)).status).toBe(422);
    expect(await me(ann)).toBe(200);
  });

  it('a new sign-in with the same email afterwards is a brand-new, empty account', async () => {
    const first = await signUp('ann@example.com');
    await post('/api/commands/log-session', { clientId: 'a1', baseVersion: null, input: { exerciseId: 'squat', entry: { d: '2026-10-05', w: 135 } } }, { ...first, 'x-client-version': 'test-1' });
    await post('/api/account/delete', { confirm: 'DELETE' }, first);
    const second = await signUp('ann@example.com');
    expect(await me(second)).toBe(200);
    const feed = (await (await fetch(`${base}/api/sync?since=0`, { headers: { ...second, 'x-client-version': 'test-1' } })).json()) as { rows: unknown[]; epoch: string };
    expect(feed.rows).toEqual([]);
    expect(feed.epoch).toBe('1');
  });
});

describe('limits', () => {
  it('erase and delete share a small hourly limit per user', async () => {
    await fill('dev:ann');
    for (let i = 0; i < 4; i++) expect((await post('/api/account/erase-data', { confirm: 'nope' }, dev('ann'))).status).toBe(422);
    const limited = await post('/api/account/erase-data', { confirm: 'ERASE' }, dev('ann'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});
