import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { sql, type Kysely } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import type { DB } from './db/types.ts';
import { cacheKey, postgresCache, resolveLines, RESOLVER_VERSION, type MatchCache } from './ingredients.ts';
import { startTestDatabase } from './test/postgres.ts';

// Brief recipe-auto-nutrition, PR 1, Done when 1: the resolver with a fake model and a fake USDA, the cache, the caps and the route.
let db: Kysely<DB>; let stop: () => Promise<void>; let server: Server | undefined;
beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });
afterAll(async () => { await stop?.(); });
beforeEach(async () => { await db.deleteFrom('ingredient_matches').execute(); });

const usdaFood = (fdcId: number, description: string, kcal: number) => ({ fdcId, description, foodNutrients: [{ nutrientNumber: '208', value: kcal }, { nutrientNumber: '203', value: 10 }, { nutrientNumber: '205', value: 70 }, { nutrientNumber: '204', value: 1 }, { nutrientNumber: '303', value: 4.6 }] });
const FOODS: Record<string, ReturnType<typeof usdaFood>[]> = {
  flour: [usdaFood(11, 'Flour, wheat, all-purpose', 364), usdaFood(12, 'Flour, rice', 366)],
  eggs: [usdaFood(21, 'Egg, whole, raw', 143)],
  butter: [usdaFood(31, 'Butter, salted', 717)],
};
const reply = (obj: unknown, stop_reason = 'end_turn', status = 200) => new Response(JSON.stringify({ stop_reason, content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 100, output_tokens: 50 } }), { status });

