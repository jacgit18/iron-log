import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MICRO_UNIT } from '../src/shared/foodMicro.ts';
import { NUTRIENT_KEYS } from '../src/shared/nutrientKeys.ts';
import { DEFAULT_MODEL, DEFAULT_RECEIPT_MODEL, scanRoutes, type ScanDeps } from './scan.ts';

let server: Server | undefined;
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });

const jpeg = '/9j/' + 'A'.repeat(200);
const model = (text: string, status = 200) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status });
const good = '{"name":"Gnocchi","serving":"1 cup","servingG":140,"servingsPerPack":3,"kcal":210,"p":6,"c":40,"f":1}';

async function start(deps: ScanDeps) {
  const app = express();
  app.use((req, res, next) => { res.locals.userId = req.get('x-user') ?? 'u1'; next(); }); // the sign-in gate sets this in the real app
  app.use('/api/scan', scanRoutes(deps));
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scan/label`;
  return (body: unknown, raw = false, user = 'u1') => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user }, body: raw ? String(body) : JSON.stringify(body) });
}

describe('POST /api/scan/label', () => {
  it('sends the photo and key to the model and answers with the checked label', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'SECRET', fetch: ask as unknown as typeof fetch });
    const res = await post({ image: jpeg });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, result: { kind: 'ok', label: { name: 'Gnocchi', serving: '1 cup', servingG: 140, servingsPerPack: 3, kcal: 210, p: 6, c: 40, f: 1 } }, left: 14, max: 15 }); // this person's count after this call (brief barcode-miss-ladder)
    expect(text).not.toContain('SECRET');
    const [url, init] = ask.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('SECRET');
    const sent = JSON.parse(String(init.body)) as { model: string; messages: { content: { type: string; source?: { data: string; media_type: string } }[] }[] };
    expect(sent.model).toBe(DEFAULT_MODEL);
    expect(sent.messages[0]!.content[0]!.source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: jpeg });
  });

  it('asks for the 15 vitamin and mineral keys per serving in mg or mcg, never percent, and allows enough output', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'k', fetch: ask as unknown as typeof fetch });
    await post({ image: jpeg });
    const sent = JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { system: string; max_tokens: number };
    for (const k of NUTRIENT_KEYS) expect(sent.system).toContain(`${k} (${MICRO_UNIT[k]})`);
    expect(sent.system).toContain('never the percent of Daily Value');
    expect(sent.max_tokens).toBe(700);
  });

  it('answers with the checked amounts and drops what the model made up', async () => {
    const post = await start({ key: 'k', fetch: (async () => model('{"kcal":120,"p":3,"micro":{"iron":4.5,"vitaminD":2,"potassium":300,"zinc":99999}}')) as unknown as typeof fetch });
    expect(((await (await post({ image: jpeg })).json()) as { result: unknown }).result).toEqual({ kind: 'ok', label: { kcal: 120, p: 3, micro: { iron: 4.5, vitaminD: 2 } } });
  });

  it('uses the model it is given', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'k', model: 'claude-sonnet-5-5', fetch: ask as unknown as typeof fetch });
    await post({ image: jpeg });
    expect(JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)).model).toBe('claude-sonnet-5-5');
  });

  it('answers "unreadable" for a reply that is not the fixed shape, and never forwards extra fields', async () => {
    const post = await start({ key: 'k', fetch: (async () => model('I think it says 200 calories')) as unknown as typeof fetch });
    expect(((await (await post({ image: jpeg })).json()) as { result: unknown }).result).toEqual({ kind: 'unreadable' });
    const post2 = await start({ key: 'k', fetch: (async () => model('{"kcal":100,"p":2,"evil":"x"}')) as unknown as typeof fetch });
    expect(((await (await post2({ image: jpeg })).json()) as { result: unknown }).result).toEqual({ kind: 'ok', label: { kcal: 100, p: 2 } });
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
    expect(await over.json()).toMatchObject({ why: 'cap', retryAfterSec: expect.any(Number) });
    expect(ask).toHaveBeenCalledTimes(2);
    t += 24 * 60 * 60_000;
    expect((await post({ image: jpeg })).status).toBe(200);
  });

  it('stops one person at their own daily allowance and leaves everyone else their scans', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'k', userDailyMax: 2, dailyMax: 50, fetch: ask as unknown as typeof fetch });
    expect((await post({ image: jpeg }, false, 'greedy')).status).toBe(200);
    expect((await post({ image: jpeg }, false, 'greedy')).status).toBe(200);
    const over = await post({ image: jpeg }, false, 'greedy');
    expect(over.status).toBe(503);
    expect(await over.json()).toMatchObject({ why: 'cap', retryAfterSec: expect.any(Number) });
    expect(ask).toHaveBeenCalledTimes(2); // the refused call never reached the model
    const other = await post({ image: jpeg }, false, 'someone-else');
    expect(other.status).toBe(200);
    expect(await other.json()).toMatchObject({ left: 1, max: 2 });
  });

  it('still stops everyone at the server-wide ceiling, and shows the lower of the two counts', async () => {
    const ask = vi.fn(async () => model(good));
    const post = await start({ key: 'k', userDailyMax: 5, dailyMax: 2, fetch: ask as unknown as typeof fetch });
    expect(await (await post({ image: jpeg }, false, 'a')).json()).toMatchObject({ left: 1, max: 5 });
    expect((await post({ image: jpeg }, false, 'b')).status).toBe(200);
    expect((await post({ image: jpeg }, false, 'c')).status).toBe(503);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/scan/receipt', () => {
  const items = [{ id: 'eggs', n: 'Eggs' }, { id: 'oil', n: 'Kirkland olive oil', unit: 'lb' }];
  const reply = JSON.stringify({ store: "BJ'S", date: '2026-11-03', tax: 204, total: 4000, lines: [{ text: 'EGGS LRG 5 DZ', qty: 2, total: 2698, match: 'eggs' }, { text: 'GONE', qty: 1, total: 100, match: 'not-sent' }] });
  async function startReceipt(deps: ScanDeps) {
    const app = express();
  app.use((req, res, next) => { res.locals.userId = req.get('x-user') ?? 'u1'; next(); }); // the sign-in gate sets this in the real app
  app.use('/api/scan', scanRoutes(deps));
    server = app.listen(0);
    await new Promise(done => server!.once('listening', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scan/receipt`;
    return (body: unknown, user = 'u1') => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user }, body: JSON.stringify(body) });
  }

  it('sends the photo, the item names and the key to the larger model, and answers with the checked receipt', async () => {
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'SECRET', fetch: ask as unknown as typeof fetch });
    const res = await post({ image: jpeg, items });
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as { result: { kind: string; receipt: { lines: { matchId: string | null }[]; taxCents: number } } };
    expect(body.result.kind).toBe('ok');
    expect(body.result.receipt.lines.map(l => l.matchId)).toEqual(['eggs', null]); // an id the app did not send is dropped
    expect(body.result.receipt.taxCents).toBe(204);
    expect(text).not.toContain('SECRET');
    const sent = JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { model: string; messages: { content: { type: string; text?: string }[] }[] };
    expect(sent.model).toBe(DEFAULT_RECEIPT_MODEL);
    const userText = sent.messages[0]!.content.find(c => c.type === 'text')!.text!;
    expect(userText).toContain('Kirkland olive oil');
    expect(userText).not.toContain('price');
  });

  it('uses the receipt model it is given', async () => {
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'k', receiptModel: 'claude-haiku-5-5', fetch: ask as unknown as typeof fetch });
    await post({ image: jpeg, items });
    expect(JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)).model).toBe('claude-haiku-5-5');
  });

  it('refuses a body with no photo or no usable items, and a photo that is not a JPEG', async () => {
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'k', fetch: ask as unknown as typeof fetch });
    expect((await post({ items })).status).toBe(422);
    expect((await post({ image: jpeg })).status).toBe(422);
    expect((await post({ image: jpeg, items: [] })).status).toBe(422);
    expect((await post({ image: 'iVBOR' + 'A'.repeat(200), items })).status).toBe(422);
    expect(ask).not.toHaveBeenCalled();
  });

  it('answers unreadable for a reply that is not the fixed shape', async () => {
    const post = await startReceipt({ key: 'k', fetch: (async () => model('It is a receipt from BJ\'s')) as unknown as typeof fetch });
    expect(await (await post({ image: jpeg, items })).json()).toEqual({ ok: true, result: { kind: 'unreadable' } });
  });

  it('answers 503 no-key and 503 upstream, and logs neither the photo, the key, an item name nor the receipt text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const none = await startReceipt({});
    expect(await (await none({ image: jpeg, items })).json()).toMatchObject({ ok: false, why: 'no-key' });
    await new Promise<void>(done => server!.close(() => done()));
    const post = await startReceipt({ key: 'SECRET', fetch: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch });
    const res = await post({ image: jpeg, items });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ why: 'upstream' });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('upstream 500');
    for (const secret of ['SECRET', jpeg, 'Kirkland', 'EGGS']) expect(logged).not.toContain(secret);
  });

  it('counts receipts apart from labels and stops at its own daily ceiling', async () => {
    let t = 1_000_000;
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'k', receiptDailyMax: 1, dailyMax: 5, now: () => t, fetch: ask as unknown as typeof fetch });
    expect((await post({ image: jpeg, items })).status).toBe(200);
    const over = await post({ image: jpeg, items });
    expect(over.status).toBe(503);
    expect(await over.json()).toMatchObject({ why: 'cap' });
    t += 24 * 60 * 60_000;
    expect((await post({ image: jpeg, items })).status).toBe(200);
  });

  it('stops one person at their own receipt allowance and leaves the others theirs', async () => {
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'k', receiptUserDailyMax: 1, receiptDailyMax: 50, fetch: ask as unknown as typeof fetch });
    expect((await post({ image: jpeg, items }, 'greedy')).status).toBe(200);
    expect((await post({ image: jpeg, items }, 'greedy')).status).toBe(503);
    expect((await post({ image: jpeg, items }, 'other')).status).toBe(200);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
