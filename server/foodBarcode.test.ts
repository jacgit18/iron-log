import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { barcodeRoutes } from './foodBarcode.ts';
import { DAILY_MAX, type FoodDeps } from './foodSearch.ts';

let server: Server | undefined;
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });

const CODE = '016000275287';
const nutrients = [{ nutrientNumber: '208', value: 380 }, { nutrientNumber: '203', value: 10 }, { nutrientNumber: '205', value: 70 }, { nutrientNumber: '204', value: 6 }];
const usda = { foods: [
  { fdcId: 1, description: 'Cheerios Cheerios', gtinUpc: '00016000322622', foodNutrients: nutrients },
  { fdcId: 2, description: 'Cheerios Cereal', gtinUpc: '00016000275287', brandOwner: 'General Mills', servingSize: 28, servingSizeUnit: 'GRM', foodNutrients: nutrients },
] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function start(deps: FoodDeps, user = 'u1') {
  const app = express();
  app.use((_req, res, next) => { res.locals.userId = user; next(); });
  app.use('/api/foods/barcode', barcodeRoutes(deps));
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/foods/barcode`;
}

describe('GET /api/foods/barcode/:gtin', () => {
  it('asks USDA for the 14-digit code and answers with the product whose own code is exactly that', async () => {
    const ask = vi.fn(async () => reply(usda));
    const res = await fetch(`${await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch })}/${CODE}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, hit: { id: 2, name: 'Cheerios Cereal', brand: 'General Mills', kcal: 380, p: 10, c: 70, f: 6, serving: 28 } });
    expect(text).not.toContain('SECRET');
    expect(ask).toHaveBeenCalledTimes(1);
    const url = new URL(String((ask.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('query')).toBe('00016000275287');
    expect(url.searchParams.get('dataType')).toBe('Branded');
    expect(url.searchParams.get('api_key')).toBe('SECRET');
  });

  it('refuses what is not a product barcode before asking USDA', async () => {
    const ask = vi.fn(async () => reply(usda));
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    for (const bad of ['abc', '12345', '016000275288', '0160002752871234567']) expect((await fetch(`${base}/${bad}`)).status, bad).toBe(422);
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers 503 with why no-key when the key is not set', async () => {
    const res = await fetch(`${await start({})}/${CODE}`);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { why: string }).why).toBe('no-key');
  });

  it('answers 404 when no product has that exact code (a near match does not count)', async () => {
    const ask = vi.fn(async () => reply({ foods: [usda.foods[0]] }));
    const res = await fetch(`${await start({ key: 'k', fetch: ask as unknown as typeof fetch })}/${CODE}`);
    expect(res.status).toBe(404);
  });

  it('holds an answer, found or not, for an hour so a repeat scan does not ask USDA again', async () => {
    let t = 1_000_000;
    const ask = vi.fn(async () => reply(usda));
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch, now: () => t });
    await fetch(`${base}/${CODE}`); await fetch(`${base}/${CODE}`);
    expect(ask).toHaveBeenCalledTimes(1);
    t += 61 * 60_000;
    await fetch(`${base}/${CODE}`);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('answers 503 on a USDA failure, holds nothing, and logs neither the code nor the key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    const ask = vi.fn(async () => (n++ === 0 ? reply({}, 500) : reply(usda)));
    const base = await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch });
    const first = await fetch(`${base}/${CODE}`);
    expect(first.status).toBe(503);
    expect(((await first.json()) as { why: string }).why).toBe('upstream');
    expect((await fetch(`${base}/${CODE}`)).status).toBe(200); // not held: asked again
    const logged = warn.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('barcode lookup failed');
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('16000275287');
  });

  it('allows each person DAILY_MAX lookups a day, then answers 429 with Retry-After', async () => {
    const ask = vi.fn(async () => reply(usda));
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    for (let i = 0; i < DAILY_MAX; i++) expect((await fetch(`${base}/${CODE}`)).status).toBe(200);
    const over = await fetch(`${base}/${CODE}`);
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

// Open Food Facts after a USDA miss (brief barcode-coverage). One stub answers both hosts, by address.
describe('GET /api/foods/barcode/:gtin when USDA has no such product', () => {
  const OFF = { status: 1, product: { code: CODE, product_name: 'Woven Whole Wheat Crackers', brands: 'Aldi', serving_quantity: 28, nutriments: { 'energy-kcal_100g': 428.6, proteins_100g: 7.1, carbohydrates_100g: 71.4, fat_100g: 14.3 } } };
  const both = (off: () => Response | Promise<Response>) => vi.fn(async (u: URL | string) => (String(u).includes('openfoodfacts') ? off() : reply({ foods: [] })));
  const OFF_HIT = { id: 16000275287, name: 'Woven Whole Wheat Crackers', brand: 'Aldi', kcal: 428.6, p: 7.1, c: 71.4, f: 14.3, serving: 28, source: 'off' };

  it('asks Open Food Facts for the same 14-digit code with the contact in the User-Agent and answers its product with source off', async () => {
    const ask = both(() => reply(OFF));
    const res = await fetch(`${await start({ key: 'SECRET', offContact: 'owner@example.test', fetch: ask as unknown as typeof fetch })}/${CODE}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, hit: OFF_HIT });
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('owner@example.test');
    const off = ask.mock.calls.map(c => [new URL(String(c[0])), (c as unknown[])[1] as { headers: Record<string, string> }] as const).find(([u]) => u.host === 'world.openfoodfacts.org')!;
    expect(off[0].pathname).toBe('/api/v2/product/00016000275287.json');
    expect(off[1].headers['user-agent']).toBe('Loadbearer/1.0 (owner@example.test)');
    expect(off[0].toString()).not.toContain('SECRET'); // the USDA key never goes to the second source
  });

  it('does not ask Open Food Facts when USDA has the product, or when no contact is set', async () => {
    const found = vi.fn(async () => reply(usda));
    await fetch(`${await start({ key: 'k', offContact: 'a@b.test', fetch: found as unknown as typeof fetch })}/${CODE}`);
    expect(found).toHaveBeenCalledTimes(1);
    await new Promise<void>(done => server!.close(() => done()));
    const none = both(() => reply(OFF));
    const res = await fetch(`${await start({ key: 'k', fetch: none as unknown as typeof fetch })}/${CODE}`);
    expect(res.status).toBe(404);
    expect(none).toHaveBeenCalledTimes(1); // USDA only
  });

  it('answers 404 not-found when neither source has it, and holds that for an hour', async () => {
    const ask = both(() => reply({ status: 0 }));
    const base = await start({ key: 'k', offContact: 'a@b.test', fetch: ask as unknown as typeof fetch });
    const res = await fetch(`${base}/${CODE}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { why: string }).why).toBe('not-found');
    await fetch(`${base}/${CODE}`);
    expect(ask).toHaveBeenCalledTimes(2); // one USDA ask and one Open Food Facts ask, the repeat was held
  });

  it('holds a found Open Food Facts product too', async () => {
    const ask = both(() => reply(OFF));
    const base = await start({ key: 'k', offContact: 'a@b.test', fetch: ask as unknown as typeof fetch });
    await fetch(`${base}/${CODE}`); const again = await fetch(`${base}/${CODE}`);
    expect(((await again.json()) as { hit: { source: string } }).hit.source).toBe('off');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('ends as not-found when Open Food Facts cannot be asked (429, 5xx, timeout), holds nothing, and logs neither code, key nor contact', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    const ask = both(() => { n++; if (n === 1) return reply({}, 429); if (n === 2) throw new DOMException('t', 'TimeoutError'); return reply(OFF); });
    const base = await start({ key: 'SECRET', offContact: 'owner@example.test', fetch: ask as unknown as typeof fetch });
    expect((await fetch(`${base}/${CODE}`)).status).toBe(404);
    expect((await fetch(`${base}/${CODE}`)).status).toBe(404);
    expect((await fetch(`${base}/${CODE}`)).status).toBe(200); // not held: asked again and found
    const logged = warn.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('open food facts lookup failed');
    for (const secret of ['SECRET', 'owner@example.test', '16000275287']) expect(logged).not.toContain(secret);
  });
});
