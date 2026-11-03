import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// A label photo is a few hundred kB of base64, far over the app-wide 100 kb JSON limit, so /api/scan/label must skip that parser the way import-legacy does
// and use its own 2 MB one after sign-in, the admin check and the per-user limit. scan.test.ts mounts the router alone and cannot see the app-wide parser.
let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server;
let base: string;
const model = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"kcal":120,"p":4,"lines":[{"text":"EGGS","total":500,"match":"eggs"}]}' }] }), { status: 200 });

beforeAll(async () => {
  ({ db, stop } = await startTestDatabase());
  server = createApp({ db, admins: new Set(['dev:boss']), scan: { key: 'k', fetch: model as unknown as typeof fetch } }).listen(0);
  await new Promise(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()));
  await stop?.();
});

const photo = (chars: number) => JSON.stringify({ image: '/9j/' + 'A'.repeat(chars - 4) });
const receiptPhoto = (chars: number) => JSON.stringify({ image: '/9j/' + 'A'.repeat(chars - 4), items: [{ id: 'eggs', n: 'Eggs' }] });
const post = (body: string, user?: string, path = 'label') =>
  fetch(`${base}/api/scan/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': 'test-1', ...(user ? { 'x-dev-user': user } : {}) }, body });

describe('POST /api/scan/label through the whole app', () => {
  it('reads a 500 kB photo from an admin (over the 100 kb app limit)', async () => {
    const body = photo(500_000);
    expect(body.length).toBeGreaterThan(100_000);
    const res = await post(body, 'boss');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: { kind: 'ok', label: { kcal: 120, p: 4 } } });
  });
  it('still refuses a body over its own 2 MB limit', async () => {
    expect((await post(photo(2_200_000), 'boss')).status).toBe(413);
  });
  it('gives an anonymous caller 401 and a non-admin 403, with no parser run for either', async () => {
    expect((await post(photo(500_000))).status).toBe(401);
    expect((await post(photo(500_000), 'plain')).status).toBe(403);
  });

  it('reads a 1 MB receipt photo from an admin through the whole app, refuses over 5 MB, and keeps anonymous and non-admin out', async () => {
    const body = receiptPhoto(1_000_000);
    expect(body.length).toBeGreaterThan(100_000);
    const res = await post(body, 'boss', 'receipt');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: { kind: 'ok' } });
    expect((await post(receiptPhoto(5_400_000), 'boss', 'receipt')).status).toBe(413);
    expect((await post(body, undefined, 'receipt')).status).toBe(401);
    expect((await post(body, 'plain', 'receipt')).status).toBe(403);
  });
});
