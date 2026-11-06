import { describe, expect, it, vi } from 'vitest';
import { askOpenFoods } from './openFoodFacts.ts';

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const PRODUCT = { status: 1, product: { code: '4099100063851', product_name: 'Woven Whole Wheat Crackers', brands: 'Aldi', serving_quantity: 28, nutriments: { 'energy-kcal_100g': 428.6, proteins_100g: 7.1 } } };
const GTIN = '04099100063851';

describe('askOpenFoods', () => {
  it('asks for the 14-digit code with the contact in the User-Agent and answers the product', async () => {
    const ask = vi.fn(async () => ok(PRODUCT));
    const hit = await askOpenFoods(GTIN, { contact: 'owner@example.test', fetch: ask as unknown as typeof fetch, timeoutMs: 1000 });
    expect(hit).toMatchObject({ name: 'Woven Whole Wheat Crackers', brand: 'Aldi', source: 'off' });
    const [url, init] = ask.mock.calls[0] as unknown as [URL, { headers: Record<string, string> }];
    expect(url.pathname).toBe(`/api/v2/product/${GTIN}.json`);
    expect(init.headers['user-agent']).toBe('Loadbearer/1.0 (owner@example.test)');
  });

  it('answers null for an unknown code, whether it comes as a 404 or a 200 with status 0', async () => {
    for (const res of [ok({ status: 0 }, 200), ok({ status: 0 }, 404)]) {
      expect(await askOpenFoods(GTIN, { contact: 'a@b.test', fetch: (async () => res) as unknown as typeof fetch, timeoutMs: 1000 })).toBeNull();
    }
  });

  it('throws on a refusal, a server error, a timeout and a network failure', async () => {
    for (const fail of [async () => ok({}, 429), async () => ok({}, 503), async () => { throw new DOMException('t', 'TimeoutError'); }]) {
      await expect(askOpenFoods(GTIN, { contact: 'a@b.test', fetch: fail as unknown as typeof fetch, timeoutMs: 1000 })).rejects.toBeDefined();
    }
  });
});
