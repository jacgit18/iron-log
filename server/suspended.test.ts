import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { mayCallWhileSuspended } from './suspended.ts';
import { startTestDatabase } from './test/postgres.ts';

// A suspended account is refused by the server (brief admin-accounts-screen), one request per class of route, and restored at once.
let owner: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;

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

async function start() {
  server = createApp({ db: app, admins: new Set(['dev:boss']) }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const as = (who: string, method: string, path: string, body?: unknown) =>
    fetch(`${base}/api${path}`, { method, headers: { 'x-dev-user': who, 'x-client-version': 'dev', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  await as('victim', 'GET', '/me');
  await as('boss', 'GET', '/me');
  await owner.updateTable('users').set({ is_admin: true }).where('auth_user_id', '=', 'dev:boss').execute();
  const victim = String((await owner.selectFrom('users').select('id').where('auth_user_id', '=', 'dev:victim').executeTakeFirstOrThrow()).id);
  return { as, victim };
}

describe('mayCallWhileSuspended', () => {
  it('lets only me, erase-data and delete through', () => {
    for (const p of ['/me', '/ME', '/me/', '/account/erase-data', '/account/delete']) expect(mayCallWhileSuspended(p), p).toBe(true);
    for (const p of ['/sync/pull', '/commands/log-session', '/backups', '/push/x', '/foods/search', '/issues', '/accounts', '/me/x', '/account', '/account/erase-data/x']) expect(mayCallWhileSuspended(p), p).toBe(false);
  });
});

describe('a suspended account', () => {
  it('is refused on every route class but still sees /api/me say suspended, and can erase and delete', async () => {
    const { as, victim } = await start();
    expect((await as('victim', 'GET', '/sync?since=0')).status).not.toBe(403);
    expect((await as('boss', 'POST', `/accounts/${victim}/suspend`)).status).toBe(200);
    for (const [method, path] of [['GET', '/sync?since=0'], ['POST', '/commands/log-session'], ['GET', '/backups'], ['GET', '/push/key'], ['GET', '/foods/search?q=egg'], ['GET', '/issues'], ['GET', '/accounts'], ['GET', '/no-such-thing']] as const) {
      const res = await as('victim', method, path, method === 'POST' ? {} : undefined);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: 'account_suspended' });
    }
    const me = (await (await as('victim', 'GET', '/me')).json()) as { account: { suspended: boolean } };
    expect(me.account.suspended).toBe(true);
    expect((await as('victim', 'POST', '/account/erase-data', {})).status).not.toBe(403);
  });
  it('comes back at once on restore, with its data untouched, and other accounts were never affected', async () => {
    const { as, victim } = await start();
    await as('boss', 'POST', `/accounts/${victim}/suspend`);
    expect((await as('boss', 'GET', '/sync?since=0')).status).not.toBe(403);
    await as('boss', 'POST', `/accounts/${victim}/restore`);
    expect((await as('victim', 'GET', '/sync?since=0')).status).not.toBe(403);
    expect(((await (await as('victim', 'GET', '/me')).json()) as { account: { suspended: boolean } }).account.suspended).toBe(false);
  });
});
