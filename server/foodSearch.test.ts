import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAILY_MAX, foodRoutes, type FoodDeps } from './foodSearch.ts';

let server: Server | undefined;
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });

const usda = { foods: [{ fdcId: 1, description: 'Chicken breast, raw', foodNutrients: [{ nutrientNumber: '208', value: 120 }, { nutrientNumber: '203', value: 22.5 }] }, { fdcId: 2, description: 'No calories', foodNutrients: [] }] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function start(deps: FoodDeps, user = 'u1') {
  const app = express();
  app.use((_req, res, next) => { res.locals.userId = user; next(); });
  app.use('/api/foods', foodRoutes(deps));
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/foods/search`;
}

describe('GET /api/foods/search', () => {
  it('answers with the foods that have calories and protein, and asks USDA with the key', async () => {
    const ask = vi.fn(async () => reply(usda));
    const res = await fetch(`${await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch })}?q=chicken%20breast`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as { ok: boolean; hits: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.hits[0]).toEqual({ id: 1, name: 'Chicken breast, raw', kcal: 120, p: 22.5 }); // the stub answers both asks the same, so the food shows once from each
    expect(body.hits).toHaveLength(2);
    expect(text).not.toContain('SECRET');
    const urls = ask.mock.calls.map(c => new URL(String((c as unknown[])[0])));
    expect(urls.map(u => u.searchParams.get('dataType')).sort()).toEqual(['Branded', 'Foundation,SR Legacy']);
    for (const url of urls) { expect(url.searchParams.get('query')).toBe('chicken breast'); expect(url.searchParams.get('api_key')).toBe('SECRET'); }
  });

  describe('plain foods before store products', () => {
    const food = (id: number, name: string, brand?: string) => ({ fdcId: id, description: name, ...(brand ? { brandOwner: brand } : {}), foodNutrients: [{ nutrientNumber: '208', value: 100 }, { nutrientNumber: '203', value: 5 }] });
    const many = (from: number, n: number, brand?: string) => Array.from({ length: n }, (_, i) => food(from + i, `${brand ? 'Branded' : 'Plain'} ${i}`, brand));
    const answer = (plain: unknown, branded: unknown) => vi.fn(async (u: URL) => (String(u).includes('dataType=Branded') ? branded : plain) as Response);
    const names = async (ask: ReturnType<typeof answer>) => ((await (await fetch(`${await start({ key: 'k', fetch: ask as unknown as typeof fetch })}?q=egg`)).json()) as { hits: { name: string }[] }).hits.map(h => h.name);

    it('lists up to five plain foods first, then store products, eight in all', async () => {
      const list = await names(answer(reply({ foods: many(1, 10) }), reply({ foods: many(100, 10, 'Acme') })));
      expect(list).toEqual(['Plain 0', 'Plain 1', 'Plain 2', 'Plain 3', 'Plain 4', 'Branded 0', 'Branded 1', 'Branded 2']);
    });
    it('lets plain foods take the places store products leave', async () => {
      const list = await names(answer(reply({ foods: many(1, 10) }), reply({ foods: many(100, 2, 'Acme') })));
      expect(list).toHaveLength(8);
      expect(list.slice(0, 6)).toEqual(['Plain 0', 'Plain 1', 'Plain 2', 'Plain 3', 'Plain 4', 'Plain 5']);
    });
    it('still answers when only one of the two asks works', async () => {
      expect(await names(answer(reply({}, 500), reply({ foods: many(100, 3, 'Acme') })))).toEqual(['Branded 0', 'Branded 1', 'Branded 2']);
      expect(await names(answer(reply({ foods: many(1, 3) }), reply({}, 500)))).toEqual(['Plain 0', 'Plain 1', 'Plain 2']);
    });
  });

  it('refuses a missing or short query without asking USDA', async () => {
    const ask = vi.fn();
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    for (const q of ['', '?q=', '?q=a', `?q=${'x'.repeat(61)}`]) expect((await fetch(base + (q.startsWith('?') ? q : ''))).status).toBe(422);
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers 503 when no key is set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = await start({});
    const res = await fetch(`${base}?q=oats`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; why: string };
    expect(body.error).toMatch(/not available/);
    expect(body.why).toBe('no-key');
    await fetch(`${base}?q=rice`);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('USDA_API_KEY is not set'))).toHaveLength(1); // said once, not per search
    warn.mockRestore();
  });

  it('answers 503, without the key, when USDA fails, is slow or sends junk', async () => {
    for (const ask of [async () => reply({}, 500), async () => { throw new DOMException('timed out', 'TimeoutError'); }, async () => new Response('<html>', { status: 200 })]) {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const res = await fetch(`${await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch })}?q=oats`);
      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).not.toContain('SECRET');
      expect(JSON.parse(text).why).toBe('upstream');
      expect(warn.mock.calls.join(' ')).not.toContain('SECRET');
      warn.mockRestore();
      await new Promise<void>(done => server!.close(() => done()));
    }
  });

  it('holds an answer for an hour, then asks again', async () => {
    let t = 1_000_000;
    const ask = vi.fn(async () => reply(usda));
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch, now: () => t });
    await fetch(`${base}?q=Oats`); await fetch(`${base}?q=oats`);
    expect(ask).toHaveBeenCalledTimes(2); // one search is two asks (plain foods, store products); the repeat is held
    t += 61 * 60_000;
    await fetch(`${base}?q=oats`);
    expect(ask).toHaveBeenCalledTimes(4);
  });

  it('stops a person after the daily allowance, counts per person, and starts again the next day', async () => {
    let t = 5_000_000;
    const ask = vi.fn(async () => reply(usda));
    const deps: FoodDeps = { key: 'k', fetch: ask as unknown as typeof fetch, now: () => t };
    const base = await start(deps);
    for (let i = 0; i < DAILY_MAX; i++) expect((await fetch(`${base}?q=oats`)).status).toBe(200);
    const over = await fetch(`${base}?q=oats`);
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    t += 24 * 60 * 60_000 + 1;
    expect((await fetch(`${base}?q=oats`)).status).toBe(200);
  });
});
