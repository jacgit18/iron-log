import { describe, expect, it } from 'vitest';
import type { Recipe, RecipeIngredient } from '../types.ts';
import { MAX_LINKS, countedNote, foodCandidates, hasParts, isRolledUp, linkError, mealRollup, settleMeals } from './mealRollup.js';

const food = (id: string, n: string, kcal: number, p: number, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', type: 'ingredient', ing: [], steps: [], kcal, p, ...extra });
const meal = (id: string, n: string, ing: RecipeIngredient[], extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'breakfast', ing, steps: [], ...extra });
const line = (r: Recipe, q: number): RecipeIngredient => ({ n: r.n, rid: r.id, q });

const oats = food('oats', 'Oat cereal', 150, 5, { c: 27, f: 3 });
const milk = food('milk', 'Whole milk', 150, 8, { c: 12, f: 8 });

describe('mealRollup', () => {
  it('sums the linked parts times q per serving', () => {
    const bowl = meal('bowl', 'Cereal bowl', [line(oats, 1.5), line(milk, 1)]);
    const r = mealRollup(bowl, [oats, milk, bowl])!;
    expect(r.per).toEqual({ kcal: 375, p: 15.5, c: 52.5, f: 12.5 });
    expect(r.counted).toBe(2);
    expect(r.total).toBe(2);
  });

  it('divides by servings, blank servings being 1', () => {
    const shake = meal('shake', 'Shake', [line(oats, 2), line(milk, 2)], { servings: 2 });
    expect(mealRollup(shake, [oats, milk, shake])!.per.kcal).toBe(300);
    expect(mealRollup({ ...shake, servings: undefined }, [oats, milk, shake])!.per.kcal).toBe(600);
  });

  it('changing a food changes the meal on the next read', () => {
    const bowl = meal('bowl', 'Cereal bowl', [line(oats, 1), line(milk, 1)]);
    expect(mealRollup(bowl, [oats, milk, bowl])!.per.kcal).toBe(300);
    expect(mealRollup(bowl, [{ ...oats, kcal: 200 }, milk, bowl])!.per.kcal).toBe(350);
  });

  it('counts unlinked lines and lines without q as not counted: "2 of 3"', () => {
    const bowl = meal('bowl', 'Bowl', [line(oats, 1), line(milk, 1), { n: 'Honey', amt: '1 tsp' }]);
    const r = mealRollup(bowl, [oats, milk, bowl])!;
    expect([r.counted, r.total]).toEqual([2, 3]);
    expect(countedNote(r)).toBe('2 of 3 ingredients counted');
  });

  it('a sauce link without q adds nothing and the recipe has no parts', () => {
    const taco = meal('taco', 'Tacos', [{ n: 'Taco seasoning', rid: 'ts' }], { kcal: 400, p: 30 });
    expect(hasParts(taco)).toBe(false);
    expect(isRolledUp(taco)).toBe(false);
    expect(mealRollup(taco, [taco])).toBeNull();
  });

  it('a part with no numbers is not counted and is named', () => {
    const bare = food('bare', 'Mystery', 0, 0, { kcal: undefined, p: undefined });
    const bowl = meal('bowl', 'Bowl', [line(oats, 1), line(bare, 1)]);
    const r = mealRollup(bowl, [oats, bare, bowl])!;
    expect([r.counted, r.total, r.needNumbers]).toEqual([1, 2, ['Mystery']]);
    expect(countedNote(r)).toBe('1 of 2 ingredients counted, needs numbers: Mystery');
  });

  it('leaves out carbs and fat when a counted part has none', () => {
    const plain = food('plain', 'Plain', 100, 2);
    const r = mealRollup(meal('m', 'M', [line(oats, 1), line(plain, 1)]), [oats, plain])!;
    expect(r.per).toEqual({ kcal: 250, p: 7 });
  });

  it('skipped lines are not lines', () => {
    const r = mealRollup(meal('m', 'M', [line(oats, 1), { ...line(milk, 1), skip: true }]), [oats, milk])!;
    expect([r.counted, r.total, r.per.kcal]).toEqual([1, 1, 150]);
  });

  it('rolls up through a meal inside a meal, both levels', () => {
    const bowl = meal('bowl', 'Cereal bowl', [line(oats, 1), line(milk, 1)], { kcal: 1, p: 1 }); // stale stored numbers
    const box = meal('box', 'Lunch box', [line(bowl, 1), line(food('apple', 'Apple', 80, 0), 1)]);
    const all = [oats, milk, bowl, box, food('apple', 'Apple', 80, 0)];
    expect(mealRollup(box, all)!.per.kcal).toBe(380);
  });

  it('a meal with its own numbers is read by its stored numbers inside another meal', () => {
    const bowl = meal('bowl', 'Cereal bowl', [line(oats, 1)], { own: true, kcal: 500, p: 20 });
    expect(mealRollup(meal('box', 'Box', [line(bowl, 1)]), [oats, bowl])!.per.kcal).toBe(500);
  });
});

