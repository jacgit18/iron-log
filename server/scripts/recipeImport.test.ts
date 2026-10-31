import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '../db/types.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { importCatalog, type CatalogRow } from './catalogImport.ts';
import { WBC_LICENSE, mapWbc, minutesOf, wbcCategory, type WbcRecord } from './recipeImport.ts';

const rec = (over: Partial<WbcRecord['recipe_data']> = {}, filename = 'recipes/recipe_00_001.html'): WbcRecord => ({
  filename,
  recipe_data: {
    title: 'Garlic Dressing', infobox: { category: '/wiki/Category:Salad_dressing_recipes', servings: '4', time: '1 h, 5 minutes' },
    text_lines: [
      { text: 'Intro', line_type: 'p', section: null },
      { text: '1 cup  oil', line_type: 'ul', section: 'Ingredients' },
      { text: 'Whisk.', line_type: 'ol', section: 'Procedure' },
    ],
    ...over,
  },
});

describe('mapWbc', () => {
  it('maps a recipe to a catalog row of kind recipe', () => {
    const { rows, skipped } = mapWbc([rec()]);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([{ id: 'c:wbc:recipe_00_001', kind: 'recipe', name: 'Garlic Dressing', brand: null, data: { recipe: { cat: 'sauces', ing: ['1 cup oil'], steps: ['Whisk.'], servings: 4, minutes: 65 } } }]);
  });
  it('skips a recipe with no ingredients, no procedure, no title or too many lines, and says why', () => {
    const none = rec({ text_lines: [] }, 'recipes/recipe_00_002.html');
    const untitled = rec({ title: '' }, 'recipes/recipe_00_003.html');
    const huge = rec({ text_lines: [...Array.from({ length: 41 }, () => ({ text: 'x', line_type: 'ul', section: 'Ingredients' })), { text: 'Cook.', line_type: 'ol', section: 'Procedure' }] }, 'recipes/recipe_00_004.html');
    const { rows, skipped } = mapWbc([none, untitled, huge]);
    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(3);
  });
  it('gives the same row ids on a second run and skips a repeated file', () => {
    expect(mapWbc([rec(), rec()]).rows).toHaveLength(1);
    expect(mapWbc([rec()]).rows.map(r => r.id)).toEqual(mapWbc([rec()]).rows.map(r => r.id));
  });
  it('reports categories it could not place', () => {
    const { rows, unmapped } = mapWbc([rec({ infobox: { category: '/wiki/Category:Nigerian_recipes' } })]);
    expect(rows[0]!.data.recipe!.cat).toBe('other');
    expect(unmapped).toEqual({ 'category:/wiki/Category:Nigerian_recipes': 1 });
  });
});

describe('wbcCategory', () => {
  it.each([
    ['/wiki/Category:Sauce_recipes', 'sauces'], ['/wiki/Category:Spice_mix_recipes', 'seasonings'], ['/wiki/Category:Beverage_recipes', 'drinks'],
    ['/wiki/Category:Chicken_recipes', 'protein'], ['/wiki/Category:Cake_recipes', 'dessert'], ['/wiki/Category:Rice_recipes', 'carbs'], ['/wiki/Category:Salad_recipes', 'sides'], ['/wiki/Category:Potato_salad_recipes', 'carbs'], ['/wiki/Category:Pasta_salad_recipes', 'carbs'],
    ['/wiki/Category:Soup_recipes', 'other'], [null, 'other'],
    ['/wiki/Category:Steak_recipes', 'protein'], ['/wiki/Category:Goat_recipes', 'other'], ['/wiki/Category:Sweet_potato_recipes', 'carbs'], ['/wiki/Category:Starter_recipes', 'other'], ['/wiki/Category:50%_off', 'other'],
  ])('%s is %s', (slug, cat) => expect(wbcCategory(slug)).toBe(cat));
});

describe('minutesOf', () => {
  it.each([['8 h, 10 minutes', 490], ['45 minutes', 45], ['2 hours', 120], ['soon', undefined], [null, undefined]])('%s', (t, m) => expect(minutesOf(t)).toBe(m));
});

describe('importCatalog with recipes', () => {
  let db: Kysely<DB>;
  let stop: () => Promise<void>;
  beforeAll(async () => { ({ db, stop } = await startTestDatabase()); }, 120_000);
  afterAll(async () => { await stop?.(); });
  beforeEach(async () => { await db.deleteFrom('catalog_items').execute(); });

  const list = () => mapWbc([rec({ title: 'A' }, 'recipes/recipe_00_010.html'), rec({ title: 'B' }, 'recipes/recipe_00_011.html')]).rows;
  const run = (rows: CatalogRow[], allowMassRetire = false) => importCatalog(db, { source: 'wbc', license: WBC_LICENSE, rows, apply: true, allowMassRetire });

  it('adds the recipes with their license, a second run changes nothing, and a recipe that disappears is retired not deleted', async () => {
    expect(await run(list())).toMatchObject({ added: ['c:wbc:recipe_00_010', 'c:wbc:recipe_00_011'], retired: [] });
    const rows = await db.selectFrom('catalog_items').selectAll().orderBy('id').execute();
    expect(rows.map(r => [r.kind, r.source, r.license])).toEqual([['recipe', 'wbc', WBC_LICENSE], ['recipe', 'wbc', WBC_LICENSE]]);
    expect(await run(list())).toMatchObject({ added: [], changed: [], retired: [], unchanged: 2 });
    expect(await run(list().slice(0, 1), true)).toMatchObject({ retired: ['c:wbc:recipe_00_011'] });
    const kept = await db.selectFrom('catalog_items').select(['id', 'retired_at']).where('id', '=', 'c:wbc:recipe_00_011').executeTakeFirstOrThrow();
    expect(kept.retired_at).not.toBeNull();
  });
});
