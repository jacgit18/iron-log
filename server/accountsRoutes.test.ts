import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { inUserTransaction } from './auth.ts';
import { createDb } from './db/connection.ts';
import { createPiiCrypto } from './auth/piiCrypto.ts';
import type { DB } from './db/types.ts';
import { accountsRoutes, labelFor } from './accountsRoutes.ts';
import { startTestDatabase } from './test/postgres.ts';

// The admin accounts API (brief admin-accounts-screen): two locks (ADMIN_EMAILS at the route, users.is_admin in the database), what the
// list may carry, suspend and restore with their log, and the refusals.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;
const pii = createPiiCrypto(Buffer.alloc(32, 7));

beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
}, 120_000);
afterAll(async () => {
  await app.destroy();
  await stop?.();
});
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));

async function start(admins: string[], extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  server = createApp({ db: app, admins: new Set(admins), pii, signupCap: 25, ...extra }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (who: string, method: string, path: string) => fetch(`${base}/api/accounts${path}`, { method, headers: { 'x-dev-user': who } });
  const me = (who: string) => fetch(`${base}/api/me`, { headers: { 'x-dev-user': who } });
  const idOf = async (who: string) => { await me(who); return String((await owner.selectFrom('users').select('id').where('auth_user_id', '=', `dev:${who}`).executeTakeFirstOrThrow()).id); };
  const makeAdmin = async (who: string, flag = true) => { await me(who); await owner.updateTable('users').set({ is_admin: flag }).where('auth_user_id', '=', `dev:${who}`).execute(); };
  return { base, call, me, idOf, makeAdmin };
}

describe('the two locks', () => {
  it('a plain account gets 403 on all three routes', async () => {
    const { call, idOf } = await start(['dev:boss']);
    const id = await idOf('guest');
    expect((await call('guest', 'GET', '')).status).toBe(403);
    expect((await call('guest', 'POST', `/${id}/suspend`)).status).toBe(403);
    expect((await call('guest', 'POST', `/${id}/restore`)).status).toBe(403);
  });
  it('an account on the admin list whose database flag is not set also gets 403, and nothing changes', async () => {
    const { call, makeAdmin, idOf } = await start(['dev:boss']);
    await makeAdmin('boss', false);
    const id = await idOf('victim');
    expect((await call('boss', 'GET', '')).status).toBe(403);
    expect((await call('boss', 'POST', `/${id}/suspend`)).status).toBe(403);
    expect((await owner.selectFrom('users').select('suspended_at').where('id', '=', id).executeTakeFirstOrThrow()).suspended_at).toBeNull();
  });
  it('the functions refuse on their own: a signed-in non-admin, and a connection with no user', async () => {
    const id = (await owner.insertInto('users').values({ auth_user_id: 'plain-accounts' }).returning('id').executeTakeFirstOrThrow()).id;
    await expect(inUserTransaction(app, id, trx => sql`select list_accounts(10)`.execute(trx))).rejects.toMatchObject({ code: '42501' });
    await expect(inUserTransaction(app, id, trx => sql`select set_account_suspended(${id}::bigint, true)`.execute(trx))).rejects.toMatchObject({ code: '42501' });
    await expect(sql`select list_accounts(10)`.execute(app)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('GET /api/accounts', () => {
  it('carries the cap, counts and only masked, minimal rows', async () => {
    const { call, makeAdmin, idOf } = await start(['dev:boss']);
    await makeAdmin('boss');
    await idOf('alice');
    const sealed = pii.sealStable('jane.doe@gmail.com');
    await owner.insertInto('users').values({ auth_user_id: 'real-auth-id', plan: 'paid' }).execute();
    await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('real-auth-id', ${pii.seal('Jane Doe')}, ${sealed}, true, now(), now())`.execute(owner);
    const res = await call('boss', 'GET', '');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as { ok: boolean; cap: number | null; counts: { total: number; paid: number; suspended: number }; accounts: Array<Record<string, unknown>>; actions: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.cap).toBe(25);
    expect(body.counts.paid).toBeGreaterThanOrEqual(1);
    const row = body.accounts.find(a => a.label === 'j***@gmail.com');
    expect(row).toMatchObject({ plan: 'paid', suspended: false, isAdmin: false });
    expect(Object.keys(row!).sort()).toEqual(['id', 'isAdmin', 'joined', 'label', 'plan', 'suspended']);
    const text = JSON.stringify(body);
    for (const leak of ['jane.doe', 'Jane', 'Doe', 'enc1:']) expect(text).not.toContain(leak);
    expect(body.accounts.some(a => a.label === 'dev account')).toBe(true);
  });
  it('shows no cap as null', async () => {
    const { call, makeAdmin } = await start(['dev:boss'], { signupCap: undefined });
    await makeAdmin('boss');
    expect(((await (await call('boss', 'GET', '')).json()) as { cap: unknown }).cap).toBeNull();
  });
  it('labelFor opens a sealed address, masks a plain one and survives a damaged value', () => {
    expect(labelFor({ dev: false, sealedEmail: pii.sealStable('zed@x.org') }, pii)).toBe('z***@x.org');
    expect(labelFor({ dev: false, sealedEmail: 'plain@x.org' })).toBe('p***@x.org');
    expect(labelFor({ dev: false, sealedEmail: 'enc1:AAAA' }, pii)).toBe('account');
    expect(labelFor({ dev: false, sealedEmail: null }, pii)).toBe('account');
  });
});

describe('suspend and restore', () => {
  it('suspends once, logs one row, restores, and a repeat is a no-op without a second row', async () => {
    const { call, makeAdmin, idOf } = await start(['dev:boss']);
    await makeAdmin('boss');
    const id = await idOf('target1');
    await owner.deleteFrom('admin_actions').execute();
    expect(await (await call('boss', 'POST', `/${id}/suspend`)).json()).toEqual({ ok: true, changed: true });
    expect(await (await call('boss', 'POST', `/${id}/suspend`)).json()).toEqual({ ok: true, changed: false });
    expect((await owner.selectFrom('users').select('suspended_at').where('id', '=', id).executeTakeFirstOrThrow()).suspended_at).not.toBeNull();
    expect(await (await call('boss', 'POST', `/${id}/restore`)).json()).toEqual({ ok: true, changed: true });
    const log = await owner.selectFrom('admin_actions').select(['action', 'target_user_id']).orderBy('id').execute();
    expect(log.map(l => l.action)).toEqual(['suspend', 'restore']);
    expect(log.every(l => String(l.target_user_id) === id)).toBe(true);
    const listed = (await (await call('boss', 'GET', '')).json()) as { actions: Array<{ action: string }> };
    expect(listed.actions.map(a => a.action)).toEqual(['restore', 'suspend']);
  });
  it('refuses an admin target and the caller, 422 with nothing changed; an unknown or bad number is 404 or 422', async () => {
    const { call, makeAdmin, idOf } = await start(['dev:boss']);
    await makeAdmin('boss');
    await makeAdmin('boss2');
    const self = await idOf('boss');
    const other = await idOf('boss2');
    await owner.deleteFrom('admin_actions').execute();
    expect((await call('boss', 'POST', `/${self}/suspend`)).status).toBe(422);
    expect((await call('boss', 'POST', `/${other}/suspend`)).status).toBe(422);
    expect((await call('boss', 'POST', '/999999999/suspend')).status).toBe(404);
    expect((await call('boss', 'POST', '/abc/suspend')).status).toBe(422);
    expect((await call('boss', 'POST', '/0/suspend')).status).toBe(422);
    expect(await owner.selectFrom('admin_actions').selectAll().execute()).toEqual([]);
  });
  it('deleting the account keeps the log row with the target set null', async () => {
    const { call, makeAdmin, idOf } = await start(['dev:boss']);
    await makeAdmin('boss');
    const id = await idOf('gone');
    await owner.deleteFrom('admin_actions').execute();
    await call('boss', 'POST', `/${id}/suspend`);
    await owner.deleteFrom('users').where('id', '=', id).execute();
    const log = await owner.selectFrom('admin_actions').select('target_user_id').execute();
    expect(log).toEqual([{ target_user_id: null }]);
  });
});

// Delete forever (brief admin-delete-account): every guard, then the same result as Delete my account.
async function tablesWithUserId() {
  return (await sql<{ table_name: string }>`select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name) where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'`.execute(owner)).rows.map(r => r.table_name);
}
const rowsOf = async (id: string) => {
  let n = 0;
  for (const t of await tablesWithUserId()) n += Number((await sql<{ n: string }>`select count(*) as n from ${sql.table(t)} where user_id = ${id}`.execute(owner)).rows[0]!.n);
  return n;
};

describe('delete forever', () => {
  it('deletes a suspended account and everything it owns, leaves another account alone, and logs it with the target nulled', async () => {
    const { call, makeAdmin, idOf } = await start(['dev:boss']);
    await makeAdmin('boss');
    const victim = await idOf('victim');
    const bystander = await idOf('bystander');
    for (const id of [victim, bystander]) await owner.insertInto('config').values({ user_id: id, data: JSON.stringify({ a: 1 }), seq: id }).execute();
    await owner.deleteFrom('admin_actions').execute();
    await call('boss', 'POST', `/${victim}/suspend`);
    const res = await fetch(`${(await call('boss', 'GET', '')).url}/${victim}/delete`, { method: 'POST', headers: { 'x-dev-user': 'boss', 'content-type': 'application/json' }, body: JSON.stringify({ confirm: victim }) });
    expect(await res.json()).toEqual({ ok: true });
    expect(await owner.selectFrom('users').select('id').where('id', '=', victim).execute()).toEqual([]);
    expect(await rowsOf(victim)).toBe(0);
    expect(await rowsOf(bystander)).toBeGreaterThan(0);
    expect((await owner.selectFrom('users').select('id').where('id', '=', bystander).execute()).length).toBe(1);
    const log = await owner.selectFrom('admin_actions').select(['action', 'target_user_id']).orderBy('id').execute();
    expect(log).toEqual([{ action: 'suspend', target_user_id: null }, { action: 'delete', target_user_id: null }]);
    const listed = (await (await call('boss', 'GET', '')).json()) as { actions: Array<{ action: string; targetId: string | null }> };
    expect(listed.actions[0]).toMatchObject({ action: 'delete', targetId: null });
  });

  const post = async (base: string, who: string, id: string, body: unknown) =>
    fetch(`${base}/api/accounts/${id}/delete`, { method: 'POST', headers: { 'x-dev-user': who, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('refuses a wrong or missing confirm, an unsuspended account, an admin and the caller, and deletes nothing', async () => {
    const { base, call, makeAdmin, idOf } = await start(['dev:boss']);
    await makeAdmin('boss');
    await makeAdmin('boss2');
    const active = await idOf('active');
    const suspended = await idOf('suspended1');
    const boss = await idOf('boss');
    const boss2 = await idOf('boss2');
    await call('boss', 'POST', `/${suspended}/suspend`);
    expect((await post(base, 'boss', suspended, {})).status).toBe(422);
    expect((await post(base, 'boss', suspended, { confirm: '1' + suspended })).status).toBe(422);
    expect((await post(base, 'boss', suspended, { confirm: Number(suspended) })).status).toBe(422);
    expect(await (await post(base, 'boss', active, { confirm: active })).json()).toEqual({ ok: false, error: 'suspend the account first' });
    expect((await post(base, 'boss', boss, { confirm: boss })).status).toBe(422);
    expect((await post(base, 'boss', boss2, { confirm: boss2 })).status).toBe(422);
    expect((await post(base, 'boss', '999999999', { confirm: '999999999' })).status).toBe(404);
    expect((await post(base, 'boss', 'abc', { confirm: 'abc' })).status).toBe(422);
    for (const id of [active, suspended, boss, boss2]) expect((await owner.selectFrom('users').select('id').where('id', '=', id).execute()).length, id).toBe(1);
  });

  it('is 403 for a plain account and the functions refuse a non-admin on their own', async () => {
    const { base, idOf } = await start(['dev:boss']);
    const id = await idOf('victim2');
    expect((await post(base, 'guest', id, { confirm: id })).status).toBe(403);
    const plain = (await owner.insertInto('users').values({ auth_user_id: 'plain-delete' }).returning('id').executeTakeFirstOrThrow()).id;
    await expect(inUserTransaction(app, plain, trx => sql`select admin_delete_account(${id}::bigint)`.execute(trx))).rejects.toMatchObject({ code: '42501' });
    await expect(inUserTransaction(app, plain, trx => sql`select admin_account_for_delete(${id}::bigint)`.execute(trx))).rejects.toMatchObject({ code: '42501' });
    await expect(sql`select admin_delete_account(${id}::bigint)`.execute(app)).rejects.toMatchObject({ code: '42501' });
  });

  // The router alone, with stand-ins for Stripe and the code purge and a header that says who the admin is.
  async function routerApp(deps: { deleteCustomer?: (id: string) => Promise<void>; purgeCodes?: (email: string) => Promise<void> }) {
    const a = express();
    a.use(express.json());
    a.use((req, res, next) => { res.locals.userId = req.get('x-uid'); next(); });
    a.use('/api/accounts', accountsRoutes({ db: app, pii, ...deps }));
    server = a.listen(0);
    await new Promise(done => server!.once('listening', done));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const seedSuspended = async (login: string, extra: Record<string, unknown> = {}) => {
    const admin = (await owner.insertInto('users').values({ auth_user_id: `admin-${login}`, is_admin: true }).returning('id').executeTakeFirstOrThrow()).id;
    const target = (await owner.insertInto('users').values({ auth_user_id: login, suspended_at: new Date(), ...extra }).returning('id').executeTakeFirstOrThrow()).id;
    return { admin, target };
  };

  it('ends the Stripe customer and clears the emailed codes first, using the opened address', async () => {
    const deleteCustomer = vi.fn(async (_id: string) => undefined);
    const purgeCodes = vi.fn(async (_email: string) => undefined);
    const base = await routerApp({ deleteCustomer, purgeCodes });
    const { admin, target } = await seedSuspended('paying-login', { stripe_customer_id: 'cus_123' });
    await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('paying-login', ${pii.seal('Pay Ing')}, ${pii.sealStable('pay@example.com')}, true, now(), now())`.execute(owner);
    const res = await fetch(`${base}/api/accounts/${target}/delete`, { method: 'POST', headers: { 'x-uid': String(admin), 'content-type': 'application/json' }, body: JSON.stringify({ confirm: String(target) }) });
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteCustomer).toHaveBeenCalledWith('cus_123');
    expect(purgeCodes).toHaveBeenCalledWith('pay@example.com');
    expect((await sql`select 1 from auth."user" where id = 'paying-login'`.execute(owner)).rows).toEqual([]);
    expect((await owner.selectFrom('users').select('id').where('id', '=', target).execute())).toEqual([]);
  });

  it('deletes nothing and answers 503 when Stripe cannot be reached', async () => {
    const base = await routerApp({ deleteCustomer: async () => { throw new Error('stripe down'); } });
    const { admin, target } = await seedSuspended('stuck-login', { stripe_customer_id: 'cus_456' });
    const res = await fetch(`${base}/api/accounts/${target}/delete`, { method: 'POST', headers: { 'x-uid': String(admin), 'content-type': 'application/json' }, body: JSON.stringify({ confirm: String(target) }) });
    expect(res.status).toBe(503);
    expect((await owner.selectFrom('users').select('id').where('id', '=', target).execute()).length).toBe(1);
  });

  it('says so, and deletes nothing, when the account is restored while its Stripe customer is being ended', async () => {
    const { admin, target } = await seedSuspended('race-login', { stripe_customer_id: 'cus_789' });
    const base = await routerApp({ deleteCustomer: async () => { await owner.updateTable('users').set({ suspended_at: null }).where('id', '=', target).execute(); } });
    const res = await fetch(`${base}/api/accounts/${target}/delete`, { method: 'POST', headers: { 'x-uid': String(admin), 'content-type': 'application/json' }, body: JSON.stringify({ confirm: String(target) }) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/subscription was already ended/);
    expect((await owner.selectFrom('users').select('id').where('id', '=', target).execute()).length).toBe(1);
  });

  it('still deletes when clearing the codes fails (they expire by themselves)', async () => {
    const base = await routerApp({ purgeCodes: async () => { throw new Error('auth down'); } });
    const { admin, target } = await seedSuspended('codes-login');
    await sql`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('codes-login', ${pii.seal('C')}, ${pii.sealStable('c@example.com')}, true, now(), now())`.execute(owner);
    const res = await fetch(`${base}/api/accounts/${target}/delete`, { method: 'POST', headers: { 'x-uid': String(admin), 'content-type': 'application/json' }, body: JSON.stringify({ confirm: String(target) }) });
    expect(res.status).toBe(200);
    expect((await owner.selectFrom('users').select('id').where('id', '=', target).execute())).toEqual([]);
  });
});

describe('without a database', () => {
  it('answers 503 and never reaches the accounts routes', async () => {
    server = createApp({ admins: new Set(['dev:boss']) }).listen(0);
    await new Promise(done => server!.once('listening', done));
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/accounts`, { headers: { 'x-dev-user': 'boss' } });
    expect(res.status).toBe(503);
  });
});
