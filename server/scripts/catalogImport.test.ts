import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { FEDB_EQUIPMENT, FEDB_MUSCLES, fetchDsld, importCatalog, mapDsld, mapFedb, type CatalogRow, type DsldHit } from './catalogImport.ts';

// A few rows shaped like free-exercise-db's exercises.json.
const ex = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id.replace(/_/g, ' '), force: 'push', level: 'beginner', mechanic: 'compound', equipment: 'barbell',
  primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'], instructions: ['Stand.', 'Squat.'], category: 'strength', images: [`${id}/0.jpg`], ...over,
});

describe('mapFedb', () => {
  it('maps a row to a c:fedb: exercise with the app\'s equipment and muscle names, and no images', () => {
    const { rows, unmapped, skipped } = mapFedb([ex('Barbell_Squat')]);
    expect(rows).toEqual([{
      id: 'c:fedb:Barbell_Squat', kind: 'exercise', name: 'Barbell Squat', brand: null,
      data: { eq: 'barbell', muscles: { p: ['quads'], s: ['glutes'] }, force: 'push', mechanic: 'compound', level: 'beginner', category: 'strength', instructions: ['Stand.', 'Squat.'] },
    }]);
    expect(unmapped).toEqual({});
    expect(skipped).toEqual([]);
  });

  it('makes a stretching row a stretch, tagged mob so it does not count toward muscle volume', () => {
    const [stretch] = mapFedb([ex('Calf_Stretch', { category: 'stretching', primaryMuscles: ['calves'], secondaryMuscles: [] })]).rows;
    expect(stretch!.kind).toBe('stretch');
    expect(stretch!.data.muscles).toEqual({ p: ['calves'], mob: true });
    const [jump] = mapFedb([ex('Box_Jump', { category: 'plyometrics' })]).rows;
    expect(jump!.kind).toBe('exercise');
    expect(jump!.data.muscles).not.toHaveProperty('mob');
  });

  it('does not match inherited names: constructor or toString is reported, not used', () => {
    const { rows, unmapped } = mapFedb([ex('Odd', { equipment: 'constructor', primaryMuscles: ['toString'], secondaryMuscles: ['constructor'] })]);
    expect(rows[0]!.data).toMatchObject({ eq: 'other', muscles: {} });
    expect(unmapped).toEqual({ 'equipment:constructor': 1, 'muscle:toString': 1, 'muscle:constructor': 1 });
  });

  it('every dataset muscle and equipment value seen at the pinned commit has an entry (neck excepted)', () => {
    expect(Object.keys(FEDB_MUSCLES).sort()).toEqual(['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings',
      'lats', 'lower back', 'middle back', 'quadriceps', 'shoulders', 'traps', 'triceps']);
    expect(Object.keys(FEDB_EQUIPMENT).sort()).toEqual(['bands', 'barbell', 'body only', 'cable', 'dumbbell', 'e-z curl bar', 'exercise ball', 'foam roll',
      'kettlebells', 'machine', 'medicine ball', 'other']);
  });

  it('shoulders counts for front and side delts; a muscle in both lists stays primary only', () => {
    const { rows } = mapFedb([ex('Press', { primaryMuscles: ['shoulders'], secondaryMuscles: ['shoulders', 'triceps'] })]);
    expect(rows[0]!.data.muscles).toEqual({ p: ['frontdelt', 'sidedelt'], s: ['triceps'] });
  });

  it('reports values it cannot map instead of guessing: unknown equipment becomes Other, an unknown muscle is left out', () => {
    const { rows, unmapped } = mapFedb([ex('Neck_Curl', { equipment: 'hover board', primaryMuscles: ['neck'], secondaryMuscles: [] }), ex('Shrug', { primaryMuscles: ['neck', 'traps'] })]);
    expect(rows[0]!.data).toMatchObject({ eq: 'other', muscles: {} });
    expect(rows[1]!.data.muscles).toEqual({ p: ['traps'], s: ['glutes'] });
    expect(unmapped).toEqual({ 'equipment:hover board': 1, 'muscle:neck': 2 });
  });

  it('keeps no equipment, force or mechanic as null (shown blank), not Other', () => {
    expect(mapFedb([ex('Plank', { equipment: null, force: null, mechanic: null })]).rows[0]!.data).toMatchObject({ eq: null, force: null, mechanic: null });
  });

  it('skips rows with a bad or repeated id or no name, and refuses a file that is not a list', () => {
    const { rows, skipped } = mapFedb([ex('A'), ex('A'), ex('has space'), { ...ex('B'), name: ' ' }, null]);
    expect(rows.map(r => r.id)).toEqual(['c:fedb:A']);
    expect(skipped).toEqual(['A: duplicate id', 'bad id: "has space"', 'B: bad name', 'bad id: undefined']);
    expect(() => mapFedb({ exercises: [] })).toThrow(/array/);
  });

  // Cards and log rows keep an id of at most 100 characters (src/shared/validate.ts); the longest id at the pinned commit is 58.
  it('keeps a dataset id of up to 90 characters, so a c:fedb: id fits in 100, and skips a longer one', () => {
    const long = 'a'.repeat(90);
    const { rows, skipped } = mapFedb([ex(long), ex('b'.repeat(91))]);
    expect(rows.map(r => r.id)).toEqual([`c:fedb:${long}`]);
    expect(rows[0]!.id.length).toBeLessThanOrEqual(100);
    expect(skipped).toEqual([`bad id: "${'b'.repeat(91)}"`]);
  });
});

