import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentAllowance, resetAllowance } from './labelAllowance.js';
import { fitSize, MAX_SIDE, SCAN_TEXT, scanLabel } from './scanPhoto.js';

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
    answer(503, { ok: false, why: 'cap' });
    expect(await scanLabel(new Blob(['x']))).toEqual({ ok: false, reason: 'cap' });
    expect(currentAllowance()).toEqual({ left: 0, max: 30 });
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
