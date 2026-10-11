import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

let db: Kysely<DB>;
let stop: () => Promise<void>;
let server: Server | undefined;

beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));
afterAll(async () => { await stop?.(); });

beforeEach(async () => {
  await db.deleteFrom('catalog_items').execute();
  const row = (id: string, kind: string, name: string, extra: object = {}) => ({ id, kind, source: 'fedb', license: 'Unlicense', name, data: JSON.stringify({ eq: 'barbell', instructions: ['Long text.'] }), ...extra });
  await db.insertInto('catalog_items').values([
    row('c:fedb:Squat', 'exercise', 'squat'),
    row('c:fedb:Bench', 'exercise', 'Bench Press'),
    row('c:fedb:Old', 'exercise', 'Retired One', { retired_at: '2026-10-01T00:00:00Z' }),
    row('c:fedb:Calf', 'stretch', 'Calf Stretch'),
  ]).execute();
});

async function start() {
  server = createApp({ db, admins: new Set(['dev:owner']) }).listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const get = async (base: string, query: string, user = 'owner') => fetch(`${base}/api/catalog${query}`, { headers: { 'x-dev-user': user } });

describe('GET /api/catalog', () => {
  it('lists the live rows of one kind in name order, without instructions', async () => {
    const res = await get(await start(), '?kind=exercise');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(await res.json()).toEqual({ ok: true, items: [
      { id: 'c:fedb:Bench', name: 'Bench Press', data: { eq: 'barbell' } },
      { id: 'c:fedb:Squat', name: 'squat', data: { eq: 'barbell' } },
    ] });
    expect(((await (await get(await start(), '?kind=stretch')).json()) as { items: { id: string }[] }).items.map(i => i.id)).toEqual(['c:fedb:Calf']);
  });

  // fetch adds `Cache-Control: no-cache` to a hand-made conditional request, which forces a full answer; a browser revalidates with max-age=0.
  it('answers a repeat with the same ETag as 304', async () => {
    const base = await start();
    const etag = (await get(base, '?kind=exercise')).headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await fetch(`${base}/api/catalog?kind=exercise`, { headers: { 'x-dev-user': 'owner', 'if-none-match': etag!, 'cache-control': 'max-age=0' } });
    expect(again.status).toBe(304);
  });

  it('is for admins only while the feature is admin-only, and needs a sign-in', async () => {
    const base = await start();
    expect((await get(base, '?kind=exercise', 'guest')).status).toBe(403);
    expect((await fetch(`${base}/api/catalog?kind=exercise`)).status).toBe(401);
  });

  it('refuses a kind it does not list (supplements are searched, not listed)', async () => {
    const base = await start();
    for (const q of ['', '?kind=supplement', '?kind=x', '?kind[]=exercise']) expect((await get(base, q)).status).toBe(400);
  });
});
