import { describe, expect, it } from 'vitest';
import type { Recipe, RecipeIngredient } from '../types.ts';
import { MAX_SEGMENTS, fmtAmount, hasBreakdown, mealMicroBreakdown } from './mealMicroBreakdown.js';
import { mealRollup } from './mealRollup.js';

const food = (id: string, n: string, micro: Recipe['micro'], extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', type: 'ingredient', ing: [], steps: [], kcal: 100, p: 5, ...(micro ? { micro } : {}), ...extra });
const meal = (id: string, ing: RecipeIngredient[], extra: Partial<Recipe> = {}): Recipe => ({ id, n: id, cat: 'breakfast', ing, steps: [], ...extra });
const line = (r: Recipe, q: number): RecipeIngredient => ({ n: r.n, rid: r.id, q });

const cereal = food('cereal', 'Cereal', { calcium: 100, vitaminD: 1, iron: 8 });
const milk = food('milk', 'Milk', { calcium: 300, vitaminD: 2.9, vitaminA: 140 });
const all = [cereal, milk];
const row = (b: ReturnType<typeof mealMicroBreakdown>, key: string) => b!.rows.find(r => r.key === key)!;

describe('mealMicroBreakdown', () => {
  it('splits a nutrient both parts list into one segment each, and the total is their sum', () => {
    const bowl = meal('bowl', [line(cereal, 1), line(milk, 1)]);
    const r = row(mealMicroBreakdown(bowl, all), 'calcium');
    expect(r.segments.map(s => [s.name, s.amount])).toEqual([['Cereal', 100], ['Milk', 300]]);
    expect(r.total).toBe(400);
    expect(r.atLeast).toBe(false);
    expect(r.unit).toBe('mg');
    expect(r.label).toBe('Calcium');
  });

  it('multiplies by the amount and divides by servings, blank servings being 1', () => {
    const bowl = meal('bowl', [line(cereal, 1.5), line(milk, 1)], { servings: 2 });
    expect(row(mealMicroBreakdown(bowl, all), 'calcium').segments.map(s => s.amount)).toEqual([75, 150]);
    expect(row(mealMicroBreakdown(bowl, all), 'calcium').total).toBe(225);
    expect(row(mealMicroBreakdown({ ...bowl, servings: undefined }, all), 'calcium').total).toBe(450);
  });

  it('a nutrient only one part lists gets a not-listed segment and an at-least total', () => {
    const bowl = meal('bowl', [line(cereal, 1), line(milk, 1)]);
    const iron = row(mealMicroBreakdown(bowl, all), 'iron');
    expect(iron.atLeast).toBe(true);
    expect(iron.total).toBe(8);
    expect(iron.segments[0]).toMatchObject({ name: 'Cereal', amount: 8, missing: [] });
    expect(iron.segments[1]).toMatchObject({ name: 'Milk', amount: null, missing: ['Milk'] });
  });

  it('lists nutrients in NUTRIENT_KEYS order and leaves out one no part lists', () => {
    const bowl = meal('bowl', [line(cereal, 1), line(milk, 1)]);
    expect(mealMicroBreakdown(bowl, all)!.rows.map(r => r.key)).toEqual(['calcium', 'iron', 'vitaminA', 'vitaminD']);
  });

  it('is null for no linked parts, the person’s own numbers, and parts with no vitamin data', () => {
    expect(mealMicroBreakdown(meal('plain', [{ n: 'Eggs' }]), all)).toBeNull();
    expect(mealMicroBreakdown(meal('own', [line(cereal, 1), line(milk, 1)], { own: true }), all)).toBeNull();
    const bare = food('bare', 'Bare', undefined);
    expect(mealMicroBreakdown(meal('b', [line(bare, 1)]), [bare])).toBeNull();
    expect(hasBreakdown(meal('b', [line(bare, 1)]), [bare])).toBe(false);
    expect(hasBreakdown(meal('bowl', [line(cereal, 1)]), all)).toBe(true);
  });

  it('a part with no calories and protein yet is left out, as the roll-up leaves it out', () => {
    const blank = { ...food('blank', 'Blank', { calcium: 999 }), kcal: undefined, p: undefined } as Recipe;
    const bowl = meal('bowl', [line(cereal, 1), line(blank, 1)]);
    const r = row(mealMicroBreakdown(bowl, [cereal, blank]), 'calcium');
    expect(r.segments.map(s => s.name)).toEqual(['Cereal']);
    expect(r.total).toBe(100);
  });

  it('a deleted part drops out', () => {
    const bowl = meal('bowl', [line(cereal, 1), { n: 'Gone', rid: 'gone', q: 1 }]);
    expect(row(mealMicroBreakdown(bowl, all), 'calcium').segments).toHaveLength(1);
  });

  it('a meal inside a meal is one segment carrying its rolled-up amounts', () => {
    const bowl = meal('bowl', [line(cereal, 1), line(milk, 1)]);
    const lunch = meal('lunch', [line(bowl, 1), line(food('juice', 'Juice', { calcium: 50 }), 2)]);
    const recipes = [cereal, milk, bowl, lunch, food('juice', 'Juice', { calcium: 50 })];
    const r = row(mealMicroBreakdown(lunch, recipes), 'calcium');
    expect(r.segments.map(s => [s.name, s.amount])).toEqual([['bowl', 400], ['Juice', 100]]);
    expect(r.total).toBe(500);
  });

  it('five parts keep their own slots and the sixth and later merge into Other', () => {
    const foods = Array.from({ length: 7 }, (_, i) => food(`f${i}`, `Food ${i}`, { calcium: 10 * (i + 1) }));
    const m = meal('m', foods.map(f => line(f, 1)));
    const b = mealMicroBreakdown(m, [...foods, m])!;
    const r = row(b, 'calcium');
    expect(MAX_SEGMENTS).toBe(5);
    expect(r.segments.map(s => s.slot)).toEqual([1, 2, 3, 4, 5, 'other']);
    expect(r.segments[5]).toMatchObject({ name: 'Other', amount: 60 + 70 });
    expect(r.total).toBe(10 + 20 + 30 + 40 + 50 + 60 + 70);
    expect(b.legend.map(l => l.name)).toEqual(['Food 0', 'Food 1', 'Food 2', 'Food 3', 'Food 4', 'Other']);
  });

  it('Other is not listed only when none of its parts list the nutrient', () => {
    const foods = [...Array.from({ length: 5 }, (_, i) => food(`f${i}`, `F${i}`, { calcium: 10 })), food('x', 'X', { iron: 1 }), food('y', 'Y', { iron: 2 })];
    const m = meal('m', foods.map(f => line(f, 1)));
    const b = mealMicroBreakdown(m, [...foods, m])!;
    expect(row(b, 'calcium').segments[5]).toMatchObject({ slot: 'other', amount: null, missing: ['X', 'Y'] });
    expect(row(b, 'iron').segments[5]).toMatchObject({ slot: 'other', amount: 3, missing: [] });
  });

  it('matches the stored roll-up for every nutrient the roll-up keeps', () => {
    const both = food('both', 'Both', { calcium: 120.5, vitaminD: 1.25, iron: 3 });
    const other = food('other', 'Other', { calcium: 80, vitaminD: 2, iron: 1.5 });
    const m = meal('m', [line(both, 1.5), line(other, 0.5)], { servings: 3 });
    const recipes = [both, other, m];
    const stored = mealRollup(m, recipes)!.per.micro!;
    const shown = mealMicroBreakdown(m, recipes)!;
    expect(Object.keys(stored).length).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(stored)) expect(row(shown, k).total).toBeCloseTo(v as number, 1);
  });
});

describe('fmtAmount', () => {
  it('rounds to two decimals and drops trailing zeros', () => {
    expect(fmtAmount(400)).toBe('400');
    expect(fmtAmount(2.9)).toBe('2.9');
    expect(fmtAmount(0.4500001)).toBe('0.45');
    expect(fmtAmount(12.3456)).toBe('12.35');
  });
});
