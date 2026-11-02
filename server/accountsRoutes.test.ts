import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { inUserTransaction } from './auth.ts';
import { createDb } from './db/connection.ts';
import { createPiiCrypto } from './auth/piiCrypto.ts';
import type { DB } from './db/types.ts';
import { labelFor } from './accountsRoutes.ts';
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

describe('without a database', () => {
  it('answers 503 and never reaches the accounts routes', async () => {
    server = createApp({ admins: new Set(['dev:boss']) }).listen(0);
    await new Promise(done => server!.once('listening', done));
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/accounts`, { headers: { 'x-dev-user': 'boss' } });
    expect(res.status).toBe(503);
  });
});
