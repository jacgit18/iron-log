import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import type { DsldHit } from './catalogImport.ts';
import { dsldAliases } from './catalogImport.ts';
import { crawlScope, crawlUpcs, importUpcs, isPriorityBrand, PRIORITY_BRANDS, slimHit, upcOfLabel } from './supplementUpcImport.ts';

const hit = (id: string, name: string, entryDate = '2020-01-01', brand = 'Brand'): DsldHit => ({ _id: id, _source: { fullName: name, brandName: brand, physicalState: { langualCodeDescription: 'Tablet' }, entryDate } });
const labels = (upcs: Record<string, string | null | Error>) => async (id: string) => {
  const u = upcs[id];
  if (u instanceof Error) throw u;
  return u === undefined ? null : u === null ? { id } : { id, upcSku: u };
};

describe('upcOfLabel', () => {
  it('reads NIH\'s spaced UPC as 14 digits and refuses a missing, wrong or non-code value', () => {
    expect(upcOfLabel({ upcSku: '0 74306 80004 6' })).toBe('00074306800046');
    expect(upcOfLabel({ upcSku: '074306800046' })).toBe('00074306800046');
    for (const bad of [{}, null, { upcSku: '' }, { upcSku: '0 74306 80004 7' }, { upcSku: 'N/A' }, { upcSku: 5 }, 'x']) expect(upcOfLabel(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('crawlUpcs', () => {
  const hits = [hit('20', 'Mega Men', '2016-02-03'), hit('21', 'Mega Men', '2016-09-09'), hit('300', 'Mega Men', '2020-05-01'), hit('5', 'Zinc'), hit('6', 'Biotin')];
  it('points each UPC at the row kept for its label, and counts labels with none', async () => {
    const r = await crawlUpcs(hits, { fetchLabel: labels({ '20': '0 74306 80004 6', '21': '031604026509', '300': '4006381333931', '5': null, '6': '' }) });
    expect([...r.pairs]).toEqual([['00074306800046', 'c:dsld:20'], ['00031604026509', 'c:dsld:20'], ['04006381333931', 'c:dsld:300']]);
    expect(r).toMatchObject({ read: 5, withoutUpc: 2, failed: [], asked: 5, shared: 0 });
  });
  it('lets the newest label win a UPC that two labels carry', async () => {
    const r = await crawlUpcs(hits, { fetchLabel: labels({ '20': '031604026509', '300': '0 31604 02650 9' }) });
    expect(r.pairs.get('00031604026509')).toBe('c:dsld:300');
    expect(r.shared).toBe(1);
  });
  it('resumes from what an earlier run read, remembers what it learns, and keeps failures out of the pairs', async () => {
    const learned: [string, string | null][] = [];
    const known = new Map([['20', '00074306800046'], ['21', ''], ['300', '']]);
    const r = await crawlUpcs(hits, { fetchLabel: labels({ '5': '4006381333931', '6': new Error('HTTP 500') }), known, learned: (id, upc) => learned.push([id, upc]) });
    expect(learned).toEqual([['5', '04006381333931']]);
    expect(r.asked).toBe(2);
    expect(r.failed).toEqual(['6']);
    expect([...r.pairs.keys()].sort()).toEqual(['00074306800046', '04006381333931']);
  });
  it('asks no more labels than --limit', async () => {
    const asked: string[] = [];
    await crawlUpcs(hits, { fetchLabel: async id => { asked.push(id); return {}; }, limit: 2, concurrency: 1 });
    expect(asked).toEqual(['5', '6']);
  });
});

describe('a crawl limited to a scope', () => {
  const hits = [hit('1', 'Old Fish Oil', '2015-01-01', 'Thorne Research'), hit('2', 'Old Zinc', '2015-01-01', 'Nobody Co'), hit('3', 'New Zinc', '2024-01-01', 'Nobody Co'), hit('4', 'Collagen', '2016-01-01', 'Sports Research'), hit('5', 'New Creatine', '2023-06-01', 'Thorne HealthTech'), hit('6', 'Old Magnesium', '2016-01-01', 'NOW'), hit('7', 'Old Iron', '2016-01-01', 'Nowhere Naturals')];
  const scope = { since: 2022, brands: PRIORITY_BRANDS };
  it('keeps recent labels and every label of a priority brand (a name that starts with it, any case), and drops the rest', () => {
    expect(crawlScope(hits, new Map([['3', '']]), scope)).toEqual({ onMarket: 7, inScope: 5, priorityBrand: 4, cached: 1, toRead: 4 });
    expect(crawlScope(hits, new Map())).toMatchObject({ inScope: 7, priorityBrand: 0 });
  });
  it('matches a brand followed by punctuation, not one that only shares its first letters', () => {
    const brand = (b: string) => isPriorityBrand(hit('9', 'x', '2016-01-01', b), ['pure encapsulations', 'now']);
    expect([brand('Pure Encapsulations, LLC'), brand('NOW®'), brand('NOW Foods'), brand('Nowhere Naturals')]).toEqual([true, true, true, false]);
  });
  it('reads the priority brands first and asks only about labels in scope', async () => {
    const asked: string[] = [];
    const r = await crawlUpcs(hits, { fetchLabel: async id => { asked.push(id); return { upcSku: `0 0000${id}` }; }, scope, concurrency: 1 });
    expect(asked).toEqual(['1', '4', '5', '6', '3']);
    expect(r).toMatchObject({ inScope: 5, asked: 5 });
  });
  it('does not remove rows when it runs limited, and does when it saw every label', async () => {
    const { db, stop } = await startTestDatabase();
    try {
      await db.insertInto('catalog_items').values({ id: 'c:dsld:1', kind: 'supplement', source: 'dsld', license: 'test', name: 'x' }).execute();
      await db.insertInto('supplement_upcs').values({ upc: '00000000000009', catalog_id: 'c:dsld:1' }).execute();
      const pairs = new Map([['00000000000001', 'c:dsld:1']]);
      expect(await importUpcs(db, pairs, { apply: true, prune: false })).toMatchObject({ added: 1, removed: 0 });
      expect(await importUpcs(db, pairs, { apply: true })).toMatchObject({ added: 0, removed: 1 });
    } finally { await stop(); }
  }, 120_000);
  it('keeps the same catalog rows after the results are slimmed for the cache file', () => {
    const full = hits.map(h => ({ ...h, _source: { ...h._source, upcSku: 'x', bigField: 'y'.repeat(500) } }));
    expect([...dsldAliases(hits.map(slimHit))]).toEqual([...dsldAliases(full)]);
    expect(JSON.stringify(slimHit(full[0]!)).length).toBeLessThan(250);
  });
});

describe('importUpcs', () => {
  let db: Kysely<DB>; let stop: () => Promise<void>;
  beforeAll(async () => {
    ({ db, stop } = await startTestDatabase());
    for (const [id, retired] of [['c:dsld:20', false], ['c:dsld:300', false], ['c:dsld:9', true]] as const) {
      await db.insertInto('catalog_items').values({ id, kind: 'supplement', source: 'dsld', license: 'test', name: id, retired_at: retired ? new Date() : null }).execute();
    }
  }, 120_000);
  afterAll(async () => { await stop(); });
  const rows = async () => (await db.selectFrom('supplement_upcs').select(['upc', 'catalog_id']).orderBy('upc').execute()).map(r => [r.upc, r.catalog_id]);

  it('writes nothing on a dry run, then adds, changes and removes on apply, leaving out rows with no live catalog row', async () => {
    const first = new Map([['00000000000001', 'c:dsld:20'], ['00000000000002', 'c:dsld:300'], ['00000000000003', 'c:dsld:9'], ['00000000000004', 'c:dsld:404']]);
    expect(await importUpcs(db, first, { apply: false })).toEqual({ applied: false, added: 2, changed: 0, removed: 0, unchanged: 0, noCatalogRow: 2 });
    expect(await rows()).toEqual([]);
    expect((await importUpcs(db, first, { apply: true })).added).toBe(2);
    expect(await rows()).toEqual([['00000000000001', 'c:dsld:20'], ['00000000000002', 'c:dsld:300']]);
    const second = new Map([['00000000000002', 'c:dsld:20'], ['00000000000005', 'c:dsld:300']]);
    expect(await importUpcs(db, second, { apply: true })).toEqual({ applied: true, added: 1, changed: 1, removed: 1, unchanged: 0, noCatalogRow: 0 });
    expect(await rows()).toEqual([['00000000000002', 'c:dsld:20'], ['00000000000005', 'c:dsld:300']]);
    expect(await importUpcs(db, second, { apply: true })).toMatchObject({ added: 0, changed: 0, removed: 0, unchanged: 2 });
  });
  it('refuses to run with nothing to write, so an empty crawl cannot empty the table', async () => {
    await expect(importUpcs(db, new Map(), { apply: true })).rejects.toThrow(/refusing/);
    expect((await rows()).length).toBe(2);
  });
});
