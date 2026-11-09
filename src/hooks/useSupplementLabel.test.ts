import { describe, expect, it, vi } from 'vitest';
import { fetchSupplementLabel, isDsldCatalogId } from './useSupplementLabel.js';

const label = { name: 'x', serving: null, rows: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'nope', amount: 1, unit: 'mg' }], other: [] };
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('fetchSupplementLabel', () => {
  it('asks the route for the catalog id and cleans the answer', async () => {
    const f = reply({ ok: true, label });
    const r = await fetchSupplementLabel('c:dsld:320047', f);
    expect(r).toEqual({ status: 'ready', label: { name: 'x', serving: null, rows: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }], other: [] } });
    expect(String((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toBe('/api/supplement-label/c%3Adsld%3A320047');
  });
  it('says not-found for a 404 and unavailable for any other failure or a body that is not a label', async () => {
    expect(await fetchSupplementLabel('c:dsld:1', reply({}, 404))).toEqual({ status: 'failed', reason: 'not-found' });
    expect(await fetchSupplementLabel('c:dsld:1', reply({}, 503))).toEqual({ status: 'failed', reason: 'unavailable' });
    expect(await fetchSupplementLabel('c:dsld:1', reply({ ok: true, label: 'junk' }))).toEqual({ status: 'failed', reason: 'unavailable' });
    expect(await fetchSupplementLabel('c:dsld:1', (async () => { throw new Error('net'); }) as unknown as typeof fetch)).toEqual({ status: 'failed', reason: 'offline' });
  });
  it('only DSLD catalog ids are asked for', () => {
    expect(isDsldCatalogId('c:dsld:320047')).toBe(true);
    for (const bad of ['c:exrx:5', 'c:dsld:', 'creatine', null, undefined]) expect(isDsldCatalogId(bad)).toBe(false);
  });
});