// A fake DSLD API: products with an entry year, a form and a type; it answers counts and pages like search-filter, capped at 10,000.
function fakeDsld(products: { id: string; year: number; form: string; type: string }[], { drop = '' } = {}) {
  const calls: string[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url);
    const q = new URL(url).searchParams;
    const match = products.filter(p => (!q.get('date_start') || p.year === Number(q.get('date_start')))
      && (!q.get('supplement_form') || p.form === q.get('supplement_form')) && (!q.get('product_type') || p.type === q.get('product_type')));
    const from = Number(q.get('from') ?? 0); const size = Number(q.get('size') ?? 1000);
    const page = from + size > 10_000 ? [] : match.slice(from, from + size).filter(p => p.id !== drop);
    return { stats: { count: match.length }, hits: page.map(p => ({ _id: p.id, _source: { fullName: `Product ${p.id}`, brandName: 'Acme', physicalState: { langualCodeDescription: 'Capsule' } } })) };
  };
  return { fetchJson, calls };
}
const many = (n: number, year: number, form = 'e0159', type = 'a1305', start = 0) => Array.from({ length: n }, (_, i) => ({ id: String(start + i + 1), year, form, type }));

describe('fetchDsld', () => {
  it('reads every product, a year at a time, splitting a year that is too big by form', async () => {
    const products = [...many(1500, 2011), ...many(6000, 2020, 'e0159', 'a1305', 10_000), ...many(5000, 2020, 'e0162', 'a1305', 20_000)];
    const { fetchJson, calls } = fakeDsld(products);
    const hits = await fetchDsld({ fetchJson, years: [2010, 2021] });
    expect(hits).toHaveLength(12_500);
    expect(new Set(hits.map(h => h._id)).size).toBe(12_500);
    expect(calls.some(u => u.includes('date_start=2020') && u.includes('supplement_form=e0162'))).toBe(true);
    expect(calls.every(u => u.includes('status=1'))).toBe(true); // on-market only
  });

  it('splits a form that is still too big by product type', async () => {
    const products = [...many(6000, 2024, 'e0159', 'a1305'), ...many(4000, 2024, 'e0159', 'a1306', 6000)];
    expect(await fetchDsld({ fetchJson: fakeDsld(products).fetchJson, years: [2024, 2024] })).toHaveLength(10_000);
  });

  it('refuses a download that comes back short, before anything could be written', async () => {
    await expect(fetchDsld({ fetchJson: fakeDsld(many(50, 2015), { drop: '7' }).fetchJson, years: [2015, 2015] })).rejects.toThrow(/says 50 products but returned 49/);
    // products outside the years read: the slices do not add up to the total
    await expect(fetchDsld({ fetchJson: fakeDsld([...many(5, 2015), ...many(3, 1999, 'e0159', 'a1305', 100)]).fetchJson, years: [2000, 2016] })).rejects.toThrow(/8 on-market products, but the slices add up to 5/);
    await expect(fetchDsld({ fetchJson: async () => ({}), years: [2015, 2015] })).rejects.toThrow(/no count/);
  });
});

describe('mapDsld', () => {
  it('keeps one row per product: the same name, brand and form (any case) under several labels becomes the lowest id', () => {
    const hit = (id: string, fullName: string, brandName: string, form: string) => ({ _id: id, _source: { fullName, brandName, physicalState: { langualCodeDescription: form } } }) as DsldHit;
    const { rows, skipped } = mapDsld([
      hit('900', 'Creatine Monohydrate', 'NOW Sports', 'Powder'), hit('12', 'creatine monohydrate', 'NOW sports', 'Powder'),
      hit('40', 'Creatine Monohydrate', 'NOW Sports', 'Capsule'), hit('7', 'Creatine Monohydrate', 'Other Brand', 'Powder'),
    ]);
    expect(rows.map(r => r.id)).toEqual(['c:dsld:12', 'c:dsld:40', 'c:dsld:7']);
    expect(skipped).toEqual(['1 more labels of a product already listed (same name, brand and form)']);
  });
  it('keeps id, name, brand and form only, and skips what it cannot use', () => {
    const hit = (id: unknown, src: Record<string, unknown>) => ({ _id: id, _source: src }) as DsldHit;
    const { rows, skipped } = mapDsld([
      hit('43261', { fullName: ' Creatine Alkaline ', brandName: 'BPI Sports', physicalState: { langualCodeDescription: 'Capsule' }, allIngredients: [{ name: 'Creatine' }], servingSizes: [] }),
      hit('5', { fullName: 'No Brand' }),
      hit('5', { fullName: 'Again' }), hit('x1', { fullName: 'Bad id' }), hit('6', { fullName: '' }),
    ]);
    expect(rows).toEqual([
      { id: 'c:dsld:43261', kind: 'supplement', name: 'Creatine Alkaline', brand: 'BPI Sports', data: { form: 'Capsule' } },
      { id: 'c:dsld:5', kind: 'supplement', name: 'No Brand', brand: null, data: {} },
    ]);
    expect(skipped).toEqual(['5: duplicate id', 'bad id: "x1"', '6: bad name']);
  });
});