describe('linkError', () => {
  const a = meal('a', 'A', []), b = meal('b', 'B', [line(a, 1)]);
  it('refuses a meal containing itself', () => {
    expect(linkError([a], 'a', 'a')).toMatch(/itself/);
  });
  it('refuses a loop (A in B in A)', () => {
    expect(linkError([a, b], 'a', 'b')).toMatch(/loop/);
  });
  it('allows a clean link and a link into a new meal', () => {
    expect(linkError([a, b], 'b', 'a')).toBeNull();
    expect(linkError([a, b], undefined, 'b')).toBeNull();
  });
  it('caps the chain at MAX_LINKS links', () => {
    expect(MAX_LINKS).toBe(3);
    const d = meal('d', 'D', []), c = meal('c', 'C', [line(d, 1)]), b2 = meal('b2', 'B2', [line(c, 1)]);
    const list = [d, c, b2];
    expect(linkError(list, 'top', 'b2')).toBeNull(); // top -> b2 -> c -> d is 3 links
    const top = meal('top', 'Top', []);
    expect(linkError([...list, top], 'top', 'b2')).toBeNull();
    const deeper = meal('e', 'E', [line(top, 1)]);
    expect(linkError([...list, top, deeper], 'top', 'b2')).toMatch(/3 levels/); // e -> top -> b2 -> c -> d is 4
  });
});

describe('foodCandidates', () => {
  it('lists Foods first then Meals, A to Z, never the recipe itself or a sauce', () => {
    const sauce = meal('s', 'Salsa', [], { cat: 'sauces' });
    const drink = food('k', 'Kefir', 100, 8, { type: 'drink' });
    const self = meal('self', 'Self', []);
    const lunch = meal('lunch', 'Lunch', []);
    const r = foodCandidates([lunch, sauce, milk, drink, oats, self], 'self');
    expect(r.foods.map(x => x.n)).toEqual(['Kefir', 'Oat cereal', 'Whole milk']);
    expect(r.meals.map(x => x.n)).toEqual(['Lunch']);
  });
});

describe('settleMeals', () => {
  it('writes the roll-up into kcal, p, c and f of a meal that rolls up', () => {
    const bowl = meal('bowl', 'Bowl', [line(oats, 1), line(milk, 1)], { kcal: 999, p: 99, c: 99, f: 99 });
    const out = settleMeals([oats, milk, bowl]);
    expect(out.find(r => r.id === 'bowl')).toMatchObject({ kcal: 300, p: 13, c: 39, f: 11 });
  });

  it('returns the same list when nothing changes, and never touches a recipe without a q line', () => {
    const taco = meal('taco', 'Tacos', [{ n: 'Seasoning', rid: 'gone' }], { kcal: 400, p: 30 });
    const list = [oats, taco];
    expect(settleMeals(list)).toBe(list);
    const bowl = settleMeals([oats, milk, meal('bowl', 'Bowl', [line(oats, 1), line(milk, 1)])]);
    expect(settleMeals(bowl)).toBe(bowl);
  });

  it('keeps typed numbers when the person uses their own', () => {
    const bowl = meal('bowl', 'Bowl', [line(oats, 1)], { own: true, kcal: 700, p: 40 });
    const list = [oats, bowl];
    expect(settleMeals(list)).toBe(list);
  });

  it('follows a part that changed, through two levels', () => {
    const bowl = meal('bowl', 'Bowl', [line(oats, 1), line(milk, 1)], { kcal: 300, p: 13, c: 39, f: 11 });
    const box = meal('box', 'Box', [line(bowl, 2)], { kcal: 600, p: 26, c: 78, f: 22 });
    const out = settleMeals([{ ...oats, kcal: 250 }, milk, bowl, box]);
    expect(out.find(r => r.id === 'box')!.kcal).toBe(800);
  });

  it('a deleted part leaves plain text and the roll-up recounts', () => {
    const bowl = meal('bowl', 'Bowl', [line(oats, 1), line(milk, 1), { n: 'Honey' }], { kcal: 300, p: 13 });
    const out = settleMeals([oats, bowl]).find(r => r.id === 'bowl')!;
    expect(out.ing[1]).toEqual({ n: 'Whole milk' });
    expect(out.kcal).toBe(150);
    expect(mealRollup(out, [oats, out])).toMatchObject({ counted: 1, total: 3 });
  });

  it('a renamed part shows its new name on the line', () => {
    const bowl = meal('bowl', 'Bowl', [line(oats, 1)], { kcal: 150, p: 5, c: 27, f: 3 });
    expect(settleMeals([{ ...oats, n: 'Rolled oats' }, bowl]).find(r => r.id === 'bowl')!.ing[0]!.n).toBe('Rolled oats');
  });

  it('keeps typed numbers when the roll-up is out of range or nothing counted', () => {
    const bare = food('bare', 'Mystery', 0, 0, { kcal: undefined, p: undefined });
    const bowl = meal('bowl', 'Bowl', [line(bare, 1)], { kcal: 321, p: 12 });
    const list = [bare, bowl];
    expect(settleMeals(list)).toBe(list);
  });
});
