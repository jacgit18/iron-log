import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { isPaid, isPaidPlan, planOf, requirePaid } from './plan.ts';
import { startTestDatabase } from './test/postgres.ts';

describe('who counts as paid', () => {
  it('paid, lifetime and founder do; beta, free and anything unknown do not', () => {
    for (const plan of ['paid', 'lifetime', 'founder']) expect(isPaidPlan(plan)).toBe(true);
    for (const plan of ['beta', 'free', 'vip', '', null, undefined]) expect(isPaidPlan(plan)).toBe(false);
  });
  it('an admin always counts, whatever the plan', () => {
    expect(isPaid('free', true)).toBe(true);
    expect(isPaid('beta', true)).toBe(true);
    expect(isPaid('free', false)).toBe(false);
  });
});

let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;
beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
afterAll(async () => { await stop?.(); });

const listen = async (app: express.Express) => {
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const setPlan = (name: string, plan: string) => sql`update users set plan = ${plan} where auth_user_id = ${'dev:' + name}`.execute(db);
const idOf = async (name: string) => String((await sql<{ id: string }>`select id from users where auth_user_id = ${'dev:' + name}`.execute(db)).rows[0]!.id);

describe('/api/me reports the plan and whether the account is paid', () => {
  const me = async (url: string, name: string) => ((await (await fetch(`${url}/api/me`, { headers: { 'x-dev-user': name } })).json()) as { account: { plan: string; isPaid: boolean } }).account;
  it('follows users.plan', async () => {
    const url = await listen(createApp({ db }));
    expect(await me(url, 'newbie')).toMatchObject({ plan: 'free', isPaid: false }); // every new row starts as free (it was beta until billing went live)
    for (const [plan, paid] of [['free', false], ['paid', true], ['lifetime', true], ['founder', true], ['beta', false]] as const) {
      await setPlan('newbie', plan);
      expect(await me(url, 'newbie')).toMatchObject({ plan, isPaid: paid });
    }
  });
  it('an admin is paid whatever the plan', async () => {
    const url = await listen(createApp({ db, admins: new Set(['dev:boss']) }));
    await me(url, 'boss'); await setPlan('boss', 'free');
    expect(await me(url, 'boss')).toMatchObject({ plan: 'free', isPaid: true });
  });
});

describe('requirePaid', () => {
  it('lets a paid plan and an admin through and answers 402 to the rest', async () => {
    await sql`select ensure_user('dev:payer'), ensure_user('dev:freebie'), ensure_user('dev:chief')`.execute(db);
    await setPlan('payer', 'paid'); await setPlan('freebie', 'free'); await setPlan('chief', 'free');
    expect(await planOf(db, await idOf('payer'))).toBe('paid');
    const app = express();
    app.use(async (req, res, next) => { res.locals.userId = await idOf(String(req.get('x-name'))); res.locals.account = { isAdmin: req.get('x-name') === 'chief' }; next(); });
    app.get('/paid-thing', requirePaid(db), (_req, res) => void res.json({ ok: true }));
    const url = await listen(app);
    const get = (name: string) => fetch(`${url}/paid-thing`, { headers: { 'x-name': name } });
    expect((await get('payer')).status).toBe(200);
    expect((await get('chief')).status).toBe(200);
    expect((await get('freebie')).status).toBe(402);
  });
});
