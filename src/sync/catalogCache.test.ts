import { afterEach, describe, it, expect } from 'vitest';
import { loadCatalog, forgetCatalogs } from './catalogCache.js';

const none = () => ({});
const counting = (status: number, items: unknown[] = []) => {
  const calls: string[] = [];
  const doFetch = (async (url: string) => { calls.push(url); return new Response(JSON.stringify({ items }), { status, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
  return { calls, doFetch };
};

afterEach(forgetCatalogs);

describe('loadCatalog', () => {
  it('fetches each kind once and shares the answer, even for two pickers asking at the same time', async () => {
    const f = counting(200, [{ id: 'c:fedb:A', name: 'A', data: {} }]);
    const [a, b] = await Promise.all([loadCatalog('exercise', none, f.doFetch), loadCatalog('exercise', none, f.doFetch)]);
    expect(a).toEqual({ ok: true, items: [{ id: 'c:fedb:A', name: 'A', data: {} }] });
    expect(b).toBe(a);
    await loadCatalog('exercise', none, f.doFetch);
    await loadCatalog('stretch', none, f.doFetch);
    expect(f.calls).toEqual(['/api/catalog?kind=exercise', '/api/catalog?kind=stretch']);
  });
  it('does not keep a failure, so the next picker asks again', async () => {
    const bad = counting(500);
    expect(await loadCatalog('stretch', none, bad.doFetch)).toEqual({ ok: false, reason: 'unreachable' });
    const good = counting(200, []);
    expect(await loadCatalog('stretch', none, good.doFetch)).toEqual({ ok: true, items: [] });
    expect(good.calls).toHaveLength(1);
  });
});
