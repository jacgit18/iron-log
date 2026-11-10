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
    expect(await res.json()).toMatchObject({ ok: true, result: { kind: 'ok', label: { kcal: 120, p: 4 } } });
  });
  it('still refuses a body over its own 2 MB limit', async () => {
    expect((await post(photo(2_200_000), 'boss')).status).toBe(413);
  });
  it('gives an anonymous caller 401 and reads a plain signed-in account (open to everyone since 2026-11-08), with no parser run for the anonymous one', async () => {
    expect((await post(photo(500_000))).status).toBe(401);
    expect((await post(photo(500_000), 'plain')).status).toBe(200);
  });

  it('reads a 1 MB receipt photo from an admin through the whole app, refuses over 5 MB, and keeps anonymous out', async () => {
    const body = receiptPhoto(1_000_000);
    expect(body.length).toBeGreaterThan(100_000);
    const res = await post(body, 'boss', 'receipt');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: { kind: 'ok' } });
    expect((await post(receiptPhoto(5_400_000), 'boss', 'receipt')).status).toBe(413);
    expect((await post(body, undefined, 'receipt')).status).toBe(401);
    expect((await post(body, 'plain', 'receipt')).status).toBe(200);
  });
});

describe('POST /api/receipts through the whole app', () => {
  const save = (body: string, user?: string) =>
    fetch(`${base}/api/receipts`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': 'test-1', ...(user ? { 'x-dev-user': user } : {}) }, body });
  // A real (tiny) JPEG start padded with base64 zeros: the route checks the type and size, not that it decodes as a picture.
  const jpeg = (chars: number) => '/9j/' + 'A'.repeat(chars - 4);
  const body = (chars: number) => JSON.stringify({ image: jpeg(chars), month: '2026-11' });

  it('keeps a 900 kB photo from any signed-in account (over the 100 kb app limit), refuses over its own 2 MB limit, and keeps anonymous out', async () => {
    const ok = body(900_000);
    expect(ok.length).toBeGreaterThan(100_000);
    const res = await save(ok, 'boss');
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, receipt: { month: '2026-11' } });
    expect((await save(body(2_200_000), 'boss')).status).toBe(413);
    expect((await save(ok)).status).toBe(401);
    expect((await save(ok, 'plain')).status).toBe(201); // released to everyone 2026-11-10: a non-admin account may keep a receipt
  });
  it('still holds every other receipts call to the 100 kb parser', async () => {
    const big = JSON.stringify({ note: 'x'.repeat(150_000) });
    const res = await fetch(`${base}/api/receipts/1`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-client-version': 'test-1', 'x-dev-user': 'boss' }, body: big });
    expect(res.status).toBe(413);
  });
});

