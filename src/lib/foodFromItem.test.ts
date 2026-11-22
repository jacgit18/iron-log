import { describe, expect, it } from 'vitest';
import { MAX_RECIPES, normRecipe } from '../shared/recipes.js';
import type { GroceryItem, Recipe } from '../types.ts';
import { foodIdFor, foodNoticeText, foodOfItem, madeFood, madeFoodsText, planFoodForItem } from './foodFromItem.js';

const item = (n: string, over: Partial<GroceryItem> = {}): GroceryItem => ({ id: `i-${n.toLowerCase().replace(/\W+/g, '-')}`, n, store: '', qty: 1, cents: null, every: true, out: false, ...over });
const food = (id: string, n: string, over: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [], ...over });

describe('madeFood', () => {
  it('is a ready-made Food named as the item, typed by the name, pinned, flagged, with no nutrition', () => {
    const f = madeFood(item('Whole milk'), 'g-x');
    expect(f).toMatchObject({ id: 'g-x', n: 'Whole milk', cat: 'ready', type: 'drink', home: 'i-whole-milk', fromGroc: true });
    expect(f.kcal).toBeUndefined();
    expect(normRecipe(f)).toEqual(f); // the cleaner keeps it whole
  });
  it('gives eggs both labels and an unknown name Ready to eat', () => {
    expect(madeFood(item('Eggs'), 'g-e')).toMatchObject({ type: 'ingredient', uses: ['ingredient', 'ready'] });
    expect(madeFood(item('Greek yogurt'), 'g-y').type).toBe('ingredient');
    expect(madeFood(item('Lasagna'), 'g-l').type).toBe('ready');
  });
});

describe('foodIdFor', () => {
  it('is g-<item id>, then -2, -3 on a clash', () => {
    expect(foodIdFor('abc', [])).toBe('g-abc');
    expect(foodIdFor('abc', ['g-abc'])).toBe('g-abc-2');
    expect(foodIdFor('abc', ['g-abc', 'g-abc-2'])).toBe('g-abc-3');
  });
});

describe('planFoodForItem', () => {
  it('makes a Food for a new item', () => {
    const p = planFoodForItem(item('Rice'), []);
    expect(p.kind).toBe('make');
  });
  it('makes none for a one-time item', () => {
    expect(planFoodForItem(item('Rice', { oneTime: '2026-11' }), [])).toEqual({ kind: 'skip', reason: 'one-time' });
  });
  it('links the pinned Food, then a name match, then an alias, and makes nothing', () => {
    const i = item('Greek yogurt');
    expect(planFoodForItem(i, [food('a', 'Anything', { home: i.id })])).toEqual({ kind: 'link', id: 'a' });
    expect(planFoodForItem(i, [food('b', 'greek  Yogurt')])).toEqual({ kind: 'link', id: 'b' });
    expect(planFoodForItem({ ...i, aliases: ['Chobani pot'] }, [food('c', 'Chobani pot')])).toEqual({ kind: 'link', id: 'c' });
  });
  it('does not link a recipe or meal, and a Food pinned to another item is not matched by words', () => {
    const i = item('Chili');
    expect(planFoodForItem(i, [food('r', 'Chili', { cat: 'dinner' as Recipe['cat'] })]).kind).toBe('make');
    expect(foodOfItem(item('Milk'), [food('m', 'Skim milk', { home: 'other' })])).toBeUndefined();
  });
  it('links a Food of exactly the same name pinned to another item (the same food in two stores)', () => {
    expect(planFoodForItem(item('Milk', { store: 'Lidl' }), [food('m', 'Milk', { home: 'i-other' })])).toEqual({ kind: 'link', id: 'm' });
  });
  it('skips at the cap and says so', () => {
    const full = Array.from({ length: MAX_RECIPES }, (_, k) => food(`f${k}`, `Food ${k}`));
    const i = item('Rice');
    expect(planFoodForItem(i, full)).toEqual({ kind: 'skip', reason: 'full' });
    expect(foodNoticeText(i, full)).toMatch(/Foods is full \(300\)/);
  });
  it('takes the next id when g-<item id> belongs to another recipe', () => {
    const i = item('Rice');
    const p = planFoodForItem(i, [food(`g-${i.id}`, 'Something else')]);
    expect(p.kind === 'make' && p.food.id).toBe(`g-${i.id}-2`);
  });
});

describe('foodNoticeText', () => {
  it('names the made Food type, and is empty for a one-time item or a link', () => {
    const i = item('Whole milk');
    expect(foodNoticeText(i, [madeFood(i, 'g-1')])).toBe('Made a Food: Drink.');
    expect(foodNoticeText(item('Rice', { oneTime: '2026-11' }), [])).toBe('');
    expect(foodNoticeText(i, [food('x', 'Whole milk')])).toBe('');
  });
});

describe('madeFoodsText', () => {
  it('counts the Foods the given items made', () => {
    const a = item('Rice'), b = item('Oats');
    expect(madeFoodsText([a.id, b.id], [madeFood(a, 'g-a'), madeFood(b, 'g-b'), food('x', 'Other')])).toBe(' Made 2 Foods.');
    expect(madeFoodsText([a.id], [madeFood(a, 'g-a')])).toBe(' Made 1 Food.');
    expect(madeFoodsText([a.id], [])).toBe('');
  });
});
