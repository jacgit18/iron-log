import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { startTestDatabase } from './test/postgres.ts';

// Brief supplement-barcode-search, PR B: a UPC in supplement_upcs answers the exact catalog listing before any outside lookup.
let db: Kysely<DB>; let stop: () => Promise<void>; let server: Server | undefined;
beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });
afterAll(async () => { await stop?.(); });

const LIVE = '00074306800046', RETIRED = '00031604026509', MISSING = '04006381333931';
beforeEach(async () => {
  await db.deleteFrom('supplement_upcs').execute();
  await db.deleteFrom('catalog_items').execute();
  const row = (id: string, name: string, brand: string | null, retired: boolean) => ({ id, kind: 'supplement', source: 'dsld', license: 'test', name, brand, data: JSON.stringify({ form: 'Softgel', entryYear: 2024 }), retired_at: retired ? new Date() : null });
  await db.insertInto('catalog_items').values([row('c:dsld:1', 'Omega-3', 'Thorne', false), row('c:dsld:2', 'Old Fish Oil', 'Thorne', true)]).execute();
  await db.insertInto('supplement_upcs').values([{ upc: LIVE, catalog_id: 'c:dsld:1' }, { upc: RETIRED, catalog_id: 'c:dsld:2' }]).execute();
});

async function get(code: string, deps: { key?: string; fetch?: typeof fetch } = {}) {
  server = createApp({ db, foods: deps, admins: new Set() }).listen(0);
  await new Promise(done => server!.once('listening', done));
  return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/supplement-barcode/${code}`, { headers: { 'x-dev-user': 'u1' } });
}

describe('GET /api/supplement-barcode/:gtin with the UPC table', () => {
  it('answers the exact catalog listing for a known UPC, with no outside lookup and no key needed', async () => {
    const ask = vi.fn();
    const res = await get('074306800046', { fetch: ask as unknown as typeof fetch });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ ok: true, name: 'Omega-3', brand: 'Thorne', listing: { id: 'c:dsld:1', name: 'Omega-3', brand: 'Thorne', data: { form: 'Softgel', entryYear: 2024 } } });
    expect(ask).not.toHaveBeenCalled();
  });
  it('goes on to the name lookup for a UPC that is not in the table, or whose row is retired', async () => {
    const ask = vi.fn(async () => new Response(JSON.stringify({ foods: [] }), { status: 200 }));
    for (const code of [MISSING, RETIRED]) {
      const res = await get(code, { key: 'K', fetch: ask as unknown as typeof fetch });
      expect(res.status).toBe(404);
      expect((await res.json() as { why: string }).why).toBe('not-found');
    }
    expect(ask).toHaveBeenCalledTimes(2);
  });
  it('still answers 503 no-key for a miss when there is no key', async () => {
    const res = await get(MISSING);
    expect(res.status).toBe(503);
  });
});
