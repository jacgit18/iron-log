import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentAllowance, resetAllowance } from './labelAllowance.js';
import { asIsJpegBase64, fitSize, MAX_SIDE, RECEIPT_TEXT, SCAN_TEXT, scanLabel, scanReceipt, scanSupplement, SUPPLEMENT_SCAN_TEXT } from './scanPhoto.js';
import { currentSupplementAllowance, resetSupplementAllowance } from './supplementAllowance.js';

describe('fitSize', () => {
  it('shrinks the long side to the maximum and keeps the shape', () => {
    expect(fitSize(4000, 3000)).toEqual({ w: MAX_SIDE, h: 1200 });
    expect(fitSize(3000, 4000)).toEqual({ w: 1200, h: MAX_SIDE });
  });
  it('never enlarges a small photo', () => {
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
  it('never returns a zero side', () => {
    expect(fitSize(100000, 1)).toEqual({ w: MAX_SIDE, h: 1 });
  });
});

describe('SCAN_TEXT', () => {
  it('has words for every failure and both empty results', () => {
    for (const k of ['offline', 'limit', 'unavailable', 'photo', 'unreadable', 'per100g'] as const) expect(SCAN_TEXT[k].length).toBeGreaterThan(10);
  });
});

describe('scanLabel', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { fetch: g.fetch, createImageBitmap: g.createImageBitmap, document: g.document, __APP_VERSION__: g.__APP_VERSION__ };
  const BYTES = 300_000; // more than the 0x8000 chunks the base64 step works in
  let sent: { image: string } | null;
  const stubBrowser = () => {
    g.__APP_VERSION__ = 'test';
    g.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
    g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (done: (b: Blob) => void) => done(new Blob([new Uint8Array(BYTES).fill(0xff)])) }) };
  };
  const answer = (status: number, body: unknown = {}) => { g.fetch = async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(JSON.stringify(body), { status }); }; };
  beforeEach(() => { sent = null; stubBrowser(); });
  afterEach(() => Object.assign(g, saved));

  it('sends the whole shrunk photo as base64 and reads the checked answer', async () => {
    answer(200, { ok: true, result: { kind: 'ok', label: { kcal: 100, p: 2 } } });
    expect(await scanLabel(new Blob(['x']))).toEqual({ ok: true, result: { kind: 'ok', label: { kcal: 100, p: 2 } } });
    expect(atob(sent!.image)).toHaveLength(BYTES); // no byte lost between chunks
  });
  it('remembers the count an answer carries, and a 503 with why cap marks the day used up', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetAllowance();
    answer(200, { ok: true, result: { kind: 'unreadable' }, left: 7, max: 30 });
    await scanLabel(new Blob(['x']));
    expect(currentAllowance()).toEqual({ left: 7, max: 30 });
    answer(503, { ok: false, why: 'cap', retryAfterSec: 60 });
    expect(await scanLabel(new Blob(['x']))).toEqual({ ok: false, reason: 'cap' });
    expect(currentAllowance()).toEqual({ left: 0, max: 30 });
    expect(currentAllowance(Date.now() + 61_000)).toBeNull(); // held only until the server's retry time
    answer(503, { ok: false, why: 'upstream' });
    expect(await scanLabel(new Blob(['x']))).toEqual({ ok: false, reason: 'unavailable' });
    resetAllowance();
  });
  it('maps 429 to limit, other failures to unavailable, a thrown fetch to offline, an unopenable photo to photo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    answer(429); expect(await scanLabel(new Blob(['x']))).toEqual({ ok: false, reason: 'limit' });
    answer(503); expect(await scanLabel(new Blob(['x']))).toEqual({ ok: false, reason: 'unavailable' });
    g.fetch = async () => { throw new TypeError('network'); };
    expect(await scanLabel(new Blob(['x']))).toEqual({ ok: false, reason: 'offline' });
    g.createImageBitmap = async () => { throw new Error('bad image'); };
    expect(await scanLabel(new Blob(['x']))).toEqual({ ok: false, reason: 'photo' });
  });
});

describe('SUPPLEMENT_SCAN_TEXT', () => {
  it('has plain words for every failure and the unreadable result, and the add never depends on the scan', () => {
    for (const k of ['offline', 'limit', 'unavailable', 'photo', 'unreadable', 'cap', 'check'] as const) expect(SUPPLEMENT_SCAN_TEXT[k].length).toBeGreaterThan(10);
    expect(SUPPLEMENT_SCAN_TEXT.unreadable).toBe('Could not read the amounts. Try a closer, flatter photo, or type them in the supplement\u2019s sheet.');
    expect(SUPPLEMENT_SCAN_TEXT.cap).toBe('Bottle scans are used up for today. Type the amounts instead.');
    expect(SUPPLEMENT_SCAN_TEXT.check).toBe('Read from your photo. Check each amount against the bottle.');
  });
});

