import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createDb } from './db/connection.ts';
import type { DB } from './db/types.ts';
import { MAX_NOTE, MAX_PHOTO_BASE64, MAX_RECEIPTS, MAX_TOTAL_BYTES, cleanNote, cleanReceipt } from './receipts.ts';
import { startTestDatabase } from './test/postgres.ts';

// Saved receipt photos (brief receipt-save-photo): validation, the cap, whose rows, the headers, and erase.
// `db` is the owner connection (sets up and inspects); `app` is the restricted role the API runs as, so row-level security is really in force.
let db: Kysely<DB>;
let app: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;
beforeAll(async () => { let appUrl: string; ({ db, stop, appUrl } = await startTestDatabase()); app = createDb(appUrl); }, 120_000);
afterAll(async () => { await app.destroy(); await stop?.(); });
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
beforeEach(async () => { await sql`delete from receipts`.execute(db); await sql`delete from users`.execute(db); });

// The route checks the type (the base64 starts the way a JPEG does) and the size, not that it decodes as a picture.
const jpeg = (chars = 400) => '/9j/' + 'A'.repeat(chars - 4);
const good = (extra: Record<string, unknown> = {}) => ({ image: jpeg(), month: '2026-11', store: "BJ's", receiptDate: '2026-11-02', totalCents: 14231, ...extra });

