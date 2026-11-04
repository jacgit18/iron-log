import { afterEach, describe, expect, it, vi } from 'vitest';
import { BARCODE_TEXT, makeReader, pickGtin, readGtin, type BarcodeFailure } from './barcodeScan.js';
import { lookupBarcode } from './foodsClient.js';

// The phone's side of the barcode scan (brief barcode-scan): which reading counts as a product code, what the browser's reader is asked for, how the server's
// answer is read, and the words for each way it can end. The camera itself is the owner's check on a phone.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('pickGtin', () => {
  it('takes the first reading that is a valid product code, as 14 digits, and skips QR codes and misreads', () => {
    expect(pickGtin([{ rawValue: 'https://example.com', format: 'qr_code' }, { rawValue: '016000275288', format: 'upc_a' }, { rawValue: '016000275287', format: 'upc_a' }])).toBe('00016000275287');
  });
  it('expands UPC-E and reads nothing from junk', () => {
    expect(pickGtin([{ rawValue: '01234565', format: 'upc_e' }])).toBe('00012345000065');
    expect(pickGtin([])).toBeNull();
    expect(pickGtin([{ rawValue: 5, format: 7 }, {}])).toBeNull();
  });
});

describe('readGtin', () => {
  it('reads a frame, and treats a reader that throws as a frame with no code', async () => {
    expect(await readGtin({ detect: async () => [{ rawValue: '4006381333931', format: 'ean_13' }] }, {} as ImageBitmapSource)).toBe('04006381333931');
    expect(await readGtin({ detect: async () => { throw new Error('not ready'); } }, {} as ImageBitmapSource)).toBeNull();
  });
});

describe('makeReader', () => {
  it('is null where the browser has no reader', async () => {
    expect(await makeReader()).toBeNull(); // node: no window
    vi.stubGlobal('window', {});
    expect(await makeReader()).toBeNull();
  });
  it('asks only for the grocery formats the browser supports, and is null when it supports none', async () => {
    const seen: string[][] = [];
    class Fake { static getSupportedFormats = async () => ['qr_code', 'ean_13', 'upc_a']; constructor(o: { formats: string[] }) { seen.push(o.formats); } detect = async () => []; }
    vi.stubGlobal('window', { BarcodeDetector: Fake });
    expect(await makeReader()).toBeInstanceOf(Fake);
    expect(seen).toEqual([['ean_13', 'upc_a']]);
    class QrOnly { static getSupportedFormats = async () => ['qr_code']; detect = async () => []; }
    vi.stubGlobal('window', { BarcodeDetector: QrOnly });
    expect(await makeReader()).toBeNull();
  });
});

describe('lookupBarcode', () => {
  const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  it('asks our admin route with the code and returns the checked product', async () => {
    const ask = answer(200, { ok: true, hit: { id: 2, name: 'Cheerios Cereal', kcal: 380, p: 10, serving: 28 } });
    vi.stubGlobal('fetch', ask);
    expect(await lookupBarcode('00016000275287')).toEqual({ ok: true, hit: { id: 2, name: 'Cheerios Cereal', kcal: 380, p: 10, serving: 28 } });
    expect((ask.mock.calls[0] as unknown as [string])[0]).toBe('/api/foods/barcode/00016000275287');
  });
  it('says notfound only for the route’s own 404, limit on 429, unavailable otherwise, offline with no network', async () => {
    vi.stubGlobal('fetch', answer(404, { ok: false, why: 'not-found' })); expect(await lookupBarcode('00016000275287')).toEqual({ ok: false, reason: 'notfound' });
    vi.stubGlobal('fetch', answer(404, '<html>')); expect(await lookupBarcode('00016000275287')).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', answer(429)); expect(await lookupBarcode('00016000275287')).toEqual({ ok: false, reason: 'limit' });
    vi.stubGlobal('fetch', answer(503, { ok: false, why: 'no-key' })); expect(await lookupBarcode('00016000275287')).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', answer(200, { ok: true, hit: { id: 1, name: 'Bad', kcal: -1, p: 1 } })); expect(await lookupBarcode('00016000275287')).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); })); expect(await lookupBarcode('00016000275287')).toEqual({ ok: false, reason: 'offline' });
  });
});

describe('BARCODE_TEXT', () => {
  it('has plain words for every way a scan can end', () => {
    const all: BarcodeFailure[] = ['nodetector', 'camera', 'unreadable', 'notfound', 'offline', 'limit', 'unavailable'];
    for (const k of all) expect(BARCODE_TEXT[k].length, k).toBeGreaterThan(10);
  });
});