describe('scanSupplement', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { fetch: g.fetch, createImageBitmap: g.createImageBitmap, document: g.document, __APP_VERSION__: g.__APP_VERSION__ };
  let url = '';
  const answer = (status: number, body: unknown = {}) => { g.fetch = async (u: string) => { url = u; return new Response(JSON.stringify(body), { status }); }; };
  beforeEach(() => {
    g.__APP_VERSION__ = 'test';
    g.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
    g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (done: (b: Blob) => void) => done(new Blob([new Uint8Array(1000).fill(0xff)])) }) };
    resetSupplementAllowance(); vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { Object.assign(g, saved); resetSupplementAllowance(); });

  it('posts to the supplement route, re-checks the label and remembers the count', async () => {
    answer(200, { ok: true, result: { kind: 'ok', label: { name: 'D', serving: null, rows: [{ key: 'zinc', amount: 5, unit: 'mg' }, { key: 'bogus', amount: 1, unit: 'mg' }], other: [] } }, left: 4, max: 5 });
    expect(await scanSupplement(new Blob(['x']))).toEqual({ ok: true, result: { kind: 'ok', label: { name: 'D', serving: null, rows: [{ key: 'zinc', amount: 5, unit: 'mg' }], ingredients: [], other: [] } } });
    expect(url).toBe('/api/scan/supplement');
    expect(currentSupplementAllowance()).toEqual({ left: 4, max: 5 });
  });
  it('maps cap, 429, other failures, a thrown fetch and an unopenable photo to plain reasons', async () => {
    answer(503, { ok: false, why: 'cap', retryAfterSec: 60 });
    expect(await scanSupplement(new Blob(['x']))).toEqual({ ok: false, reason: 'cap' });
    expect(currentSupplementAllowance()?.left).toBe(0);
    answer(429); expect(await scanSupplement(new Blob(['x']))).toEqual({ ok: false, reason: 'limit' });
    answer(503, { why: 'no-key' }); expect(await scanSupplement(new Blob(['x']))).toEqual({ ok: false, reason: 'unavailable' });
    g.fetch = async () => { throw new TypeError('network'); };
    expect(await scanSupplement(new Blob(['x']))).toEqual({ ok: false, reason: 'offline' });
    g.createImageBitmap = async () => { throw new Error('bad image'); };
    expect(await scanSupplement(new Blob(['x']))).toEqual({ ok: false, reason: 'photo' });
  });
  it('reads an odd answer as unavailable, never a throw', async () => {
    g.fetch = async () => new Response('not json', { status: 200 });
    expect(await scanSupplement(new Blob(['x']))).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('scanReceipt failures', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { fetch: g.fetch, createImageBitmap: g.createImageBitmap, document: g.document, __APP_VERSION__: g.__APP_VERSION__ };
  const answer = (status: number, body: unknown = {}) => { g.fetch = async () => new Response(JSON.stringify(body), { status }); };
  beforeEach(() => {
    g.__APP_VERSION__ = 'test';
    g.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
    g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (done: (b: Blob) => void) => done(new Blob([new Uint8Array(1000).fill(0xff)])) }) };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { Object.assign(g, saved); vi.restoreAllMocks(); });

  it('tells the daily cap apart from an outage', async () => {
    answer(503, { ok: false, why: 'cap' });
    expect(await scanReceipt(new Blob(['x']), [])).toEqual({ ok: false, reason: 'cap' });
    answer(503, { ok: false, why: 'cap', scope: 'person' });
    expect(await scanReceipt(new Blob(['x']), [])).toEqual({ ok: false, reason: 'cap' });
    answer(503, { ok: false, why: 'cap', scope: 'server' }); // the whole server's ceiling: a neutral message, not "you have used"
    expect(await scanReceipt(new Blob(['x']), [])).toEqual({ ok: false, reason: 'capAll' });
    expect(RECEIPT_TEXT.capAll).toBe('Receipt scans are used up for everyone today. Try again tomorrow, or type the prices.');
    answer(503, { ok: false, why: 'upstream' });
    expect(await scanReceipt(new Blob(['x']), [])).toEqual({ ok: false, reason: 'unavailable' });
    g.fetch = async () => new Response('nope', { status: 503 });
    expect(await scanReceipt(new Blob(['x']), [])).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('asIsJpegBase64 (a saved photo is not re-encoded on Read)', () => {
  it('returns the bytes of a JPEG that fits, unchanged', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(await asIsJpegBase64(new Blob([bytes]))).toBe(btoa(String.fromCharCode(...bytes)));
  });
  it('returns null for something that is not a JPEG or is too big for the route, so it is shrunk as before', async () => {
    expect(await asIsJpegBase64(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]))).toBeNull();
    expect(await asIsJpegBase64({ size: 3_000_000 } as Blob)).toBeNull(); // about 4 MB of base64, over MAX_RECEIPT_BASE64
  });
  it('scanReceipt with asIs sends the saved bytes and skips the canvas', async () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { fetch: g.fetch, v: g.__APP_VERSION__, c: g.createImageBitmap };
    g.__APP_VERSION__ = 'test';
    g.createImageBitmap = async () => { throw new Error('must not re-encode'); };
    let sent = '';
    g.fetch = async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)).image; return new Response('{}', { status: 500 }); };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 9]);
    await scanReceipt(new Blob([bytes]), [], undefined, { asIs: true });
    expect(sent).toBe(btoa(String.fromCharCode(...bytes)));
    Object.assign(g, { fetch: saved.fetch, __APP_VERSION__: saved.v, createImageBitmap: saved.c });
    vi.restoreAllMocks();
  });
});
