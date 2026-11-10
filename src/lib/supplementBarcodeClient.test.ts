import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupSupplementBarcode } from './supplementBarcodeClient.js';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lookupSupplementBarcode', () => {
  it('asks the route with the digits and returns the product, trimmed', async () => {
    const ask = reply(200, { ok: true, name: '  Green Vibrance ', brand: ' Vibrant Health ' });
    vi.stubGlobal('fetch', ask);
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: true, product: { name: 'Green Vibrance', brand: 'Vibrant Health' } });
    expect(String((ask.mock.calls[0] as unknown[])[0])).toBe('/api/supplement-barcode/074306800046');
  });
  it('leaves the brand out when there is none', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, name: 'Plain' }));
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: true, product: { name: 'Plain' } });
  });
  it('says not found only for the route’s own 404, and unavailable for a 404 from a route that is not mounted', async () => {
    vi.stubGlobal('fetch', reply(404, { ok: false, why: 'not-found' }));
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: false, reason: 'notfound' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 404 })));
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('maps the daily cap, a failing service, a nameless answer and no connection to their own reasons', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', reply(429, {}));
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: false, reason: 'limit' });
    vi.stubGlobal('fetch', reply(503, { ok: false, why: 'upstream' }));
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', reply(200, { ok: true, name: '  ' }));
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await lookupSupplementBarcode('074306800046')).toEqual({ ok: false, reason: 'offline' });
  });
});
