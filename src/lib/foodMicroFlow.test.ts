import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import { normDietEntries, normDietEntry, validDietEntry } from '../shared/diet.js';
import { cleanHits, parseFoods, scaleFood as scaleHit } from '../shared/foods.js';
import type { FoodHit } from '../shared/foods.js';
import { offHit } from '../shared/offFood.js';
import { entryFromFood } from './dietLog.js';
import { scanFoodDraft } from './dietRecent.js';
import { planCopy, suggestNow } from './dietSuggest.js';
import { microKept } from './foodMicroKept.js';
import { findFoods, scaleFood } from './foodMacros.js';

// Brief food-vitamins-minerals, PR A: vitamins and minerals ride from a lookup to a logged entry and stay with it. The vendor maps and caps are in shared/foodMicro.test.ts.
const entry = (over: Partial<DietEntry> = {}): DietEntry => ({ id: 'e1', d: '2026-09-23', n: 'Yogurt', kcal: 100, p: 10, micro: { calcium: 150, zinc: 1 }, ...over });
const usda = { foods: [{ fdcId: 7, description: 'Spinach', foodNutrients: [{ nutrientNumber: '208', value: 23 }, { nutrientNumber: '203', value: 2.9 }, { nutrientNumber: '301', value: 99 }, { nutrientNumber: '303', value: 2.7 }, { nutrientNumber: '312', value: 0.13 }] }] };

describe('lookups', () => {
  it('USDA results carry vitamins and minerals per 100 g, and a food without any has no field', () => {
    expect(parseFoods(usda)[0]!.micro).toEqual({ calcium: 99, copper: 130, iron: 2.7 });
    const plain = { foods: [{ fdcId: 8, description: 'Oil', foodNutrients: [{ nutrientNumber: '208', value: 884 }, { nutrientNumber: '203', value: 0 }] }] };
    expect('micro' in parseFoods(plain)[0]!).toBe(false);
  });
  it('Open Food Facts results carry them in mg and mcg', () => {
    const json = { status: 1, product: { product_name: 'Milk', nutriments: { 'energy-kcal_100g': 60, proteins_100g: 3, calcium_100g: 0.12, 'vitamin-d_100g': 0.0000011 } } };
    expect(offHit(json, '00012345678905')!.micro).toEqual({ calcium: 120, vitaminD: 1.1 });
  });
  it('hits read back from our own route are checked again', () => {
    const back = cleanHits({ hits: [{ id: 1, name: 'A', kcal: 10, p: 1, micro: { calcium: 5, bogus: 3, iron: 99999 } }] });
    expect(back[0]!.micro).toEqual({ calcium: 5 });
  });
  it('a portion scales them with the macros', () => {
    const hit: FoodHit = { id: 1, name: 'A', kcal: 100, p: 10, micro: { calcium: 100, iron: 2 } };
    expect(scaleHit(hit, 150).micro).toEqual({ calcium: 150, iron: 3 });
    expect('micro' in scaleHit({ id: 1, name: 'A', kcal: 100, p: 10 }, 150)).toBe(false);
  });
});

describe('entries', () => {
  it('normDietEntry keeps cleaned amounts, drops bad ones, and a clean entry is valid as written', () => {
    const e = normDietEntry(entry({ micro: { zinc: 1.23456, calcium: 150, ...({ junk: 4 } as object) } }))!;
    expect(e.micro).toEqual({ calcium: 150, zinc: 1.235 });
    expect(validDietEntry(e)).toBe(true);
    expect('micro' in normDietEntry({ ...entry(), micro: { iron: 0 } })!).toBe(false);
  });
  it('an old entry with no field is unchanged, and a stored list keeps amounts through a backup round trip', () => {
    const old = { id: 'o', d: '2026-09-23', n: 'Rice', kcal: 200, p: 4 };
    expect(normDietEntry(old)).toEqual(old);
    const list = [entry(), entry({ id: 'e2', micro: undefined })];
    expect(normDietEntries(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });
});

describe('re-logging keeps them', () => {
  const diet = [entry(), entry({ id: 'e2', d: '2026-09-24', n: 'Rice', micro: undefined })];
  it('Search your past meals offers the food with its amounts, and a portion scales them', () => {
    const food = findFoods(diet, [], 'yog')[0]!;
    expect(food.micro).toEqual({ calcium: 150, zinc: 1 });
    expect(scaleFood(food, 2)!.micro).toEqual({ calcium: 300, zinc: 2 });
  });
  it('suggestions and Copy day carry them', () => {
    expect(suggestNow(diet, 9, '2026-09-25').find(f => f.n === 'Yogurt')!.micro).toEqual({ calcium: 150, zinc: 1 });
    expect(planCopy(diet, '2026-09-23', '2026-09-25', null).add[0]!.micro).toEqual({ calcium: 150, zinc: 1 });
  });
  it('entryFromFood builds the entry with them, and without when there are none', () => {
    expect(entryFromFood('2026-09-25', { n: 'Yogurt', kcal: 100, p: 10, micro: { iron: 1 } })).toEqual({ d: '2026-09-25', n: 'Yogurt', kcal: 100, p: 10, micro: { iron: 1 } });
    expect('micro' in entryFromFood('2026-09-25', { n: 'Rice', kcal: 1, p: 1 })).toBe(false);
  });
});

describe('scan and One-off form', () => {
  it('a scanned product logs its amounts for the grams eaten, and the saved food does not hold them', () => {
    const hit: FoodHit = { id: 5, name: 'Cereal', kcal: 380, p: 8, serving: 40, micro: { iron: 12, vitaminC: 0 } };
    const d = scanFoodDraft(hit, 50, 'ready')!;
    expect(d.micro).toEqual({ iron: 6 });
    expect('micro' in d.recipe).toBe(false);
  });
  it('the One-off form keeps a looked-up food\'s amounts only while calories are unchanged', () => {
    const food = { kcal: 100, micro: { iron: 1 } };
    expect(microKept(food, 100)).toEqual({ iron: 1 });
    expect(microKept(food, 120)).toBeUndefined();
    expect(microKept(undefined, 100)).toBeUndefined();
  });
});
