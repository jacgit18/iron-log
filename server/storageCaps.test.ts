import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { inUserTransaction } from './auth.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// Migration 20261021000001 (code audit S-03 and S-05): refused_writes and row_history are capped per account, and a fixed issue is reopened only by a report from a
// different version than the one that last reported it when it was marked fixed.
let owner: Kysely<DB>; let app: Kysely<DB>; let stop: () => Promise<void>; let server: Server; let base: string;
const big = { max: 1e6, windowMs: 60_000 };
beforeAll(async () => {
  let appUrl: string;
  ({ db: owner, stop, appUrl } = await startTestDatabase());
  app = createDb(appUrl);
  server = createApp({ db: app, admins: new Set(['dev:boss']), limits: { api: big, commands: big, sync: big, push: big, clientErrors: big, importLegacy: big, healthDb: big, issues: big, pushFire: big } as never }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => { await new Promise<void>(done => server.close(() => done())); await app.destroy(); await stop?.(); });
beforeEach(async () => { await owner.deleteFrom('users').execute(); await owner.deleteFrom('issues').execute(); vi.restoreAllMocks(); });

const h = (who: string) => ({ 'x-dev-user': who, 'x-client-version': 't', 'content-type': 'application/json' });
const userId = async (who: string) => { await fetch(`${base}/api/me`, { headers: h(who) }); return (await owner.selectFrom('users').select('id').where('auth_user_id', '=', `dev:${who}`).executeTakeFirstOrThrow()).id; };
const refuseOnce = (who: string, n: number) => fetch(`${base}/api/commands/save-week`, { method: 'POST', headers: h(who), body: JSON.stringify({ clientId: `c${n}`, baseVersion: null, input: { weekStart: 'bad' } }) });
const refusedCount = async (who: string) => Number((await sql<{ n: string }>`select count(*) as n from refused_writes r join users u on u.id = r.user_id where u.auth_user_id = ${`dev:${who}`}`.execute(owner)).rows[0]!.n);

describe('refused_writes keeps the newest 200 rows of an account, none older than 30 days', () => {
  it('trims an account that sends more, and leaves another account alone', async () => {
    for (let i = 0; i < 5; i++) expect((await refuseOnce('quiet', i)).status).toBe(422);
    for (let i = 0; i < 230; i++) expect((await refuseOnce('noisy', i)).status).toBe(422);
    expect(await refusedCount('noisy')).toBe(200);
    expect(await refusedCount('quiet')).toBe(5);
    const kept = (await sql<{ client_id: string }>`select client_id from refused_writes r join users u on u.id = r.user_id where u.auth_user_id = 'dev:noisy' order by r.id`.execute(owner)).rows.map(r => r.client_id);
    expect(kept[0]).toBe('c30'); // the 30 oldest went
    expect(kept.at(-1)).toBe('c229');
  }, 120_000);

  it('drops rows older than 30 days at the next insert, even when the account is under the cap', async () => {
    const id = await userId('slow');
    for (let i = 0; i < 4; i++) await refuseOnce('slow', i);
    await owner.updateTable('refused_writes').set({ received_at: sql`now() - interval '31 days'` }).where('user_id', '=', id).where('client_id', 'in', ['c0', 'c1']).execute();
    expect(await refusedCount('slow')).toBe(4);
    await refuseOnce('slow', 99);
    expect(await refusedCount('slow')).toBe(3); // c2, c3 and the new one
  });
});

describe('row_history keeps the latest 50 versions of a row', () => {
  const makeRow = async (uid: string, weekStart: string) => (await sql<{ id: string }>`insert into weeks (user_id, seq, week_start, data) values (${uid}, 1, ${weekStart}, '{}') returning id`.execute(owner)).rows[0]!.id;
  const history = async (rowId: string) => (await sql<{ version: number }>`select version from row_history where table_name = 'weeks' and row_id = ${rowId} order by version`.execute(owner)).rows.map(r => r.version);

  it('after 60 updates holds versions 11 to 60, and another row is not trimmed', async () => {
    const uid = String(await userId('hist'));
    const a = await makeRow(uid, '2026-10-04'); const b = await makeRow(uid, '2026-10-11');
    for (let i = 1; i <= 60; i++) await sql`update weeks set version = version + 1, data = jsonb_build_object('n', ${i}::int) where id = ${a}`.execute(owner);
    for (let i = 1; i <= 3; i++) await sql`update weeks set version = version + 1 where id = ${b}`.execute(owner);
    const kept = await history(a);
    expect(kept).toHaveLength(50);
    expect(kept[0]).toBe(11);
    expect(kept.at(-1)).toBe(60);
    expect(await history(b)).toEqual([1, 2, 3]);
  });

  it('works for the app role too (the trigger is security definer), still only for that account', async () => {
    const uid = String(await userId('app'));
    const row = await makeRow(uid, '2026-10-04');
    for (let i = 1; i <= 55; i++) await inUserTransaction(app, uid, trx => sql`update weeks set version = version + 1 where id = ${row}`.execute(trx));
    const kept = await history(row);
    expect(kept).toHaveLength(50);
    expect(kept[0]).toBe(6);
    expect(kept.at(-1)).toBe(55);
  });
});

describe('a fixed issue is reopened only by a report from a different version than when it was fixed', () => {
  const FP = 'abcdef012345';
  const record = (version: string) => sql<{ record_issue: string }>`select record_issue(${FP}, 'error', 'Bad weight ###', 'foo /assets/index.js:1:2', '/progress', ${version})`.execute(app).then(r => r.rows[0]!.record_issue);
  const issue = () => owner.selectFrom('issues').selectAll().where('fingerprint', '=', FP).executeTakeFirstOrThrow();
  const setStatus = async (status: string) => {
    await fetch(`${base}/api/me`, { headers: h('boss') });
    await owner.updateTable('users').set({ is_admin: true }).where('auth_user_id', '=', 'dev:boss').execute();
    return fetch(`${base}/api/issues/${FP}`, { method: 'PATCH', headers: h('boss'), body: JSON.stringify({ status }) });
  };

  it('a report from the version that last reported it does not reopen it, a report from another version does, and every report is counted', async () => {
    await record('10');
    expect((await setStatus('fixed')).status).toBe(200);
    expect((await issue()).fixed_version).toBe('10');
    await record('10'); // a phone still running the old version
    expect(await issue()).toMatchObject({ status: 'fixed', occurrences: '2' });
    await record(''); // no version known
    expect((await issue()).status).toBe('fixed');
    await record('11'); // the version after the fix: the fix did not hold
    expect(await issue()).toMatchObject({ status: 'open', occurrences: '4', last_version: '11' });
  });

  it('marking it fixed again takes the version of the moment, and marking a fixed issue fixed again changes nothing', async () => {
    await record('10'); await setStatus('fixed'); await record('11');
    expect((await issue()).status).toBe('open');
    await setStatus('fixed');
    expect((await issue()).fixed_version).toBe('11');
    await record('11');
    expect((await issue()).status).toBe('fixed');
    await record('12'); await setStatus('investigating'); await setStatus('fixed'); await setStatus('fixed');
    expect((await issue()).fixed_version).toBe('12');
  });

  it('still leaves ignored and investigating issues as they are', async () => {
    for (const status of ['ignored', 'investigating']) {
      await owner.deleteFrom('issues').execute();
      await record('10'); await setStatus(status); await record('11');
      expect((await issue()).status).toBe(status);
    }
  });
});
