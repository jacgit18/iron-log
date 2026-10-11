import { describe, it, expect } from 'vitest';
import { cleanCatalogItem, fetchCatalog } from './catalog.ts';

const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const none = () => ({});

describe('cleanCatalogItem', () => {
  it('keeps a well-formed item and drops what the app does not know', () => {
    expect(cleanCatalogItem({ id: 'c:fedb:A', name: ' A ', data: { eq: 'barbell', muscles: { p: ['quads', 'wings'], s: [], mob: true }, level: 'beginner', extra: 1 } }))
      .toEqual({ id: 'c:fedb:A', name: 'A', data: { eq: 'barbell', muscles: { p: ['quads'], mob: true }, level: 'beginner' } });
    expect(cleanCatalogItem({ id: 'c:fedb:A', name: 'A', data: { eq: 'constructor' } })).toEqual({ id: 'c:fedb:A', name: 'A', data: {} });
  });
  it('refuses an item without a c: id or a name', () => {
    for (const bad of [null, [], { id: 'squat', name: 'A' }, { id: 'c:fedb:A', name: ' ' }, { id: 'c:' + 'x'.repeat(100), name: 'A' }]) expect(cleanCatalogItem(bad)).toBeNull();
  });
});

describe('fetchCatalog', () => {
  it('returns the cleaned items', async () => {
    const r = await fetchCatalog('exercise', none, reply(200, { ok: true, items: [{ id: 'c:fedb:A', name: 'A', data: {} }, { id: 'bad', name: 'B' }] }));
    expect(r).toEqual({ ok: true, items: [{ id: 'c:fedb:A', name: 'A', data: {} }] });
  });
  it('says refused for 401/403, unreachable for other errors or an odd answer, offline when the request fails', async () => {
    expect(await fetchCatalog('exercise', none, reply(403, {}))).toEqual({ ok: false, reason: 'refused' });
    expect(await fetchCatalog('exercise', none, reply(500, {}))).toEqual({ ok: false, reason: 'unreachable' });
    expect(await fetchCatalog('exercise', none, reply(200, { items: 'no' }))).toEqual({ ok: false, reason: 'unreachable' });
    expect(await fetchCatalog('exercise', none, async () => { throw new TypeError('network'); })).toEqual({ ok: false, reason: 'offline' });
  });
});
