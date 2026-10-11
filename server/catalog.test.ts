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
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
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

  it('is for every signed-in account (released 2026-10-11), and needs a sign-in', async () => {
    const base = await start();
    expect((await get(base, '?kind=exercise', 'guest')).status).toBe(200);
    expect((await fetch(`${base}/api/catalog?kind=exercise`)).status).toBe(401);
  });

  it('refuses a kind it does not list (supplements are searched, not listed)', async () => {
    const base = await start();
    for (const q of ['', '?kind=supplement', '?kind=x', '?kind[]=exercise']) expect((await get(base, q)).status).toBe(400);
  });
});

describe('GET /api/catalog/search (supplements)', () => {
  beforeEach(async () => {
    const sup = (id: number, name: string, brand: string | null, extra: object = {}) => ({ id: `c:dsld:${id}`, kind: 'supplement', source: 'dsld', license: 'x', name, brand, data: JSON.stringify({ form: 'Powder' }), ...extra });
    await db.insertInto('catalog_items').values([
      sup(1, 'Creatine Monohydrate', 'Optimum Nutrition'),
      sup(2, 'Micronized Creatine', 'NOW Foods'),
      sup(3, 'Creatine', 'NOW Foods'),
      sup(4, 'Fish Oil', 'NOW Foods'),
      sup(5, '100% Whey', 'Acme'),
      sup(6, 'Creatine Old', 'Gone', { retired_at: '2026-10-01T00:00:00Z' }),
      ...Array.from({ length: 35 }, (_, i) => sup(100 + i, `Magnesium ${String(i).padStart(2, '0')}`, 'Bulk')),
    ]).execute();
  });
  const search = async (query: string, user = 'guest') => {
    const res = await fetch(`${await start()}/api/catalog/search${query}`, { headers: { 'x-dev-user': user } });
    return { status: res.status, body: (await res.json()) as { items: { id: string; name: string; brand?: string; data: object }[]; more: boolean } };
  };
  const ids = (r: { body: { items: { id: string }[] } }) => r.body.items.map(i => i.id);

  it('finds every word in the name or brand, names starting with the first word first, then shorter ones; retired rows left out', async () => {
    const r = await search('?kind=supplement&q=creatine');
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(['c:dsld:3', 'c:dsld:1', 'c:dsld:2']);
    expect(r.body.items[0]).toEqual({ id: 'c:dsld:3', name: 'Creatine', brand: 'NOW Foods', data: { form: 'Powder' } });
    expect(ids(await search('?kind=supplement&q=now%20CREATINE'))).toEqual(['c:dsld:3', 'c:dsld:2']);
    expect(ids(await search('?kind=supplement&q=now'))).toEqual(['c:dsld:3', 'c:dsld:4', 'c:dsld:2']);
  });

  it('pages 30 at a time and says when there is more', async () => {
    const first = await search('?kind=supplement&q=magnesium');
    expect(first.body.items).toHaveLength(30);
    expect(first.body.more).toBe(true);
    const second = await search('?kind=supplement&q=magnesium&offset=30');
    expect(second.body.items.map(i => i.name)).toEqual(['Magnesium 30', 'Magnesium 31', 'Magnesium 32', 'Magnesium 33', 'Magnesium 34']);
    expect(second.body.more).toBe(false);
  });

  it('takes % and _ literally', async () => {
    expect(ids(await search('?kind=supplement&q=100%25'))).toEqual(['c:dsld:5']);
    expect(ids(await search('?kind=supplement&q=%25%25'))).toEqual([]);
    expect(ids(await search('?kind=supplement&q=__'))).toEqual([]);
  });

  it('refuses a search it does not answer, and needs a sign-in', async () => {
    for (const q of ['?kind=supplement', '?kind=supplement&q=a', '?kind=exercise&q=squat', `?kind=supplement&q=${'x'.repeat(101)}`,
      '?kind=supplement&q=a%20b%20c%20d%20e%20f%20g', '?kind=supplement&q=fish&offset=-1', '?kind=supplement&q=fish&offset=601', '?kind=supplement&q[]=fish'])
      expect((await search(q)).status, q).toBe(400);
    expect((await fetch(`${await start()}/api/catalog/search?kind=supplement&q=fish`)).status).toBe(401);
  });
});
