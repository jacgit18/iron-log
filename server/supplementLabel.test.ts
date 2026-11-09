import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAILY_MAX, HOLD_MS, supplementLabelRoutes, type SupplementLabelDeps } from './supplementLabel.ts';

let server: Server | undefined;
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });

const record = JSON.parse(readFileSync(new URL('../src/shared/fixtures/dsld-320047-ddrops-d3.json', import.meta.url), 'utf8')) as unknown;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function start(deps: SupplementLabelDeps, user = 'u1') {
  const app = express();
  app.use((_req, res, next) => { res.locals.userId = user; next(); });
  app.use('/api/supplement-label', supplementLabelRoutes(deps));
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/supplement-label`;
}
const as = (f: (u: string) => Promise<Response>) => f as unknown as typeof fetch;

describe('GET /api/supplement-label/c:dsld:<id>', () => {
  it('asks DSLD for that label and answers the mapped label, not the raw record', async () => {
    const ask = vi.fn(async (_u: string) => reply(record));
    const res = await fetch(`${await start({ fetch: as(ask) })}/c:dsld:320047`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('private');
    const body = (await res.json()) as { ok: boolean; label: { rows: unknown[]; serving: { text: string }; ingredientRows?: unknown } };
    expect(body.ok).toBe(true);
    expect(body.label.rows).toEqual([{ key: 'vitaminD', amount: 50, unit: 'mcg' }]);
    expect(body.label.serving.text).toContain('1 drop');
    expect(body.label.ingredientRows).toBeUndefined();
    expect(ask.mock.calls[0][0]).toBe('https://api.ods.od.nih.gov/dsld/v9/label/320047');
  });

  it('refuses an id that is not c:dsld: and digits, without asking NIH', async () => {
    const ask = vi.fn(async () => reply(record));
    const base = await start({ fetch: as(ask) });
    for (const bad of ['320047', 'c:dsld:', 'c:dsld:12ab', 'c:dsld:1234567890', 'c:exrx:5', 'c:dsld:1/../2', encodeURIComponent('c:dsld:1?x=2')]) {
      const res = await fetch(`${base}/${bad}`);
      expect([404, 422], bad).toContain(res.status);
      expect(res.status).not.toBe(200);
    }
    expect(ask).not.toHaveBeenCalled();
  });

  it('holds an answer for an hour, then asks again', async () => {
    let t = 1_000_000;
    const ask = vi.fn(async (_u: string) => reply(record));
    const base = await start({ fetch: as(ask), now: () => t });
    await fetch(`${base}/c:dsld:320047`); await fetch(`${base}/c:dsld:320047`);
    expect(ask).toHaveBeenCalledTimes(1);
    t += HOLD_MS + 1;
    await fetch(`${base}/c:dsld:320047`);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  describe('a lookup that does not work never answers a label', () => {
    const code = async (ask: (u: string) => Promise<Response>) => { const res = await fetch(`${await start({ fetch: as(ask) })}/c:dsld:1`); return { status: res.status, body: (await res.json()) as { ok: boolean; why?: string; label?: unknown } }; };
    it('upstream 500 is 503 "upstream"', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(await code(async () => reply({}, 500))).toEqual({ status: 503, body: { ok: false, error: expect.any(String), why: 'upstream' } });
    });
    it('a timeout is 503', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const out = await code(async () => { throw new DOMException('timed out', 'TimeoutError'); });
      expect(out.status).toBe(503); expect(out.body.label).toBeUndefined();
    });
    it('NIH 404 is 404 "not-found"', async () => {
      expect((await code(async () => reply({}, 404))).body.why).toBe('not-found');
    });
    it('a record with no ingredient rows is 404', async () => {
      const out = await code(async () => reply({ ingredientRows: [] }));
      expect(out.status).toBe(404);
    });
    it('never follows a redirect: it asks with redirect "error", and a redirect (thrown by fetch, or a 302 from a stand-in) is 503 "upstream"', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ask = vi.fn(async (_u: string, _o?: RequestInit) => { throw new TypeError('fetch failed: unexpected redirect'); });
      expect((await code(ask)).body.why).toBe('upstream');
      expect(ask.mock.calls[0][1]?.redirect).toBe('error');
      const out = await code(async () => new Response(null, { status: 302, headers: { location: 'https://example.com/' } }));
      expect(out.status).toBe(503); expect(out.body.why).toBe('upstream');
    });
    it('a body that is not JSON is 503', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect((await code(async () => new Response('<html>oops</html>', { status: 200 }))).status).toBe(503);
    });
    it('a failure is not held: the next ask goes to NIH again', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      let n = 0;
      const ask = vi.fn(async (_u: string) => (n++ === 0 ? reply({}, 500) : reply(record)));
      const base = await start({ fetch: as(ask) });
      expect((await fetch(`${base}/c:dsld:1`)).status).toBe(503);
      expect((await fetch(`${base}/c:dsld:1`)).status).toBe(200);
    });
  });

  it('gives each person a daily allowance, counted on held answers too, and says when to come back', async () => {
    const ask = vi.fn(async (_u: string) => reply(record));
    const base = await start({ fetch: as(ask) });
    for (let i = 0; i < DAILY_MAX; i++) expect((await fetch(`${base}/c:dsld:320047`)).status).toBe(200);
    const over = await fetch(`${base}/c:dsld:320047`);
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('the allowance is per person', async () => {
    const ask = vi.fn(async (_u: string) => reply(record));
    const deps = { fetch: as(ask) };
    const app = express(); let user = 'alice';
    app.use((_q, res, next) => { res.locals.userId = user; next(); });
    app.use('/x', supplementLabelRoutes(deps));
    server = app.listen(0); await new Promise(done => server!.once('listening', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
    for (let i = 0; i < DAILY_MAX; i++) await fetch(`${base}/c:dsld:320047`);
    expect((await fetch(`${base}/c:dsld:320047`)).status).toBe(429);
    user = 'bob';
    expect((await fetch(`${base}/c:dsld:320047`)).status).toBe(200);
  });
});
