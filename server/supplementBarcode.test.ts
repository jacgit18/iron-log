import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAILY_MAX, type FoodDeps } from './foodSearch.ts';
import { supplementBarcodeRoutes } from './supplementBarcode.ts';

let server: Server | undefined;
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });

const CODE = '074306800046';
const GTIN = '00074306800046';
// A vitamin: no calories, no protein (the food barcode route would drop it).
const usda = { foods: [
  { fdcId: 1, description: 'GREEN VIBRANCE DRINK', gtinUpc: '00074306800099', brandOwner: 'Other' },
  { fdcId: 2, description: '  GREEN   VIBRANCE ', gtinUpc: GTIN, brandOwner: 'Vibrant Health', foodNutrients: [{ nutrientNumber: '208', value: 0 }] },
] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function start(deps: FoodDeps, user = 'u1') {
  const app = express();
  app.use((_req, res, next) => { res.locals.userId = user; next(); });
  app.use('/api/supplement-barcode', supplementBarcodeRoutes(deps));
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/supplement-barcode`;
}

describe('GET /api/supplement-barcode/:gtin', () => {
  it('answers with the name and brand of the product whose own code is exactly the scanned one, even with no calories', async () => {
    const ask = vi.fn(async () => reply(usda));
    const res = await fetch(`${await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch })}/${CODE}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, name: 'GREEN VIBRANCE', brand: 'Vibrant Health' });
    expect(text).not.toContain('SECRET');
    const url = new URL(String((ask.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('query')).toBe(GTIN);
    expect(url.searchParams.get('dataType')).toBe('Branded');
  });

  it('refuses what is not a product barcode before asking anyone', async () => {
    const ask = vi.fn(async () => reply(usda));
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    for (const bad of ['abc', '12345', '074306800047', '0743068000461234567']) expect((await fetch(`${base}/${bad}`)).status, bad).toBe(422);
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers 503 with why no-key when the key is not set', async () => {
    const res = await fetch(`${await start({})}/${CODE}`);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { why: string }).why).toBe('no-key');
  });

  it('answers 404 when no product has that exact code', async () => {
    const ask = vi.fn(async () => reply({ foods: [usda.foods[0]] }));
    const res = await fetch(`${await start({ key: 'k', fetch: ask as unknown as typeof fetch })}/${CODE}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { why: string }).why).toBe('not-found');
  });

  it('asks Open Food Facts for the name after a USDA miss, and uses a name with no brand', async () => {
    const ask = vi.fn(async (u: URL | string) => (String(u).includes('openfoodfacts') ? reply({ status: 1, product: { product_name: 'Amino Energy', brands: 'Optimum Nutrition, ON' } }) : reply({ foods: [] })));
    const res = await fetch(`${await start({ key: 'k', offContact: 'me@example.com', fetch: ask as unknown as typeof fetch })}/${CODE}`);
    expect(await res.json()).toEqual({ ok: true, name: 'Amino Energy', brand: 'Optimum Nutrition' });
    const off = new URL(String((ask.mock.calls[1] as unknown[])[0]));
    expect(off.searchParams.get('fields')).toBe('code,product_name,brands');
  });

  it('is "unavailable", not "not found", and holds nothing, when Open Food Facts cannot be asked after a USDA miss', async () => {
    const ask = vi.fn(async (u: URL | string) => (String(u).includes('openfoodfacts') ? reply({}, 500) : reply({ foods: [] })));
    const base = await start({ key: 'k', offContact: 'me@example.com', fetch: ask as unknown as typeof fetch });
    expect((await fetch(`${base}/${CODE}`)).status).toBe(503);
    expect((await fetch(`${base}/${CODE}`)).status).toBe(503);
    expect(ask).toHaveBeenCalledTimes(4); // asked again each time
  });

  it('holds an answer for a repeat scan and never logs the code or the key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ask = vi.fn(async () => reply(usda));
    const base = await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch });
    await fetch(`${base}/${CODE}`); await fetch(`${base}/${CODE}`);
    expect(ask).toHaveBeenCalledTimes(1);
    const bad = vi.fn(async () => reply({}, 500));
    const res = await fetch(`${await start({ key: 'SECRET', fetch: bad as unknown as typeof fetch })}/${CODE}`);
    expect(res.status).toBe(503);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET|74306800046/);
  });

  it('answers 429 past the daily cap, counting held answers too', async () => {
    const ask = vi.fn(async () => reply(usda));
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    for (let i = 0; i < DAILY_MAX; i++) expect((await fetch(`${base}/${CODE}`)).status).toBe(200);
    const over = await fetch(`${base}/${CODE}`);
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toBeTruthy();
  });
});
