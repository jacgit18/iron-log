import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAILY_MAX, foodRoutes, type FoodDeps } from './foodSearch.ts';

let server: Server | undefined;
afterEach(() => new Promise<void>(done => (server ? server.close(() => done()) : done())));

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
    expect(JSON.parse(text)).toEqual({ ok: true, hits: [{ id: 1, name: 'Chicken breast, raw', kcal: 120, p: 22.5 }] });
    expect(text).not.toContain('SECRET');
    const url = new URL(String((ask.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('query')).toBe('chicken breast');
    expect(url.searchParams.get('api_key')).toBe('SECRET');
    expect(url.searchParams.get('dataType')).toBe('Foundation,SR Legacy,Branded');
  });

  it('refuses a missing or short query without asking USDA', async () => {
    const ask = vi.fn();
    const base = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    for (const q of ['', '?q=', '?q=a', `?q=${'x'.repeat(61)}`]) expect((await fetch(base + (q.startsWith('?') ? q : ''))).status).toBe(422);
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers 503 when no key is set', async () => {
    const res = await fetch(`${await start({})}?q=oats`);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/not available/);
  });

  it('answers 503, without the key, when USDA fails, is slow or sends junk', async () => {
    for (const ask of [async () => reply({}, 500), async () => { throw new DOMException('timed out', 'TimeoutError'); }, async () => new Response('<html>', { status: 200 })]) {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const res = await fetch(`${await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch })}?q=oats`);
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain('SECRET');
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
    expect(ask).toHaveBeenCalledTimes(1);
    t += 61 * 60_000;
    await fetch(`${base}?q=oats`);
    expect(ask).toHaveBeenCalledTimes(2);
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
