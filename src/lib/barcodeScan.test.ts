import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_LABEL_TEXT, BARCODE_TEXT, barcodeText, lookingText, makeReader, MISS_STEPS, OFF_AFTER_MS, OFF_SOURCE_TEXT, pickGtin, readGtin, SEARCH_BOX_IDS, type BarcodeFailure } from './barcodeScan.js';
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

describe('barcodeText', () => {
  it('says a miss means neither database has it, and gives every other failure its own words', () => {
    expect(barcodeText('notfound')).toBe('That barcode is not in USDA or Open Food Facts.');
    for (const k of ['nodetector', 'camera', 'unreadable', 'offline', 'limit', 'unavailable'] as const) expect(barcodeText(k), k).toBe(BARCODE_TEXT[k]);
  });

  it('moves the looking line from USDA to Open Food Facts after a short wait', () => {
    expect(lookingText(0)).toBe('Checking USDA...');
    expect(lookingText(OFF_AFTER_MS - 1)).toBe('Checking USDA...');
    expect(lookingText(OFF_AFTER_MS)).toBe('Checking Open Food Facts...');
  });

  it('lists the two free sources as tried, in order, and names the boxes Type the name can focus', () => {
    expect(MISS_STEPS).toEqual(['USDA: not found', 'Open Food Facts: not found']);
    expect(SEARCH_BOX_IDS).toEqual(['dt-lookup-q', 'dt-find-q']);
    expect(AI_LABEL_TEXT).toBe('Read from the photo. Check these numbers against the label.');
  });

  it('names Open Food Facts and says to check the label', () => {
    expect(OFF_SOURCE_TEXT).toContain('Open Food Facts');
    expect(OFF_SOURCE_TEXT).toContain('check the numbers against the label');
  });
});

describe('lookupBarcode with a product from Open Food Facts', () => {
  it('keeps the source so the app can show where it came from', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, hit: { id: 7, name: 'Crackers', kcal: 400, p: 7, source: 'off' } }), { status: 200 })));
    expect(await lookupBarcode('00000000000017')).toEqual({ ok: true, hit: { id: 7, name: 'Crackers', kcal: 400, p: 7, source: 'off' } });
  });
});
