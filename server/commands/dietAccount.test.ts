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

// Diet safety checks (brief diet-safety-checks): a food log, saved meals and typed targets are erased by Delete my data and Delete account, with their history copies, and only for the caller. Same setup as account.test.ts.
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
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': 'test-1', ...headers }, body: JSON.stringify(body) });
const dev = (user: string) => ({ 'x-dev-user': user });
async function signUp(email: string) {
  const res = await post('/api/auth/sign-up/email', { email, password: 'correct horse battery staple', name: 'Test User' });
  expect(res.status).toBe(200);
  return { cookie: (res.headers.getSetCookie().find(c => /session_token=/.test(c)) ?? '').split(';')[0]! };
}
const entry = (id: string, n: string) => ({ id, d: '2026-10-30', n, kcal: 450, p: 30, c: 40, f: 12 });
const TARGETS = { diet: { kcal: 2900, protein: 160, meals: [{ id: 'm1', n: 'Breakfast', items: [{ n: 'Oats', kcal: 300, p: 10 }] }] } };

// A food log written the way the app writes it: through the sync commands. Also an edit, so the history trigger holds a copy of the first version.
async function fillDiet(who: Record<string, string>, tag: string) {
  const save = (clientId: string, baseVersion: number | null, item: object, position: number) =>
    post('/api/commands/save-list-item', { clientId, baseVersion, input: { list: 'diet_entry', item, position } }, who);
  expect((await save(`${tag}-1`, null, entry(`${tag}1`, 'Chicken and rice'), 0)).status).toBe(201);
  expect((await save(`${tag}-2`, null, entry(`${tag}2`, 'Oats'), 1)).status).toBe(201);
  expect((await save(`${tag}-3`, 1, { ...entry(`${tag}1`, 'Chicken and rice'), kcal: 500 }, 0)).status).toBe(200);
  expect((await post('/api/commands/save-config', { clientId: `${tag}-c`, baseVersion: null, input: { config: TARGETS } }, who)).status).toBe(201);
}
const dietRows = async (authUserId: string) => {
  const id = (await owner.selectFrom('users').select('id').where('auth_user_id', '=', authUserId).executeTakeFirst())?.id;
  if (!id) return { entries: 0, config: 0, history: 0, names: [] as string[] };
  const entries = await owner.selectFrom('list_items').select('client_id').where('user_id', '=', id).where('list', '=', 'diet_entry').execute();
  const config = await owner.selectFrom('config').select('user_id').where('user_id', '=', id).execute();
  const history = await sql<{ n: string }>`select count(*) as n from row_history where user_id = ${id}`.execute(owner);
  return { entries: entries.length, config: config.length, history: Number(history.rows[0]!.n), names: entries.map(e => e.client_id) };
};
const pull = async (who: Record<string, string>) => (await (await fetch(`${base}/api/sync?since=0`, { headers: { 'x-client-version': 'test-1', ...who } })).json()) as { rows: { table: string; list?: string }[] };

describe('Erase my data with a food log', () => {
  it('removes the entries, the typed targets and saved meals, and the history copies of an edited entry; the pull feed is empty; another person keeps theirs', async () => {
    await fillDiet(dev('ann'), 'a');
    await fillDiet(dev('bob'), 'b');
    const before = await dietRows('dev:ann');
    expect(before).toMatchObject({ entries: 2, config: 1 });
    expect(before.history).toBeGreaterThan(0); // the edit left a copy of the old entry, which holds the food names
    expect((await pull(dev('ann'))).rows.filter(r => r.list === 'diet_entry')).toHaveLength(2);

    expect((await post('/api/account/erase-data', { confirm: 'ERASE' }, dev('ann'))).status).toBe(200);

    expect(await dietRows('dev:ann')).toEqual({ entries: 0, config: 0, history: 0, names: [] });
    expect((await pull(dev('ann'))).rows).toEqual([]);
    expect(await dietRows('dev:bob')).toMatchObject({ entries: 2, config: 1 });
    // A fresh log after the erase works: the account is still there and starts from nothing.
    const again = await post('/api/commands/save-list-item', { clientId: 'a-4', baseVersion: null, input: { list: 'diet_entry', item: entry('a9', 'Apple'), position: 0 } }, dev('ann'));
    expect(again.status).toBe(201);
    expect((await dietRows('dev:ann')).names).toEqual(['a9']);
  });
});

describe('Delete account with a food log', () => {
  it('leaves no diet row, saved meal, target or history copy of the person, and does not touch another account', async () => {
    const ann = await signUp('ann@example.com');
    const bob = await signUp('bob@example.com');
    await fillDiet(ann, 'a');
    await fillDiet(bob, 'b');
    const annId = (await owner.selectFrom('users').select('id').orderBy('id').executeTakeFirstOrThrow()).id;
    const mine = async () => Number((await sql<{ n: string }>`select (select count(*) from list_items where user_id = ${annId}) + (select count(*) from config where user_id = ${annId}) + (select count(*) from row_history where user_id = ${annId}) as n`.execute(owner)).rows[0]!.n);
    expect(await mine()).toBeGreaterThan(0);

    expect((await post('/api/account/delete', { confirm: 'DELETE' }, ann)).status).toBe(200);

    expect(await mine()).toBe(0);
    const left = await owner.selectFrom('list_items').select(['user_id', 'client_id']).where('list', '=', 'diet_entry').execute();
    expect(left.map(r => r.client_id).sort()).toEqual(['b1', 'b2']); // only Bob's two entries remain; nothing of Ann's is orphaned
    expect(left.every(r => r.user_id !== annId)).toBe(true);
    expect((await owner.selectFrom('config').select('user_id').execute()).map(r => r.user_id)).not.toContain(annId);
  });
});