async function start(options: Parameters<typeof createApp>[0] = {}) {
  server = createApp({ db: app, admins: new Set(['dev:boss', 'dev:other']), ...options }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (who: string | null, method: string, path: string, body?: unknown) =>
    fetch(`${base}/api/receipts${path}`, { method, headers: { 'x-client-version': 'test-1', ...(who ? { 'x-dev-user': who } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  return { base, call };
}
/** A response body read as loosely typed JSON (the tests check the fields they care about). */
type Json = Record<string, any>; // oxlint-disable-line no-explicit-any
const body = async (r: Response): Promise<Json> => (await r.json()) as Json;
const idOf = async (name: string) => String((await sql<{ id: string }>`select id from users where auth_user_id = ${'dev:' + name}`.execute(db)).rows[0]!.id);
const count = async (name?: string) => Number((await sql<{ n: string }>`select count(*) as n from receipts ${name ? sql`where user_id = ${await idOf(name)}` : sql``}`.execute(db)).rows[0]!.n);

describe('cleanReceipt', () => {
  it('takes a JPEG with a month and the optional fields', () => {
    const r = cleanReceipt(good());
    expect(r.ok && r.value).toMatchObject({ month: '2026-11', store: "BJ's", receiptDate: '2026-11-02', totalCents: 14231, note: '' });
  });
  it('leaves the date, total and store out', () => {
    const r = cleanReceipt({ image: jpeg(), month: '2026-11' });
    expect(r.ok && r.value).toMatchObject({ receiptDate: null, totalCents: null, store: '' });
  });
  it('refuses anything that is not one JPEG, or has an out-of-range field', () => {
    const bad: unknown[] = [
      null, 'x', {}, good({ image: 'iVBO' + 'A'.repeat(396) }), good({ image: '/9j/' + 'A'.repeat(MAX_PHOTO_BASE64) }), good({ image: 5 }),
      good({ month: '2026-13' }), good({ month: 'Nov' }), good({ month: undefined }), good({ receiptDate: '2026-02-30' }), good({ receiptDate: '1969-12-31' }), good({ receiptDate: 'today' }),
      good({ totalCents: -1 }), good({ totalCents: 1.5 }), good({ totalCents: 10_000_001 }), good({ totalCents: '5' }), good({ store: 'x'.repeat(61) }), good({ store: 'a\nb' }), good({ note: 'x'.repeat(MAX_NOTE + 1) }), good({ note: 5 }),
    ];
    for (const b of bad) expect(cleanReceipt(b).ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
  });
  it('keeps the decoded bytes, which start like a JPEG', () => {
    const r = cleanReceipt(good());
    expect(r.ok && r.value.photo.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  });
  it('trims the note and treats a missing one as empty', () => {
    expect(cleanNote('  milk  ')).toBe('milk');
    expect(cleanNote(undefined)).toBe('');
    expect(cleanNote('x'.repeat(MAX_NOTE))).toHaveLength(MAX_NOTE);
    expect(cleanNote('x'.repeat(MAX_NOTE + 1))).toBeNull();
  });
});

describe('/api/receipts', () => {
  it('saves, lists newest first, serves the photo with private headers, edits the note and deletes', async () => {
    const { call } = await start();
    const a = await call('boss', 'POST', '', good({ store: 'First' }));
    expect(a.status).toBe(201);
    expect(a.headers.get('cache-control')).toBe('private, no-store');
    const first = (await body(a)).receipt as { id: string; sizeBytes: number };
    expect(first.sizeBytes).toBeGreaterThan(0);
    await call('boss', 'POST', '', good({ store: 'Second' }));
    const list = await body(await call('boss', 'GET', ''));
    expect(list).toMatchObject({ ok: true, count: 2, maxReceipts: MAX_RECEIPTS, maxBytes: MAX_TOTAL_BYTES });
    expect(list.receipts.map((r: { store: string }) => r.store)).toEqual(['Second', 'First']);
    expect(list.receipts[0]).toMatchObject({ month: '2026-11', receiptDate: '2026-11-02', totalCents: 14231, note: '' });
    expect(JSON.stringify(list)).not.toContain('/9j/');

    const photo = await call('boss', 'GET', `/${first.id}/photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/jpeg');
    expect(photo.headers.get('cache-control')).toBe('private, no-store');
    expect(photo.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await photo.arrayBuffer()).subarray(0, 3).toString('hex')).toBe('ffd8ff');

    const edited = await call('boss', 'PATCH', `/${first.id}`, { note: 'for the fridge' });
    expect(edited.status).toBe(200);
    expect((await body(edited)).receipt.note).toBe('for the fridge');
    expect((await call('boss', 'PATCH', `/${first.id}`, { note: 'x'.repeat(MAX_NOTE + 1) })).status).toBe(422);
    expect((await call('boss', 'PATCH', `/${first.id}`, {})).status).toBe(422);

    expect((await call('boss', 'DELETE', `/${first.id}`)).status).toBe(200);
    expect((await call('boss', 'DELETE', `/${first.id}`)).status).toBe(404);
    expect(await count()).toBe(1);
  });

  it('keeps a receipt with no date, total or store', async () => {
    const { call } = await start();
    const res = await call('boss', 'POST', '', { image: jpeg(), month: '2026-11' });
    expect(res.status).toBe(201);
    expect((await body(res)).receipt).toMatchObject({ receiptDate: null, totalCents: null, store: '' });
  });

  it('answers 401 with no session, lets any signed-in account in (released to everyone 2026-11-10), 422 for a bad body, 404 for an odd id', async () => {
    const { call } = await start();
    for (const [m, p] of [['GET', ''], ['POST', ''], ['GET', '/1/photo'], ['PATCH', '/1'], ['DELETE', '/1']] as const) {
      expect((await call(null, m, p, m === 'GET' || m === 'DELETE' ? undefined : {})).status, `${m} ${p} anonymous`).toBe(401);
    }
    expect((await call('plain', 'GET', '')).status).toBe(200); // not an admin, and not refused
    expect((await call('plain', 'GET', '/1/photo')).status).toBe(404); // another account's id, or none: the same answer
    expect(await count()).toBe(0);
    expect((await call('boss', 'POST', '', { image: 'nope', month: '2026-11' })).status).toBe(422);
    expect((await call('boss', 'POST', '', good({ image: 'iVBO' + 'A'.repeat(396) }))).status).toBe(422);
    for (const id of ['abc', '1e3', '-1', '9'.repeat(20)]) {
      expect((await call('boss', 'GET', `/${id}/photo`)).status).toBe(404);
      expect((await call('boss', 'DELETE', `/${id}`)).status).toBe(404);
    }
  });

  it('shows and changes only the caller\'s own rows (another account\'s id answers 404)', async () => {
    const { call } = await start();
    const mine = ((await body(await call('boss', 'POST', '', good()))).receipt as { id: string }).id;
    await call('other', 'GET', '');
    expect((await body(await call('other', 'GET', ''))).count).toBe(0);
    expect((await call('other', 'GET', `/${mine}/photo`)).status).toBe(404);
    expect((await call('other', 'PATCH', `/${mine}`, { note: 'mine now' })).status).toBe(404);
    expect((await call('other', 'DELETE', `/${mine}`)).status).toBe(404);
    expect(await count('boss')).toBe(1);
    expect((await call('boss', 'GET', `/${mine}/photo`)).status).toBe(200);
  });

  it('refuses a save at 200 receipts and at 60 MB with 409 and a plain message, and deleting makes room', async () => {
    const { call } = await start();
    await call('boss', 'GET', '');
    const uid = await idOf('boss');
    await sql`insert into receipts (user_id, month, size_bytes, data) select ${uid}::bigint, '2026-10', 10, '\x01'::bytea from generate_series(1, ${MAX_RECEIPTS - 1})`.execute(db);
    expect((await call('boss', 'POST', '', good())).status).toBe(201);
    const full = await call('boss', 'POST', '', good());
    expect(full.status).toBe(409);
    expect(await body(full)).toMatchObject({ ok: false, why: 'cap', error: expect.stringContaining('Delete some') });
    expect(await count('boss')).toBe(MAX_RECEIPTS);
    const first = (await body(await call('boss', 'GET', ''))).receipts[0] as { id: string };
    expect((await call('boss', 'DELETE', `/${first.id}`)).status).toBe(200);
    expect((await call('boss', 'POST', '', good())).status).toBe(201);

    await sql`delete from receipts`.execute(db);
    // Sixty near-full photos' worth of size on a few rows: the byte cap, not the count.
    await sql`insert into receipts (user_id, month, size_bytes, data) select ${uid}::bigint, '2026-10', 1048576, '\x01'::bytea from generate_series(1, 60)`.execute(db);
    expect((await call('boss', 'POST', '', good())).status).toBe(409);
  });

  it('keeps the cap per account', async () => {
    const { call } = await start();
    await call('other', 'GET', '');
    await call('boss', 'GET', '');
    const uid = await idOf('boss');
    await sql`insert into receipts (user_id, month, size_bytes, data) select ${uid}::bigint, '2026-10', 10, '\x01'::bytea from generate_series(1, ${MAX_RECEIPTS})`.execute(db);
    expect((await call('other', 'POST', '', good())).status).toBe(201);
  });

  it('is rate limited per user', async () => {
    const { call } = await start({ limits: { receipts: { max: 3, windowMs: 60_000 } } });
    for (let i = 0; i < 3; i++) expect((await call('boss', 'GET', '')).status).toBe(200);
    expect((await call('boss', 'GET', '')).status).toBe(429);
    expect((await call('other', 'GET', '')).status).toBe(200);
  });

  it('is removed by Erase all my data and by deleting the account', async () => {
    const { call, base } = await start();
    await call('boss', 'POST', '', good());
    await call('other', 'POST', '', good());
    const erase = await fetch(`${base}/api/account/erase-data`, { method: 'POST', headers: { 'x-dev-user': 'boss', 'x-client-version': 'test-1', 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'ERASE' }) });
    expect(erase.status, await erase.clone().text()).toBe(200);
    expect(await count('boss')).toBe(0);
    expect(await count('other')).toBe(1);
    await sql`delete from users where auth_user_id = ${'dev:other'}`.execute(db);
    expect(await count()).toBe(0);
  });
});
