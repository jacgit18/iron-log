import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL, scanRoutes, type ScanDeps } from './scan.ts';

let server: Server | undefined;
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });

const jpeg = '/9j/' + 'A'.repeat(200);
const model = (text: string, status = 200) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status });
const good = '{"name":"Gnocchi","serving":"1 cup","servingG":140,"servingsPerPack":3,"kcal":210,"p":6,"c":40,"f":1}';

async function start(deps: ScanDeps) {
  const app = express();
  app.use('/api/scan', scanRoutes(deps));
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scan/label`;
  return (body: unknown, raw = false) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? String(body) : JSON.stringify(body) });
}

describe('POST /api/scan/label', () => {
  it('sends the photo and key to the model and answers with the checked label', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch });
    const res = await post({ image: jpeg });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, result: { kind: 'ok', label: { name: 'Gnocchi', serving: '1 cup', servingG: 140, servingsPerPack: 3, kcal: 210, p: 6, c: 40, f: 1 } } });
    expect(text).not.toContain('SECRET');
    const [url, init] = ask.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('SECRET');
    const sent = JSON.parse(String(init.body)) as { model: string; messages: { content: { type: string; source?: { data: string; media_type: string } }[] }[] };
    expect(sent.model).toBe(DEFAULT_MODEL);
    expect(sent.messages[0]!.content[0]!.source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: jpeg });
  });

  it('uses the model it is given', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'k', model: 'claude-sonnet-5-5', fetch: ask as unknown as typeof fetch });
    await post({ image: jpeg });
    expect(JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)).model).toBe('claude-sonnet-5-5');
  });

  it('answers "unreadable" for a reply that is not the fixed shape, and never forwards extra fields', async () => {
    const post = await start({ key: 'k', fetch: (async () => model('I think it says 200 calories')) as unknown as typeof fetch });
    expect(await (await post({ image: jpeg })).json()).toEqual({ ok: true, result: { kind: 'unreadable' } });
    const post2 = await start({ key: 'k', fetch: (async () => model('{"kcal":100,"p":2,"evil":"x"}')) as unknown as typeof fetch });
    expect(await (await post2({ image: jpeg })).json()).toEqual({ ok: true, result: { kind: 'ok', label: { kcal: 100, p: 2 } } });
  });

  it('refuses a body that is not one JPEG', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    expect((await post({})).status).toBe(422);
    expect((await post({ image: 'iVBOR' + 'A'.repeat(200) })).status).toBe(422);
    expect((await post({ image: 'x'.repeat(2_100_000) })).status).toBe(413);
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers 503 no-key without calling the model', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ask = vi.fn();
    const post = await start({ fetch: ask as unknown as typeof fetch });
    const res = await post({ image: jpeg });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, why: 'no-key' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers 503 upstream when the model call fails, and logs neither the photo nor the key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const post = await start({ key: 'SECRET', fetch: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch });
    const res = await post({ image: jpeg });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, why: 'upstream' });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('upstream 500');
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain(jpeg);
  });

  it('answers 503 cap after the daily ceiling, and starts again after a day', async () => {
    let t = 1_000_000;
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'k', dailyMax: 2, now: () => t, fetch: ask as unknown as typeof fetch });
    expect((await post({ image: jpeg })).status).toBe(200);
    expect((await post({ image: jpeg })).status).toBe(200);
    const over = await post({ image: jpeg });
    expect(over.status).toBe(503);
    expect(await over.json()).toMatchObject({ why: 'cap' });
    expect(ask).toHaveBeenCalledTimes(2);
    t += 24 * 60 * 60_000;
    expect((await post({ image: jpeg })).status).toBe(200);
  });
});
