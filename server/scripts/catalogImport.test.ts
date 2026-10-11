import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { FEDB_EQUIPMENT, FEDB_MUSCLES, importCatalog, mapFedb, type CatalogRow } from './catalogImport.ts';

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

  it('makes a stretching row a stretch', () => {
    expect(mapFedb([ex('Calf_Stretch', { category: 'stretching' })]).rows[0]!.kind).toBe('stretch');
    expect(mapFedb([ex('Box_Jump', { category: 'plyometrics' })]).rows[0]!.kind).toBe('exercise');
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