describe('importCatalog', () => {
  let db: Kysely<DB>;
  let stop: () => Promise<void>;
  beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
  afterAll(async () => { await stop?.(); });
  beforeEach(async () => { await db.deleteFrom('catalog_items').execute(); });

  const rows = (...ids: string[]): CatalogRow[] => mapFedb(ids.map(id => ex(id))).rows;
  const run = (list: CatalogRow[], apply = true, allowMassRetire = false) => importCatalog(db, { source: 'fedb', license: 'Unlicense', rows: list, apply, allowMassRetire });
  const all = () => db.selectFrom('catalog_items').selectAll().orderBy('id').execute();

  it('adds every row, and a second run over the same list changes nothing', async () => {
    const list = rows('A', 'B', 'C');
    expect(await run(list)).toMatchObject({ applied: true, added: ['c:fedb:A', 'c:fedb:B', 'c:fedb:C'], changed: [], retired: [], unchanged: 0 });
    const before = await all();
    expect(before.map(r => [r.id, r.source, r.license, r.kind])).toEqual([['c:fedb:A', 'fedb', 'Unlicense', 'exercise'], ['c:fedb:B', 'fedb', 'Unlicense', 'exercise'], ['c:fedb:C', 'fedb', 'Unlicense', 'exercise']]);
    expect(await run(list)).toMatchObject({ added: [], changed: [], retired: [], unchanged: 3 });
    expect(await all()).toEqual(before);
  });

  it('a dry run reports what it would do and writes nothing', async () => {
    expect(await run(rows('A', 'B'), false)).toMatchObject({ applied: false, added: ['c:fedb:A', 'c:fedb:B'] });
    expect(await all()).toEqual([]);
    await run(rows('A', 'B', 'C', 'D', 'E'));
    const before = await all();
    const changed = rows('A', 'B', 'C', 'D');
    changed[0] = { ...changed[0]!, name: 'Renamed' };
    expect(await run(changed, false)).toMatchObject({ changed: ['c:fedb:A'], retired: ['c:fedb:E'] });
    expect(await all()).toEqual(before);
  });

  it('updates a changed row in place: same id, new name and data', async () => {
    await run(rows('A'));
    const [a] = rows('A');
    expect(await run([{ ...a!, name: 'Back Squat', data: { ...a!.data, eq: 'trapbar' } }])).toMatchObject({ changed: ['c:fedb:A'] });
    expect((await all()).map(r => [r.id, r.name, (r.data as { eq: string }).eq])).toEqual([['c:fedb:A', 'Back Squat', 'trapbar']]);
  });

  it('retires a row missing upstream instead of deleting it, and restores it when it comes back', async () => {
    await run(rows('A', 'B', 'C', 'D', 'E'));
    expect(await run(rows('A', 'B', 'C', 'D'))).toMatchObject({ retired: ['c:fedb:E'], unchanged: 4 });
    const e = (await all()).find(r => r.id === 'c:fedb:E')!;
    expect(e.retired_at).not.toBeNull();
    expect(await run(rows('A', 'B', 'C', 'D'))).toMatchObject({ retired: [], unchanged: 4 }); // already retired: not again
    expect(await run(rows('A', 'B', 'C', 'D', 'E'))).toMatchObject({ changed: ['c:fedb:E'] });
    expect((await all()).find(r => r.id === 'c:fedb:E')!.retired_at).toBeNull();
  });

  it('refuses to retire more than a fifth of the live rows unless told to, and refuses an empty list', async () => {
    await run(rows('A', 'B', 'C', 'D', 'E'));
    await expect(run(rows('A', 'B', 'C'))).rejects.toThrow(/would retire 2 of 5/);
    expect((await all()).every(r => !r.retired_at)).toBe(true);
    expect(await run(rows('A', 'B', 'C'), true, true)).toMatchObject({ retired: ['c:fedb:D', 'c:fedb:E'] });
    await expect(run([])).rejects.toThrow(/empty/);
  });

  it('leaves other sources alone, and refuses a row of another source', async () => {
    await db.insertInto('catalog_items').values({ id: 'c:dsld:1', kind: 'supplement', source: 'dsld', license: 'x', name: 'Creatine', brand: 'Acme' }).execute();
    await run(rows('A'));
    await run(rows('B'), true, true);
    expect((await all()).find(r => r.id === 'c:dsld:1')!.retired_at).toBeNull();
    await expect(run([{ ...rows('C')[0]!, id: 'c:dsld:2' }])).rejects.toThrow(/not a c:fedb: id/);
  });
});
