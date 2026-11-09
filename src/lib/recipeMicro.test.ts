import { describe, expect, it } from 'vitest';
import type { DietEntry, Recipe } from '../types.ts';
import { normRecipe, validRecipe } from '../shared/recipes.js';
import { ateEntry, servingNumbers } from './dietLog.js';
import { planLog, type Resolved } from './dietPlan.js';
import { scanFoodDraft } from './dietRecent.js';
import { findFoods } from './foodMacros.js';
import { mealRollup, settleMeals } from './mealRollup.js';
import { totals } from './recipeMacros.js';

// Brief recipes-vitamins-minerals: vitamins and minerals per serving on a recipe, filled by a scan, the ingredient calculator or a meal's roll-up, and carried into the food log.
const food = (id: string, micro?: Recipe['micro'], over: Partial<Recipe> = {}): Recipe => ({ id, n: `Food ${id}`, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5, ...(micro ? { micro } : {}), ...over });
const meal = (ing: { rid: string; q: number }[], over: Partial<Recipe> = {}): Recipe => ({ id: 'm', n: 'Meal', cat: 'mains', ing: ing.map(i => ({ n: i.rid, rid: i.rid, q: i.q })), steps: [], ...over });

describe('the recipe carries them', () => {
  it('the normaliser keeps cleaned amounts, drops bad ones, and a clean recipe is valid as written', () => {
    const r = normRecipe({ ...food('a'), micro: { zinc: 2.12345, calcium: 100, bogus: 4, iron: 99999 } })!;
    expect(r.micro).toEqual({ calcium: 100, zinc: 2.123 });
    expect(validRecipe(r)).toBe(true);
    expect('micro' in normRecipe({ ...food('a'), micro: { iron: 0 } })!).toBe(false);
  });
  it('an old recipe is unchanged', () => {
    const old = { id: 'o', n: 'Soup', cat: 'ready', ing: [], steps: [], kcal: 200, p: 8 };
    expect(normRecipe(old)).toEqual(old);
    expect(validRecipe(old)).toBe(true);
  });
});

describe('logging a recipe carries them, scaled by the servings', () => {
  const r = food('a', { calcium: 100, iron: 2 });
  it('servingNumbers and ateEntry scale the amounts like the calories', () => {
    expect(servingNumbers(r, 2)!.micro).toEqual({ calcium: 200, iron: 4 });
    const e = ateEntry(r, 2, '2026-09-24', '2026-09-24');
    expect('entry' in e && e.entry.micro).toEqual({ calcium: 200, iron: 4 });
  });
  it('a recipe with none logs exactly as before', () => {
    const e = ateEntry(food('b'), 2, '2026-09-24', '2026-09-24');
    expect('entry' in e && 'micro' in e.entry).toBe(false);
  });
  it('a planned recipe logs them for its portion', () => {
    const resolved = { recipe: r, portion: 1.5 } as Resolved;
    const out = planLog(resolved, [] as DietEntry[], '2026-09-24');
    expect('add' in out && out.add[0]!.micro).toEqual({ calcium: 150, iron: 3 });
  });
  it('Search your past meals offers a recipe with its amounts', () => {
    expect(findFoods([], [r], 'food')[0]!.micro).toEqual({ calcium: 100, iron: 2 });
  });
});

describe('a scanned product keeps them on its saved food', () => {
  it('the ready-made food and the entry both hold the amounts for the grams eaten', () => {
    const d = scanFoodDraft({ id: 5, name: 'Cereal', kcal: 380, p: 8, micro: { iron: 12 } }, 50, 'ready')!;
    expect(d.micro).toEqual({ iron: 6 });
    expect(d.recipe.micro).toEqual({ iron: 6 });
  });
});

describe('the ingredient calculator', () => {
  const hit = (micro?: Record<string, number>) => ({ id: 1, name: 'X', kcal: 100, p: 10, ...(micro ? { micro } : {}) });
  it('sums per serving and keeps a nutrient only when every counted food lists it', () => {
    const t = totals([
      { name: 'a', grams: 200, hit: hit({ calcium: 100, iron: 2 }) },
      { name: 'b', grams: 100, hit: hit({ calcium: 50 }) },
    ], 2);
    expect(t.per.micro).toEqual({ calcium: 125 }); // (100*2 + 50*1) / 2; iron is missing from b, so it is left out, not counted as zero
  });
  it('has none when no counted food lists any, or nothing is counted', () => {
    expect('micro' in totals([{ name: 'a', grams: 100, hit: hit() }], 1).per).toBe(false);
    expect('micro' in totals([{ name: 'a', grams: null, hit: hit({ iron: 1 }) }], 1).per).toBe(false);
  });
});

describe('a meal rolls them up from its parts', () => {
  const parts = [food('a', { calcium: 100, iron: 2 }), food('b', { calcium: 40, iron: 1, zinc: 3 })];
  it('sums parts times q over servings, per nutrient only when every part lists it', () => {
    const r = mealRollup(meal([{ rid: 'a', q: 2 }, { rid: 'b', q: 1 }], { servings: 2 }), parts)!;
    expect(r.per.micro).toEqual({ calcium: 120, iron: 2.5 }); // zinc is not in a
  });
  it('settleMeals writes them with the calories, follows a part, and drops them when a part loses its data', () => {
    const m = meal([{ rid: 'a', q: 1 }, { rid: 'b', q: 1 }]);
    const [, , settled] = settleMeals([...parts, m]);
    expect(settled!.micro).toEqual({ calcium: 140, iron: 3 });
    const changed = settleMeals([food('a', { calcium: 10 }), parts[1]!, settled!]);
    expect(changed[2]!.micro).toEqual({ calcium: 50 });
    const gone = settleMeals([food('a'), parts[1]!, settled!]);
    expect('micro' in gone[2]!).toBe(false);
  });
  it('a meal on its own numbers keeps none, and a recipe with no linked line is never touched', () => {
    const own = meal([{ rid: 'a', q: 1 }], { own: true, kcal: 300, p: 9, micro: { iron: 5 } });
    expect('micro' in settleMeals([...parts, own])[2]!).toBe(false);
    const plain = food('z', { iron: 1 });
    const list = [plain];
    expect(settleMeals(list)).toBe(list);
  });
  it('a rolled-up meal inside a meal passes its amounts up', () => {
    const inner = meal([{ rid: 'a', q: 1 }], { id: 'i' });
    const outer = meal([{ rid: 'i', q: 2 }], { id: 'o' });
    const list = settleMeals([parts[0]!, inner, outer]);
    expect(list[2]!.micro).toEqual({ calcium: 200, iron: 4 });
  });
});
