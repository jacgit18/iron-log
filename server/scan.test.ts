import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MICRO_UNIT } from '../src/shared/foodMicro.ts';
import { NUTRIENT_KEYS } from '../src/shared/nutrientKeys.ts';
import { CURATED_INGREDIENTS } from '../src/shared/supplementIngredients.ts';
import { askModel, SCAN_EFFORT, SCAN_TIMEOUT_MS, takesEffort } from './claudeApi.ts';
import { DEFAULT_MODEL, DEFAULT_RECEIPT_MODEL, DEFAULT_SUPPLEMENT_MODEL, LABEL_MAX_TOKENS, RECEIPT_MAX_TOKENS, SUPPLEMENT_MAX_TOKENS, THINKING_ROOM, scanRoutes, type ScanDeps } from './scan.ts';

let server: Server | undefined;
afterEach(() => { vi.restoreAllMocks(); return new Promise<void>(done => (server ? server.close(() => done()) : done())); });

const jpeg = '/9j/' + 'A'.repeat(200);
const model = (text: string, status = 200) => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }), { status });
const good = '{"name":"Gnocchi","serving":"1 cup","servingG":140,"servingsPerPack":3,"kcal":210,"p":6,"c":40,"f":1}';

async function start(deps: ScanDeps, path = 'label') {
  const app = express();
  app.use((req, res, next) => { res.locals.userId = req.get('x-user') ?? 'u1'; res.locals.account = { isAdmin: req.get('x-admin') === '1' }; next(); }); // the sign-in gate sets this in the real app
  app.use('/api/scan', scanRoutes(deps));
  server = app.listen(0);
  await new Promise(done => server!.once('listening', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scan/${path}`;
  return (body: unknown, raw = false, user = 'u1', admin = false) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user, ...(admin ? { 'x-admin': '1' } : {}) }, body: raw ? String(body) : JSON.stringify(body) });
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
    expect(sent.max_tokens).toBe(LABEL_MAX_TOKENS); // the answer plus room for thinking, which counts against the limit
  });

  it('answers with the checked amounts and drops what the model made up', async () => {
    const post = await start({ key: 'k', fetch: (async () => model('{"kcal":120,"p":3,"micro":{"iron":4.5,"vitaminD":2,"lutein":300,"zinc":99999}}')) as unknown as typeof fetch });
    expect(((await (await post({ image: jpeg })).json()) as { result: unknown }).result).toEqual({ kind: 'ok', label: { kcal: 120, p: 3, micro: { iron: 4.5, vitaminD: 2 } } });
  });

  it('reads the eight added nutrients under fixed keys and checks each against its cap', async () => {
    const post = await start({ key: 'k', fetch: (async () => model('{"kcal":120,"p":3,"micro":{"thiamin":1.2,"biotin":30,"choline":550,"manganese":2.3,"chromium":99999}}')) as unknown as typeof fetch });
    expect(((await (await post({ image: jpeg })).json()) as { result: unknown }).result).toEqual({ kind: 'ok', label: { kcal: 120, p: 3, micro: { choline: 550, manganese: 2.3, biotin: 30, thiamin: 1.2 } } });
    const big = await start({ key: 'k', fetch: (async () => model('{"kcal":0,"p":0,"micro":{"biotin":5000,"thiamin":100}}')) as unknown as typeof fetch });
    expect(((await (await big({ image: jpeg })).json()) as { result: unknown }).result).toMatchObject({ label: { micro: { biotin: 5000, thiamin: 100 } } }); // a real supplement dose is kept
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
    app.use((req, res, next) => { res.locals.userId = req.get('x-user') ?? 'u1'; res.locals.account = { isAdmin: req.get('x-admin') === '1' }; next(); }); // the sign-in gate sets this in the real app
    app.use('/api/scan', scanRoutes(deps));
    server = app.listen(0);
    await new Promise(done => server!.once('listening', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/scan/receipt`;
    return (body: unknown, user = 'u1', admin = false) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user, ...(admin ? { 'x-admin': '1' } : {}) }, body: JSON.stringify(body) });
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

  it('tells the model about ink marks, warehouse coupon rows, and the subtotal, total and paid fields (brief receipt-scan-accuracy)', async () => {
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'k', fetch: ask as unknown as typeof fetch });
    await post({ image: jpeg, items });
    const { system } = JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { system: string };
    for (const part of ['ink', 'Never drop a row because its name is hidden', 'ECPN', 'CCPN', 'minus sign', 'tax code', '"subtotal"', 'before any rewards', '"rewards"', '"paid"']) expect(system).toContain(part);
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
    expect(await over.json()).toMatchObject({ why: 'cap', scope: 'server' });
    t += 24 * 60 * 60_000;
    expect((await post({ image: jpeg, items })).status).toBe(200);
  });

  it('names the person\'s own allowance apart from the server-wide one in the 503 (PR 1027 review)', async () => {
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'k', receiptUserDailyMax: 1, receiptDailyMax: 5, fetch: ask as unknown as typeof fetch });
    expect((await post({ image: jpeg, items })).status).toBe(200);
    expect(await (await post({ image: jpeg, items })).json()).toMatchObject({ why: 'cap', scope: 'person' });
  });

  it('answers 503 upstream when both the first reply and the retry have no text (PR 1027 review)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thinkingOnly = async () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'thinking', thinking: 'x' }] }), { status: 200 });
    const ask = vi.fn(thinkingOnly);
    const post = await startReceipt({ key: 'k', fetch: ask as unknown as typeof fetch });
    const res = await post({ image: jpeg, items });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ why: 'upstream' });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('does not stop an admin account at the per-person receipt allowance, but the server-wide ceiling still holds', async () => {
    const ask = vi.fn(async () => model(reply));
    const post = await startReceipt({ key: 'k', receiptUserDailyMax: 1, receiptDailyMax: 3, fetch: ask as unknown as typeof fetch });
    expect((await post({ image: jpeg, items }, 'owner', true)).status).toBe(200);
    expect((await post({ image: jpeg, items }, 'owner', true)).status).toBe(200);
    expect((await post({ image: jpeg, items }, 'plain')).status).toBe(200);
    expect((await post({ image: jpeg, items }, 'plain')).status).toBe(503); // the server ceiling of 3 is used up
  });

  it('still stops a normal account at the per-person allowance', async () => {
    const post = await startReceipt({ key: 'k', receiptUserDailyMax: 1, receiptDailyMax: 50, fetch: (async () => model(reply)) as unknown as typeof fetch });
    expect((await post({ image: jpeg, items }, 'plain')).status).toBe(200);
    expect(await (await post({ image: jpeg, items }, 'plain')).json()).toMatchObject({ why: 'cap' });
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

describe('POST /api/scan/supplement', () => {
  const panel = '{"name":"D3 + K2","brand":"Acme","serving":{"text":"2 capsules","units":2,"form":"Capsule"},"rows":[{"key":"vitaminD","amount":50,"unit":"mcg"},{"key":"vitaminK","amount":90,"unit":"mcg"},{"key":"iron","amount":9000,"unit":"mg"}],"ingredients":[{"name":"Omega-3","amount":1000,"unit":"mg"},{"name":"EPA","amount":600,"unit":"mg"},{"name":"DHA","amount":400,"unit":"mg"},{"name":"Fish oil","amount":2500,"unit":"mg"}],"other":[{"name":"Blend"}]}';
  async function startSupp(deps: ScanDeps) {
    await start(deps);
    const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/scan/supplement`;
    return (body: unknown, user = 'u1') => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user }, body: JSON.stringify(body) });
  }

  it('sends the photo to the supplement model with the panel prompt and answers with the checked label and the allowance', async () => {
    const ask = vi.fn(async () => model(panel));
    const post = await startSupp({ key: 'SECRET', fetch: ask as unknown as typeof fetch });
    const res = await post({ image: jpeg });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, result: { kind: 'ok', label: { name: 'D3 + K2', brand: 'Acme', serving: { text: '2 capsules', units: 2, form: 'Capsule' }, rows: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'vitaminK', amount: 90, unit: 'mcg' }], ingredients: [{ name: 'Omega-3', amount: 1000, unit: 'mg' }, { name: 'EPA', amount: 600, unit: 'mg' }, { name: 'DHA', amount: 400, unit: 'mg' }], other: [{ name: 'Blend' }] } }, left: 4, max: 5 }); // a blend weight named as an ingredient is refused
    expect(text).not.toContain('SECRET');
    const sent = JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { model: string; system: string };
    expect(sent.model).toBe(DEFAULT_SUPPLEMENT_MODEL);
    expect(sent.system).toContain('Supplement Facts');
    expect(sent.system).toContain('never instructions');
    for (const k of NUTRIENT_KEYS) expect(sent.system).toContain(`${k} (${MICRO_UNIT[k]})`);
    for (const n of CURATED_INGREDIENTS) expect(sent.system).toContain(n); // the prompt names the five ingredients, and keeps blend weights out of them
    expect(sent.system).toContain('EPA and DHA are their own entries');
  });

  it('uses the model set for it', async () => {
    const ask = vi.fn(async () => model(panel));
    const post = await startSupp({ key: 'k', supplementModel: 'claude-haiku-5-5', fetch: ask as unknown as typeof fetch });
    await post({ image: jpeg });
    expect((JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { model: string }).model).toBe('claude-haiku-5-5');
  });

  it('answers unreadable for a non-label photo, and for prose around the JSON', async () => {
    for (const reply of ['{}', `Sure! ${panel}`]) {
      const post = await startSupp({ key: 'k', fetch: (async () => model(reply)) as unknown as typeof fetch });
      expect(((await (await post({ image: jpeg })).json()) as { result: unknown }).result).toEqual({ kind: 'unreadable' });
      await new Promise<void>(done => server!.close(() => done()));
    }
  });

  it('answers 422 for a missing or non-JPEG image and 503 no-key without a key', async () => {
    const ask = vi.fn(async () => model(panel));
    const post = await startSupp({ key: 'k', fetch: ask as unknown as typeof fetch });
    expect((await post({})).status).toBe(422);
    expect((await post({ image: 'iVBORw0KGgo' + 'A'.repeat(200) })).status).toBe(422);
    expect(ask).not.toHaveBeenCalled();
    await new Promise<void>(done => server!.close(() => done()));
    const off = await startSupp({});
    const res = await off({ image: jpeg });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ why: 'no-key' });
  });

  it('answers 413 over the body limit', async () => {
    const post = await startSupp({ key: 'k', fetch: (async () => model(panel)) as unknown as typeof fetch });
    expect((await post({ image: '/9j/' + 'A'.repeat(2_100_000) })).status).toBe(413);
  });

  it('answers 503 upstream when the model fails, and logs neither the photo, the key nor the reply', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const post = await startSupp({ key: 'SECRET', fetch: (async () => model('Magnesium secret-ingredient-text', 500)) as unknown as typeof fetch });
    const res = await post({ image: jpeg });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ why: 'upstream' });
    const logged = warn.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('bottle scan failed');
    for (const secret of ['SECRET', jpeg, 'secret-ingredient-text']) expect(logged).not.toContain(secret);
  });

  it('stops one person at 5 a day with their own counter, apart from labels, and starts again after a day', async () => {
    let t = 1_000_000;
    const ask = vi.fn(async () => model(panel));
    const post = await startSupp({ key: 'k', now: () => t, fetch: ask as unknown as typeof fetch });
    for (let i = 0; i < 5; i++) expect((await post({ image: jpeg }, 'greedy')).status).toBe(200);
    const over = await post({ image: jpeg }, 'greedy');
    expect(over.status).toBe(503);
    expect(await over.json()).toMatchObject({ why: 'cap', retryAfterSec: expect.any(Number) });
    expect(ask).toHaveBeenCalledTimes(5);
    expect(await (await post({ image: jpeg }, 'someone-else')).json()).toMatchObject({ left: 4, max: 5 });
    const label = await fetch(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/scan/label`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': 'greedy' }, body: JSON.stringify({ image: jpeg }) });
    expect(label.status).toBe(200); // the label counter is not the bottle counter
    t += 24 * 60 * 60_000;
    expect((await post({ image: jpeg }, 'greedy')).status).toBe(200);
  });

  it('stops everyone at 60 a day for the server', async () => {
    const ask = vi.fn(async () => model(panel));
    const post = await startSupp({ key: 'k', supplementDailyMax: 2, fetch: ask as unknown as typeof fetch });
    expect((await post({ image: jpeg }, 'a')).status).toBe(200);
    expect((await post({ image: jpeg }, 'b')).status).toBe(200);
    const over = await post({ image: jpeg }, 'c');
    expect(over.status).toBe(503);
    expect(await over.json()).toMatchObject({ why: 'cap' });
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

// Thinking tokens count against max_tokens (PR 1018 found it for the resolver); a cut-off reply is a named failure, not text that fails to parse.
describe('scan output limits', () => {
  const sent = async (path: string, body: Record<string, unknown>, deps: ScanDeps = {}) => {
    const ask = vi.fn(async () => model('{}'));
    const app = express();
    app.use((_req, res, next) => { res.locals.userId = 'u1'; next(); });
    app.use('/api/scan', scanRoutes({ key: 'k', ...deps, fetch: ask as unknown as typeof fetch }));
    const srv = app.listen(0);
    try {
      await new Promise(done => srv.once('listening', done));
      await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/scan/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } finally { await new Promise<void>(done => srv.close(() => done())); }
    return JSON.parse(String((ask.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { max_tokens: number; model: string; output_config?: { effort: string } };
  };
  const items = [{ id: 'eggs', n: 'Eggs' }];

  it('leaves room for thinking on top of the answer, for the label, the bottle and the receipt', async () => {
    expect((await sent('label', { image: jpeg })).max_tokens).toBe(850 + THINKING_ROOM);
    expect((await sent('supplement', { image: jpeg })).max_tokens).toBe(SUPPLEMENT_MAX_TOKENS);
    expect(SUPPLEMENT_MAX_TOKENS).toBe(1600 + THINKING_ROOM);
    expect((await sent('receipt', { image: jpeg, items })).max_tokens).toBe(RECEIPT_MAX_TOKENS);
    expect(RECEIPT_MAX_TOKENS).toBe(3000 + THINKING_ROOM);
  });

  it('bounds thinking with an effort on the default models, and sends none to a model that would reject it', async () => {
    for (const [path, body] of [['label', { image: jpeg }], ['supplement', { image: jpeg }], ['receipt', { image: jpeg, items }]] as const) expect((await sent(path, body)).output_config).toEqual({ effort: SCAN_EFFORT });
    for (const m of [DEFAULT_MODEL, DEFAULT_RECEIPT_MODEL, DEFAULT_SUPPLEMENT_MODEL, 'claude-opus-5-5', 'claude-sonnet-5']) expect(takesEffort(m)).toBe(true);
    for (const m of ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku', 'claude-haiku-5-5-preview', '']) expect(takesEffort(m)).toBe(false);
    expect((await sent('label', { image: jpeg }, { model: 'claude-haiku-4-5' })).output_config).toBeUndefined();
  });

  it('waits longer than the resolver but less than the 120 s request limit', () => {
    expect(SCAN_TIMEOUT_MS).toBeGreaterThan(30_000);
    expect(SCAN_TIMEOUT_MS).toBeLessThan(120_000);
  });

  it('throws a named error that carries the tokens of a reply that did not end its turn', async () => {
    const cut = async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', usage: { input_tokens: 900, output_tokens: 4850 }, content: [{ type: 'text', text: '{"kcal":1' }] }), { status: 200 });
    const err = await askModel(cut as unknown as typeof fetch, 'k', 'm', jpeg, { system: 's', text: 't', maxTokens: 10 }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('stopped: max_tokens');
    expect((err as { spent?: unknown }).spent).toEqual({ inputTokens: 900, outputTokens: 4850 });
    const none = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }] }), { status: 200 });
    await expect(askModel(none as unknown as typeof fetch, 'k', 'm', jpeg, { system: 's', text: 't', maxTokens: 10 })).rejects.toThrow('stopped: unknown');
  });

  it('asks once more when a reply ends its turn with no text block, and logs the block types only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thinkingOnly = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'thinking', thinking: 'SECRET-THOUGHT' }] }), { status: 200 });
    const ask = vi.fn().mockResolvedValueOnce(thinkingOnly()).mockResolvedValueOnce(model('{"ok":1}'));
    const efforts = () => ask.mock.calls.map(c => (JSON.parse((c[1] as { body: string }).body).output_config ?? {}).effort);
    expect(await askModel(ask as unknown as typeof fetch, 'k', 'm', jpeg, { system: 's', text: 't', maxTokens: 10 })).toBe('{"ok":1}');
    expect(ask).toHaveBeenCalledTimes(2);
    expect(efforts()).toEqual([undefined, undefined]); // model 'm' takes no effort field
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('thinking');
    expect(logged).not.toContain('SECRET-THOUGHT');
    const empty = vi.fn(async () => thinkingOnly());
    const err = await askModel(empty as unknown as typeof fetch, 'k', 'm', jpeg, { system: 's', text: 't', maxTokens: 10 }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('no text in reply');
    expect(empty).toHaveBeenCalledTimes(2);
    expect((err as { spent?: unknown }).spent).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  it('retries a thinking-only reply at lower effort, and an error on the retry keeps the first call\'s spend', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thinkingOnly = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'thinking', thinking: 'x' }] }), { status: 200 });
    const ask = vi.fn().mockResolvedValueOnce(thinkingOnly()).mockResolvedValueOnce(model('{"ok":1}'));
    await askModel(ask as unknown as typeof fetch, 'k', 'claude-sonnet-5-5', jpeg, { system: 's', text: 't', maxTokens: 10 });
    expect(ask.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body).output_config.effort)).toEqual([SCAN_EFFORT, 'low']);
    const aborted = vi.fn().mockResolvedValueOnce(thinkingOnly()).mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const err = await askModel(aborted as unknown as typeof fetch, 'k', 'm', jpeg, { system: 's', text: 't', maxTokens: 10 }).catch((e: unknown) => e);
    expect((err as Error).name).toBe('TimeoutError');
    expect((err as { spent?: unknown }).spent).toEqual({ inputTokens: 100, outputTokens: 50 });
    const first = vi.fn().mockRejectedValueOnce(new Error('boom'));
    expect(((await askModel(first as unknown as typeof fetch, 'k', 'm', jpeg, { system: 's', text: 't', maxTokens: 10 }).catch((e: unknown) => e)) as { spent?: unknown }).spent).toBeUndefined();
  });

  const cutReply = async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"kcal":1' }] }), { status: 200 });
  it.each([
    ['label', { image: jpeg }],
    ['supplement', { image: jpeg }],
    ['receipt', { image: jpeg, items }],
  ] as const)('answers the %s route as not available when the reply was cut off', async (path, body) => {
    const post = await start({ key: 'k', fetch: cutReply as unknown as typeof fetch }, path);
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, why: 'upstream' });
  });
});