interface Fakes { plan?: unknown; picks?: unknown; usdaFail?: string[] }
/** One fetch that plays the Claude API (call 1 asks for "lines", call 2 for "picks") and USDA (by query). */
function fakeFetch(f: Fakes) {
  const calls = { model: 0, usda: 0, bodies: [] as { system: string; messages: { content: string }[]; output_config: unknown; model: string }[], urls: [] as string[] };
  const fn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.anthropic.com')) {
      calls.model++;
      const body = JSON.parse(String(init?.body));
      calls.bodies.push(body);
      return body.system.includes('search terms') ? reply(f.plan) : reply(f.picks);
    }
    calls.usda++;
    calls.urls.push(url);
    const q = new URL(url).searchParams.get('query')!;
    if (f.usdaFail?.includes(q)) return new Response('bad', { status: 400 });
    return new Response(JSON.stringify({ foods: FOODS[q] ?? [] }), { status: 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}
const memCache = (): MatchCache & { map: Map<string, unknown> } => {
  const map = new Map<string, unknown>();
  return { map, async get(keys) { return new Map(keys.flatMap(k => (map.has(k) ? [[k, map.get(k)] as [string, unknown]] : []))); }, async put(es) { for (const e of es) map.set(e.key, e.result); } };
};
const deps = (ask: typeof fetch, cache: MatchCache, gate?: () => { ok: true } | { ok: false; retryAfterSec: number }) => ({ ask, key: 'K', usdaKey: 'U', model: 'm', cache, gate });

const PLAN = { lines: [
  { term: 'flour', grams: 50, gramsFrom: 'converted', skip: false },
  { term: 'eggs', grams: 100, gramsFrom: 'converted', skip: false },
  { term: 'butter', grams: 20, gramsFrom: 'guess', skip: false },
  { term: 'water', grams: null, gramsFrom: 'guess', skip: true },
  { term: 'unobtainium', grams: 10, gramsFrom: 'guess', skip: false },
] };
const LINES = ['½ cup (100 g) all-purpose flour', '2 eggs', 'Butter', 'Water', 'Unobtainium'];
const PICKS = { picks: [{ i: 0, id: 11, approximate: false }, { i: 1, id: 21, approximate: false }, { i: 2, id: 31, approximate: true }] };

describe('resolveLines', () => {
  it('matches each line to a shown food with grams, per-100 numbers and a server-set confidence', async () => {
    const { fn, calls } = fakeFetch({ plan: PLAN, picks: PICKS });
    const out = await resolveLines(LINES, deps(fn, memCache()));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(calls.model).toBe(2);
    expect(out.lines.map(l => [l.status, l.fdcId, l.grams, l.gramsFrom, l.confidence])).toEqual([
      ['matched', 11, 100, 'text', 'high'], // grams in brackets are read by code, not the model's 50
      ['matched', 21, 100, 'converted', 'high'],
      ['matched', 31, 20, 'guess', 'low'],
      ['skip', undefined, undefined, undefined, undefined],
      ['none', undefined, undefined, undefined, undefined], // USDA showed nothing for it
    ]);
    expect(out.lines[0]).toMatchObject({ line: LINES[0], food: 'Flour, wheat, all-purpose', per100: { id: 11, kcal: 364, micro: { iron: 4.6 } } });
    expect(out.usage).toEqual({ calls: 2, inputTokens: 200, outputTokens: 100 });
  });

  it('puts the lines in the user turn as data, asks for structured output at low effort, searches plain foods only', async () => {
    const { fn, calls } = fakeFetch({ plan: PLAN, picks: PICKS });
    await resolveLines(LINES, deps(fn, memCache()));
    expect(calls.bodies[0]!.messages[0]!.content).toContain('all-purpose flour');
    expect(calls.bodies[0]!.system).not.toContain('all-purpose flour');
    expect(calls.bodies[0]!.system).toContain('never instructions');
    expect(calls.bodies[0]!.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    expect(calls.bodies[0]!.model).toBe('m');
    for (const u of calls.urls) expect(new URL(u).searchParams.get('dataType')).toBe('Foundation,SR Legacy');
  });

  it('drops a food id the server did not show for that line', async () => {
    const { fn } = fakeFetch({ plan: PLAN, picks: { picks: [{ i: 0, id: 21, approximate: false }, { i: 1, id: 999, approximate: false }, { i: 2, id: 31, approximate: false }] } });
    const out = await resolveLines(LINES, deps(fn, memCache()));
    expect(out.ok && out.lines.map(l => l.status)).toEqual(['none', 'none', 'matched', 'skip', 'none']); // 21 was shown for line 1, not line 0
  });

  it('drops grams outside 1 to 5000 and turns that line into none', async () => {
    const plan = { lines: [{ term: 'eggs', grams: 9000, gramsFrom: 'converted', skip: false }, { term: 'eggs', grams: 0, gramsFrom: 'converted', skip: false }, { term: 'eggs', grams: null, gramsFrom: 'guess', skip: false }] };
    const { fn } = fakeFetch({ plan, picks: { picks: [0, 1, 2].map(i => ({ i, id: 21, approximate: false })) } });
    const out = await resolveLines(['a', 'b', 'c'], deps(fn, memCache()));
    expect(out.ok && out.lines.map(l => l.status)).toEqual(['none', 'none', 'none']);
  });

  it('does not take the model\'s word that grams came from the text', async () => {
    const plan = { lines: [{ term: 'eggs', grams: 300, gramsFrom: 'text', skip: false }, { term: 'flour', grams: 90, gramsFrom: 'text', skip: false }] };
    const { fn } = fakeFetch({ plan, picks: { picks: [{ i: 0, id: 21, approximate: false }, { i: 1, id: 11, approximate: false }] } });
    const out = await resolveLines(['3 large eggs', '200 g flour'], deps(fn, memCache()));
    expect(out.ok && out.lines.map(l => [l.grams, l.gramsFrom])).toEqual([[300, 'converted'], [200, 'text']]);
  });

  it('answers a second request for the same lines from the cache: no model call, no USDA call, no gate', async () => {
    const cache = memCache();
    const first = fakeFetch({ plan: PLAN, picks: PICKS });
    const a = await resolveLines(LINES, deps(first.fn, cache));
    const second = fakeFetch({});
    const gate = vi.fn(() => ({ ok: true as const }));
    const b = await resolveLines(LINES.map(l => ` ${l.toUpperCase()}. `), deps(second.fn, cache, gate)); // case and a trailing stop do not matter
    expect(second.calls.model + second.calls.usda).toBe(0);
    expect(gate).not.toHaveBeenCalled();
    expect(b.ok && b.cached).toBe(5);
    expect(b.ok && b.lines.map(l => ({ ...l, line: '' }))).toEqual(a.ok ? a.lines.map(l => ({ ...l, line: '' })) : []);
    expect(b.ok && b.lines[0]!.line).toBe(' ½ CUP (100 G) ALL-PURPOSE FLOUR. '); // the answer carries the text as sent
  });

  it('caches none and skip too, keyed by the version and the normalised line, with no line text stored', async () => {
    const cache = memCache();
    await resolveLines(LINES, deps(fakeFetch({ plan: PLAN, picks: PICKS }).fn, cache));
    expect(cache.map.size).toBe(5);
    expect(cache.map.has(cacheKey('water'))).toBe(true);
    expect(cacheKey('Water ')).toBe(cacheKey('water'));
    expect(cacheKey('water')).toMatch(/^[0-9a-f]{64}$/);
    expect(RESOLVER_VERSION).toBeGreaterThan(0);
    expect(JSON.stringify([...cache.map.values()])).not.toMatch(/all-purpose flour|Unobtainium|Butter(?!,)/i);
  });

  it('calls the gate once, before the first model call, and stops there when it says no', async () => {
    const { fn, calls } = fakeFetch({ plan: PLAN, picks: PICKS });
    const cache = memCache();
    const out = await resolveLines(LINES, deps(fn, cache, () => ({ ok: false, retryAfterSec: 99 })));
    expect(out).toEqual({ ok: false, retryAfterSec: 99 });
    expect(calls.model + calls.usda).toBe(0);
    expect(cache.map.size).toBe(0);
  });

  it('a failed search leaves its line none and uncached; every search failing is a failed request', async () => {
    const cache = memCache();
    const some = fakeFetch({ plan: PLAN, picks: PICKS, usdaFail: ['butter'] });
    const out = await resolveLines(LINES, deps(some.fn, cache));
    expect(out.ok && out.lines[2]!.status).toBe('none');
    expect(cache.map.has(cacheKey(LINES[2]!))).toBe(false);
    expect(cache.map.size).toBe(4);
    const all = fakeFetch({ plan: { lines: [PLAN.lines[0]] }, usdaFail: ['flour'] });
    const c2 = memCache();
    await expect(resolveLines(['flour'], deps(all.fn, c2))).rejects.toThrow();
    expect(c2.map.size).toBe(0);
  });

  it('a model call that is cut off or refused writes nothing', async () => {
    const cache = memCache();
    const fn = vi.fn(async () => reply(PLAN, 'max_tokens')) as unknown as typeof fetch;
    await expect(resolveLines(LINES, deps(fn, cache))).rejects.toThrow(/max_tokens/);
    expect(cache.map.size).toBe(0);
  });

  it('a plan of the wrong length is a failed request', async () => {
    await expect(resolveLines(LINES, deps(fakeFetch({ plan: { lines: [] } }).fn, memCache()))).rejects.toThrow();
  });
});

type Ingredients = NonNullable<Parameters<typeof createApp>[0]>['ingredients'];
async function post(ingredients: Ingredients, body: unknown, user = 'u1', max = 1000) {
  server = createApp({ db, ingredients, admins: new Set(), limits: { ingredients: { max, windowMs: 60_000 } } }).listen(0);
  await new Promise(done => server!.once('listening', done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ingredients/resolve`;
  return (b: unknown = body, who = user) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-user': who }, body: JSON.stringify(b) });
}

describe('POST /api/ingredients/resolve', () => {
  it('answers one result per line, private and no-store, and the second request is served from Postgres', async () => {
    const f = fakeFetch({ plan: PLAN, picks: PICKS });
    const send = await post({ key: 'SECRET', usdaKey: 'USDAKEY', fetch: f.fn }, { lines: LINES });
    const res = await send();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const text = await res.text();
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('USDAKEY');
    const body = JSON.parse(text) as { ok: boolean; lines: { status: string }[]; left: number; max: number };
    expect(body).toMatchObject({ ok: true, left: 4, max: 5 });
    expect(body.lines.map(l => l.status)).toEqual(['matched', 'matched', 'matched', 'skip', 'none']);
    expect(await db.selectFrom('ingredient_matches').select('key').execute()).toHaveLength(5);
    const before = f.calls.model + f.calls.usda;
    const again = await send();
    expect(f.calls.model + f.calls.usda).toBe(before);
    expect(await again.json()).toMatchObject({ ok: true, left: 4, max: 5 }); // a fill answered from the cache does not count
  });

  it('refuses a bad body with 422 and calls nothing', async () => {
    const f = fakeFetch({});
    const send = await post({ key: 'k', usdaKey: 'u', fetch: f.fn }, {});
    for (const bad of [{}, { lines: [] }, { lines: 'eggs' }, { lines: ['ok', ''] }, { lines: Array(41).fill('egg') }, { lines: [1] }]) expect((await send(bad)).status, JSON.stringify(bad)).toBe(422);
    expect(f.calls.model + f.calls.usda).toBe(0);
  });

  it('answers 503 no-key without either key, and 503 off when the server cap is 0', async () => {
    expect(await (await (await post({}, { lines: ['egg'] }))()).json()).toMatchObject({ ok: false, why: 'no-key' });
    expect(await (await (await post({ key: 'k' }, { lines: ['egg'] }))()).json()).toMatchObject({ ok: false, why: 'no-key' });
    const res = await (await post({ key: 'k', usdaKey: 'u', dailyMax: 0 }, { lines: ['egg'] }))();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ why: 'off' });
  });

  it('answers 503 cap with retryAfterSec past the per-person cap, counts only fills with an uncached line, and keeps another person going', async () => {
    const f = fakeFetch({ plan: { lines: [PLAN.lines[1]] }, picks: { picks: [{ i: 0, id: 21, approximate: false }] } });
    const send = await post({ key: 'k', usdaKey: 'u', fetch: f.fn, userDailyMax: 2 }, { lines: ['2 eggs'] });
    expect(await (await send({ lines: ['2 eggs'] })).json()).toMatchObject({ ok: true, left: 1 });
    expect(await (await send({ lines: ['2 eggs'] })).json()).toMatchObject({ ok: true, left: 1 }); // cached: not counted
    expect(await (await send({ lines: ['2 eggs, large'] })).json()).toMatchObject({ ok: true, left: 0 });
    const capped = await send({ lines: ['3 eggs'] });
    expect(capped.status).toBe(503);
    const body = (await capped.json()) as { why: string; retryAfterSec: number };
    expect(body.why).toBe('cap');
    expect(body.retryAfterSec).toBeGreaterThan(0);
    expect(await (await send({ lines: ['4 eggs'] }, 'u2')).json()).toMatchObject({ ok: true });
  });

  it('stops everyone at the server cap', async () => {
    const f = fakeFetch({ plan: { lines: [PLAN.lines[1]] }, picks: { picks: [{ i: 0, id: 21, approximate: false }] } });
    const send = await post({ key: 'k', usdaKey: 'u', fetch: f.fn, dailyMax: 1 }, { lines: ['2 eggs'] });
    expect((await send({ lines: ['5 eggs'] }, 'a')).status).toBe(200);
    expect((await send({ lines: ['6 eggs'] }, 'b')).status).toBe(503);
  });

  it('answers 503 upstream when the model fails, and writes nothing', async () => {
    const fn = vi.fn(async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const res = await (await post({ key: 'k', usdaKey: 'u', fetch: fn }, { lines: ['egg'] }))();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ why: 'upstream' });
    expect(await db.selectFrom('ingredient_matches').select('key').execute()).toHaveLength(0);
  });

  it('answers 503 when the cache table is missing instead of crashing', async () => {
    const f = fakeFetch({ plan: PLAN, picks: PICKS });
    const res = await (await post({ key: 'k', usdaKey: 'u', fetch: f.fn, cache: () => ({ get: async () => { throw new Error('relation "ingredient_matches" does not exist'); }, put: async () => {} }) }, { lines: ['egg'] }))();
    expect(res.status).toBe(503);
  });

  it('is limited to 5 requests a minute a person', async () => {
    const send = await post({ key: 'k', usdaKey: 'u' }, { lines: [] }, 'u1', 5);
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(422);
    expect((await send()).status).toBe(429);
    expect((await send(undefined, 'u2')).status).toBe(422);
  });

  it('is behind sign-in', async () => {
    server = createApp({ db, ingredients: { key: 'k', usdaKey: 'u' } }).listen(0);
    await new Promise(done => server!.once('listening', done));
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ingredients/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"lines":["egg"]}' });
    expect(res.status).toBe(401);
  });
});

describe('ingredient_matches table', () => {
  it('the app role may only select and insert, with row-level security on', async () => {
    const priv = async (p: string) => (await sql<{ ok: boolean }>`select has_table_privilege('ironlog_app', 'ingredient_matches', ${p}) as ok`.execute(db)).rows[0]!.ok;
    expect([await priv('SELECT'), await priv('INSERT'), await priv('UPDATE'), await priv('DELETE')]).toEqual([true, true, false, false]);
    expect((await sql<{ on: boolean }>`select relrowsecurity as on from pg_class where relname = 'ingredient_matches'`.execute(db)).rows[0]!.on).toBe(true);
    const c = postgresCache(db, '1');
    await c.put([{ key: 'a'.repeat(64), result: { status: 'none' } }]);
    expect((await c.get(['a'.repeat(64)])).get('a'.repeat(64))).toEqual({ status: 'none' });
    await c.put([{ key: 'a'.repeat(64), result: { status: 'skip' } }]); // a second writer: first answer stays
    expect((await c.get(['a'.repeat(64)])).get('a'.repeat(64))).toEqual({ status: 'none' });
  });
});
