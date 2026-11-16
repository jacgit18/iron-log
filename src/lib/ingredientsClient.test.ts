import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLines } from './ingredientsClient.js';

// The phone's side of Fill nutrition (brief recipe-auto-nutrition): what is asked, how an answer is checked again, and each way it can fail. Every failure is a reason, never a throw.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
const rice = { line: '100 g rice', status: 'matched', fdcId: 1, food: 'Rice', grams: 100, gramsFrom: 'text', confidence: 'high', per100: { id: 1, name: 'Rice', kcal: 130, p: 2.7 } };

describe('resolveLines', () => {
  it('posts the lines as JSON and returns the cleaned answer with what is left today', async () => {
    const ask = answer(200, { ok: true, lines: [rice, { line: 'salt', status: 'skip' }], left: 4, max: 5 });
    vi.stubGlobal('fetch', ask);
    const r = await resolveLines(['100 g rice', 'salt']);
    expect(r).toMatchObject({ ok: true, left: 4, max: 5 });
    expect(r.ok && r.lines.map(l => l.status)).toEqual(['matched', 'skip']);
    const [url, init] = ask.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ingredients/resolve');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ lines: ['100 g rice', 'salt'] });
  });
  it('a line the check refuses becomes none, and a wrong number of lines makes the answer unusable', async () => {
    vi.stubGlobal('fetch', answer(200, { ok: true, lines: [{ ...rice, grams: 99999 }] }));
    const r = await resolveLines(['100 g rice']);
    expect(r.ok && r.lines[0]!.status).toBe('none');
    vi.stubGlobal('fetch', answer(200, { ok: true, lines: [] }));
    expect(await resolveLines(['100 g rice'])).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('says cap on a 503 with why cap, unavailable on other errors and unreadable answers, offline without a network', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', answer(503, { ok: false, why: 'cap', retryAfterSec: 60 })); expect(await resolveLines(['x'])).toEqual({ ok: false, reason: 'cap', retryAfterSec: 60 });
    vi.stubGlobal('fetch', answer(503, { ok: false, why: 'no-key' })); expect(await resolveLines(['x'])).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', answer(404, '<html>')); expect(await resolveLines(['x'])).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); })); expect(await resolveLines(['x'])).toEqual({ ok: false, reason: 'offline' });
  });
});
