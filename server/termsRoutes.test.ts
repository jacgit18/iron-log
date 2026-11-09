import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { CURRENT_TERMS } from '../src/shared/termsVersion.ts';
import { startTestDatabase } from './test/postgres.ts';

// Recorded Terms and Privacy acceptance (brief terms-acceptance): the route is signed-in only, takes only the current versions, and is idempotent.
// `db` is the owner connection (inspects); `app` is the restricted role the API runs as, so row-level security is really in force.
let db: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;
beforeAll(async () => { let appUrl: string; ({ db, stop, appUrl } = await startTestDatabase()); app = createDb(appUrl); }, 120_000);
afterAll(async () => { await app.destroy(); await stop?.(); });
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
beforeEach(async () => { await sql`delete from users`.execute(db); });

async function start() {
  server = createApp({ db: app }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (who: string | null, body: unknown) =>
    fetch(`${base}/api/terms/accept`, { method: 'POST', headers: { 'content-type': 'application/json', ...(who ? { 'x-dev-user': who } : {}) }, body: JSON.stringify(body) });
  const me = async (who: string) => ((await (await fetch(`${base}/api/me`, { headers: { 'x-dev-user': who } })).json()) as { account: { terms: { terms: string | null; privacy: string | null; accepted: boolean } } }).account.terms;
  return { post, me };
}
const row = async (name: string) => (await sql<{ id: string; terms_version: string | null; privacy_version: string | null; terms_accepted_at: Date | null }>`select id, terms_version, privacy_version, terms_accepted_at from users where auth_user_id = ${'dev:' + name}`.execute(db)).rows[0]!;

describe('POST /api/terms/accept', () => {
  it('needs a session', async () => {
    const { post } = await start();
    expect((await post(null, CURRENT_TERMS)).status).toBe(401);
  });

  it('stores the current versions and the time on the account row', async () => {
    const { post } = await start();
    const res = await post('ana', CURRENT_TERMS);
    expect(res.status).toBe(200);
    const r = await row('ana');
    expect(r.terms_version).toBe(CURRENT_TERMS.terms);
    expect(r.privacy_version).toBe(CURRENT_TERMS.privacy);
    expect(r.terms_accepted_at).toBeInstanceOf(Date);
  });

  it('is idempotent: a second call keeps the first time', async () => {
    const { post } = await start();
    await post('ana', CURRENT_TERMS);
    const first = (await row('ana')).terms_accepted_at;
    expect((await post('ana', CURRENT_TERMS)).status).toBe(200);
    expect((await row('ana')).terms_accepted_at).toEqual(first);
  });

  it('refuses a version that is not the current one (409) and stores nothing', async () => {
    const { post } = await start();
    await post('ana', CURRENT_TERMS); // makes the row
    await sql`update users set terms_version = null, privacy_version = null, terms_accepted_at = null`.execute(db);
    const res = await post('ana', { terms: '0.1', privacy: CURRENT_TERMS.privacy });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { current: unknown }).current).toEqual(CURRENT_TERMS);
    const r = await row('ana');
    expect([r.terms_version, r.privacy_version, r.terms_accepted_at]).toEqual([null, null, null]);
  });

  it('refuses a body that is not two version numbers (400)', async () => {
    const { post } = await start();
    for (const body of [{}, { terms: CURRENT_TERMS.terms }, { terms: 1.3, privacy: 1.6 }, { terms: '1.3; drop table users', privacy: '1.6' }, 'x'])
      expect((await post('ana', body)).status, JSON.stringify(body)).toBe(400);
  });

  it('records only for the caller, never another account', async () => {
    const { post } = await start();
    await post('ana', CURRENT_TERMS);
    await post('ben', { terms: '9.9', privacy: '9.9' }); // refused
    expect((await row('ben')).terms_version).toBeNull();
  });
});

describe('/api/me', () => {
  it('carries account.terms (a dev header user counts as accepted)', async () => {
    const { me } = await start();
    expect((await me('ana')).accepted).toBe(true);
  });
});

describe('a suspended account', () => {
  it('can still record its acceptance, so it is not stuck on the accept screen', async () => {
    const { post } = await start();
    await post('sue', CURRENT_TERMS);
    await sql`update users set terms_version = null, privacy_version = null, terms_accepted_at = null, suspended_at = now()`.execute(db);
    expect((await post('sue', CURRENT_TERMS)).status).toBe(200);
    expect((await row('sue')).terms_version).toBe(CURRENT_TERMS.terms);
  });
});

describe('termsAnswer', () => {
  it('is accepted only on both current versions, or when exempt', async () => {
    const { termsAnswer } = await import('./termsRoutes.ts');
    expect(termsAnswer(null, null, false).accepted).toBe(false);
    expect(termsAnswer(CURRENT_TERMS.terms, '0.1', false).accepted).toBe(false);
    expect(termsAnswer(CURRENT_TERMS.terms, CURRENT_TERMS.privacy, false).accepted).toBe(true);
    expect(termsAnswer(null, null, true).accepted).toBe(true);
  });
});
