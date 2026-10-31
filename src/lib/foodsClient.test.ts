import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOODS_FAILURE_TEXT, searchFoods } from './foodsClient.js';

// The phone's side of the food search (brief diet-food-lookup): what is asked, how an answer is read, and each way it can fail. Every failure is a reason, never a throw.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('searchFoods', () => {
  it('asks our own route with the words percent-encoded, and returns the foods', async () => {
    const ask = answer(200, { ok: true, hits: [{ id: 1, name: 'Rice', kcal: 130, p: 2.7 }] });
    vi.stubGlobal('fetch', ask);
    const r = await searchFoods('brown rice & beans');
    expect(r).toEqual({ ok: true, hits: [{ id: 1, name: 'Rice', kcal: 130, p: 2.7 }] });
    const [url] = ask.mock.calls[0] as unknown as [string];
    expect(url).toBe('/api/foods/search?q=brown%20rice%20%26%20beans');
  });
  it('drops hits that fail the check, so a bad answer cannot reach the form', async () => {
    vi.stubGlobal('fetch', answer(200, { ok: true, hits: [{ id: 1, name: 'Bad', kcal: -5, p: 1 }, { id: 2, name: 'Good', kcal: 50, p: 1 }] }));
    expect(await searchFoods('good')).toEqual({ ok: true, hits: [{ id: 2, name: 'Good', kcal: 50, p: 1 }] });
  });
  it('says limit on 429, unavailable on other errors and unreadable answers, offline when there is no network', async () => {
    vi.stubGlobal('fetch', answer(429)); expect(await searchFoods('rice')).toEqual({ ok: false, reason: 'limit' });
    vi.stubGlobal('fetch', answer(503)); expect(await searchFoods('rice')).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', answer(200, '<html>')); expect(await searchFoods('rice')).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); })); expect(await searchFoods('rice')).toEqual({ ok: false, reason: 'offline' });
  });
  it('logs the real status and the server’s reason, so a missing key reads differently from a missing route', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', answer(503, { ok: false, why: 'no-key' })); await searchFoods('rice');
    vi.stubGlobal('fetch', answer(404, '<html>')); await searchFoods('rice');
    vi.stubGlobal('fetch', answer(200, '<html>')); await searchFoods('rice');
    expect(warn.mock.calls.map(c => c[0])).toEqual([
      'food search unavailable: status 503, no-key',
      'food search unavailable: status 404, unreadable',
      'food search unavailable: status 200, unreadable',
    ]);
  });
  it('has words for every reason', () => {
    for (const reason of ['offline', 'limit', 'unavailable'] as const) expect(FOODS_FAILURE_TEXT[reason]).toMatch(/type the numbers/);
  });
});
