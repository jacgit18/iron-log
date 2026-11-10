import { describe, expect, it } from 'vitest';
import type { CatalogItem, SupplementItem } from '../types.ts';
import { catalogLine, mineOption, newestFirst, oneOfEach, upcLine } from './supplementResultLine.js';

const cat = (id: string, data: CatalogItem['data'], brand?: string): CatalogItem => ({ id, name: 'Mega Men', ...(brand ? { brand } : {}), data });

describe('catalogLine', () => {
  it('says brand, form and label year, so two listings of one product differ', () => {
    expect(catalogLine(cat('c:dsld:1', { form: 'Tablet', entryYear: 2020 }, 'Nature Made'))).toBe('Nature Made · Tablet · 2020 label');
    expect(catalogLine(cat('c:dsld:2', { form: 'Tablet', entryYear: 2016 }, 'Nature Made'))).toBe('Nature Made · Tablet · 2016 label');
  });
  it('leaves out what the import has not stored yet, and says No brand when nothing is known', () => {
    expect(catalogLine(cat('c:dsld:3', { form: 'Capsule' }, 'NOW'))).toBe('NOW · Capsule');
    expect(catalogLine(cat('c:dsld:4', {}))).toBe('No brand');
  });
});

describe('upcLine', () => {
  it('shows the UPC only when there is one', () => {
    expect(upcLine(cat('c:dsld:1', { upc: '031604026505' }))).toBe('UPC 031604026505');
    expect(upcLine(cat('c:dsld:1', {}))).toBe('');
  });
});

describe('newestFirst', () => {
  it('puts the newest label first and keeps the server order for equal years', () => {
    const a = cat('a', { entryYear: 2016 }), b = cat('b', { entryYear: 2020 }), c = cat('c', {}), d = cat('d', { entryYear: 2020 });
    expect(newestFirst([a, b, c, d]).map(x => x.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('mineOption and oneOfEach', () => {
  const fish: SupplementItem = { id: 'f1', n: 'Fish Oil', brand: 'NOW', slot: 'morning', dose: '1 g', catalogId: 'c:dsld:5' };
  const fish2: SupplementItem = { ...fish, id: 'f2', slot: 'night' };
  const mine: SupplementItem = { id: 'm', n: 'Mine', slot: '' };
  it('badges Library or Custom only when syncing and says where it is', () => {
    expect(mineOption(fish, true)).toMatchObject({ meta: 'NOW · In Morning · 1 g', badge: 'Library' });
    expect(mineOption(mine, true)).toMatchObject({ meta: 'Library only', badge: 'Custom' });
    expect(mineOption(mine, false)).not.toHaveProperty('badge');
  });
  it('lists a supplement once however many times of day it is taken', () => {
    expect(oneOfEach([fish, fish2, mine]).map(i => i.id)).toEqual(['f1', 'm']);
  });
});
