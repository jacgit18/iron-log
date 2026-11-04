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
