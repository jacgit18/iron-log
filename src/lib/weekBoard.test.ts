import { describe, expect, it } from 'vitest';
import type { PlanItem, Recipe } from '../types.ts';
import { hiddenHints, withHintSwitch } from './plate.js';
import { addItemsToDays, boardDay, copyItemToDays, fixFor, moveItem } from './weekBoard.js';

const rec = (id: string, cat: Recipe['cat'], kcal: number, p: number, extra: Partial<Recipe> = {}): Recipe => ({ id, n: id[0]!.toUpperCase() + id.slice(1), cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p, ...extra });
const chili = rec('chili', 'protein', 400, 30, { f: 14, pairs: ['rice'] }), rice = rec('rice', 'carbs', 200, 4, { f: 1, pairs: ['chili'] }), salad = rec('salad', 'sides', 80, 3, { f: 4 }), toast = rec('toast', 'carbs', 160, 5);
const recipes = [chili, rice, salad, toast];
const pi = (id: string, s?: PlanItem['s'], x?: number): PlanItem => ({ k: 'r', id, ...(x ? { x } : {}), ...(s ? { s } : {}) });
const pp = (id: string, s?: PlanItem['s']): PlanItem => ({ ...pi(id, s), p: true });
const D = '2099-01-01', D2 = '2099-01-02', TODAY = '2099-01-01';

describe('boardDay', () => {
  it('totals the day, groups by meal with an unset group first, and shares the target', () => {
    const plan = { [D]: [pi('toast', 'breakfast'), pi('chili', 'dinner'), pi('salad')] };
    const d = boardDay(plan, D, recipes, [], 2775);
    expect(d).toMatchObject({ count: 3, kcal: 640, protein: 38 });
    expect(d.slots.map(s => s.slot)).toEqual([null, 'breakfast', 'lunch', 'dinner', 'snack']);
    expect(d.slots[3]).toMatchObject({ slot: 'dinner', kcal: 400, share: 971 });
    expect(d.slots[0]!.items.map(x => x.r.name)).toEqual(['Salad']);
  });
  it('items sit A to Z in each meal whatever order they were added in, and keep their plan position', () => {
    const d = boardDay({ [D]: [pi('toast', 'snack'), pi('salad', 'snack'), pi('rice', 'snack'), pi('chili', 'snack')] }, D, recipes, [], null);
    const snack = d.slots.find(x => x.slot === 'snack')!;
    expect(snack.items.map(x => x.r.name)).toEqual(['Chili', 'Rice', 'Salad', 'Toast']);
    expect(snack.items.map(x => x.index)).toEqual([3, 2, 1, 0]);
  });
  it('checks a meal against what it needs and offers the partner first', () => {
    const d = boardDay({ [D]: [pp('chili', 'dinner')] }, D, recipes, [], null);
    const dinner = d.slots.find(s => s.slot === 'dinner')!;
    expect(dinner.have).toEqual(['protein']);
    expect(dinner.fixes.map(f => [f.mark, f.recipe.id, f.why])).toEqual([['carb', 'rice', 'goes with Chili'], ['veg', 'salad', null]]);
    expect(dinner.share).toBeNull();
  });
  it('judges the plate over planned items only: a menu of available food shows no check and no fixes', () => {
    const d = boardDay({ [D]: [pi('chili', 'dinner'), pi('salad', 'dinner')] }, D, recipes, [], null);
    expect(d.slots.find(s => s.slot === 'dinner')).toMatchObject({ need: [], have: [], fixes: [] });
    expect(d.slots.find(s => s.slot === 'dinner')!.items).toHaveLength(2);
  });
  it('does not offer a fix for a meal with nothing in it or a snack', () => {
    const d = boardDay({ [D]: [pi('toast', 'snack')] }, D, recipes, [], 2000);
    expect(d.slots.find(s => s.slot === 'snack')!.fixes).toEqual([]);
    expect(d.slots.find(s => s.slot === 'lunch')!.fixes).toEqual([]);
  });
  it('draws the fat bar whole, hatched or hidden by how much of the day has a fat figure', () => {
    expect(boardDay({ [D]: [pi('chili', 'dinner'), pi('rice', 'dinner')] }, D, recipes, [], null)).toMatchObject({ fat: 15, fatState: 'full' });
    expect(boardDay({ [D]: [pi('chili', 'dinner'), pi('toast', 'dinner')] }, D, recipes, [], null).fatState).toBe('partial'); // toast has no fat: 400 of 560 kcal (71%) are known
    expect(boardDay({ [D]: [pi('chili', 'dinner'), pi('toast', 'dinner', 3)] }, D, recipes, [], null).fatState).toBe('hidden'); // 400 of 880 kcal (45%)
  });
  it('counts a recipe plan portion in the totals', () => {
    expect(boardDay({ [D]: [pi('chili', 'dinner', 1.5)] }, D, recipes, [], null)).toMatchObject({ kcal: 600, protein: 45, fat: 21 });
  });
});

describe('fixFor', () => {
  it('falls back to a favorite, then A to Z, and never something already in the meal', () => {
    const fav = { ...salad, id: 'greens', n: 'Greens', fav: true as const };
    expect(fixFor('veg', [chili], [chili, salad, fav])?.recipe.id).toBe('greens');
    expect(fixFor('carb', [chili, rice], recipes)?.recipe.id).toBe('toast');
    expect(fixFor('veg', [salad], [salad])).toBeNull();
  });
});

describe('fixFor prefers a food of that meal (brief nutrition-plate-hints-per-meal)', () => {
  const beef = rec('beef', 'protein', 500, 40, { meal: 'dinner' }), eggs = rec('eggs', 'protein', 150, 12, { meal: 'breakfast' }), jerky = rec('jerky', 'protein', 100, 15);
  it('never offers a food of another meal while one of this meal or with none exists', () => {
    expect(fixFor('protein', [toast], [toast, beef, eggs], 'breakfast')?.recipe.id).toBe('eggs');
    expect(fixFor('protein', [toast], [toast, beef, jerky], 'breakfast')?.recipe.id).toBe('jerky'); // a food with no usual meal fits any meal
    expect(fixFor('protein', [toast], [toast, beef, eggs], 'dinner')?.recipe.id).toBe('beef');
  });
  it('falls back to today\'s pick when no food fits, and without a slot changes nothing', () => {
    expect(fixFor('protein', [toast], [toast, beef], 'breakfast')?.recipe.id).toBe('beef');
    expect(fixFor('protein', [toast], [toast, beef, eggs])?.recipe.id).toBe('beef'); // A to Z, as before
  });
  it('keeps a Goes with partner of another meal over a plain food with no usual meal', () => {
    const chili2 = { ...chili, pairs: ['rice2'] }, rice2 = rec('rice2', 'carbs', 200, 4, { meal: 'dinner' }), plain = rec('plain', 'carbs', 100, 3);
    expect(fixFor('carb', [chili2], [chili2, rice2, plain], 'lunch')).toMatchObject({ recipe: { id: 'rice2' }, why: 'goes with Chili' });
  });
  it('prefers a partner of that meal over a partner of another', () => {
    const t = { ...toast, pairs: ['beef', 'eggs'] };
    expect(fixFor('protein', [t], [t, beef, eggs], 'breakfast')).toMatchObject({ recipe: { id: 'eggs' }, why: 'goes with Toast' });
  });
});

describe('hidden plate hints', () => {
  const plan = { [D]: [pp('toast', 'breakfast'), pp('chili', 'dinner')], [D2]: [pp('toast', 'breakfast')] };
  const slotOf = (d: ReturnType<typeof boardDay>, s: string) => d.slots.find(x => x.slot === s)!;
  it('a meal in the hidden list has no need and no fixes; the others keep theirs', () => {
    const d = boardDay(plan, D, recipes, [], null, {}, { off: ['breakfast'] });
    expect(slotOf(d, 'breakfast')).toMatchObject({ need: [], have: [], fixes: [] });
    expect(slotOf(d, 'dinner').fixes.length).toBeGreaterThan(0);
    expect(slotOf(boardDay(plan, D, recipes, [], null), 'breakfast').fixes.length).toBeGreaterThan(0);
  });
  it('hides calories and totals nowhere', () => {
    expect(boardDay(plan, D, recipes, [], null, {}, { off: ['breakfast', 'dinner'] })).toMatchObject({ kcal: 560, protein: 35 });
  });
  it('hiddenHints joins the switch and the day dismissal; one day does not touch the next', () => {
    expect(hiddenHints(['breakfast'], { [D]: ['breakfast', 'lunch'] }, D)).toEqual(['breakfast', 'lunch']);
    expect(hiddenHints(undefined, { [D]: ['lunch'] }, D2)).toEqual([]);
    const d2 = boardDay(plan, D2, recipes, [], null, {}, { skips: { [D]: ['breakfast'] } });
    expect(slotOf(d2, 'breakfast').fixes.length).toBeGreaterThan(0);
  });
  it('withHintSwitch writes meal order, off adds and on removes', () => {
    expect(withHintSwitch(['dinner'], 'breakfast', false)).toEqual(['breakfast', 'dinner']);
    expect(withHintSwitch(['breakfast', 'dinner'], 'breakfast', true)).toEqual(['dinner']);
    expect(withHintSwitch(undefined, 'lunch', true)).toEqual([]);
  });
});

describe('boardDay with a saved meal', () => {
  it('does not judge the plate of a meal that holds a saved meal', () => {
    const d = boardDay({ [D]: [{ k: 'm', id: 'm1', s: 'lunch' }] }, D, recipes, [{ id: 'm1', n: 'Bowl', items: [] }], 2775);
    expect(d.slots.find(s => s.slot === 'lunch')).toMatchObject({ need: [], have: [], fixes: [] });
  });
});

describe('boardDay with a saved-meal item that moved (brief saved-meals-removal)', () => {
  it('counts the recipe it became in its meal, and judges the plate with it', () => {
    const d = boardDay({ [D]: [{ k: 'm', id: 'm1', s: 'dinner', p: true }] }, D, recipes, [], null, { m1: 'chili' });
    const dinner = d.slots.find(s => s.slot === 'dinner');
    expect(dinner?.items[0]?.r).toMatchObject({ name: 'Chili', gone: false });
    expect(d.kcal).toBeGreaterThan(0);
    expect(dinner?.have.length).toBeGreaterThan(0);
  });
  it('shows a gone row, and counts nothing, when its recipe is gone', () => {
    const d = boardDay({ [D]: [{ k: 'm', id: 'm1', s: 'dinner' }] }, D, recipes, [], null, { m1: 'deleted' });
    expect(d.slots.find(s => s.slot === 'dinner')?.items[0]?.r.gone).toBe(true);
    expect(d.kcal).toBe(0);
  });
});

describe('moveItem', () => {
  const plan = { [D]: [pi('chili', 'dinner'), pi('rice', 'dinner')], [D2]: [pi('rice', 'lunch')] };
  it('changes only the meal on the same day', () => {
    const r = moveItem(plan, D, 0, D, 'lunch', TODAY);
    expect(r.plan![D]![0]).toEqual({ k: 'r', id: 'chili', s: 'lunch' });
  });
  it('moves to another day and meal, dropping the emptied day', () => {
    const r = moveItem({ [D]: [pi('chili', 'dinner')] }, D, 0, D2, 'dinner', TODAY);
    expect(r.plan).toEqual({ [D2]: [{ k: 'r', id: 'chili', s: 'dinner' }] });
  });
  it('refuses a repeat in the same meal, a full day and a day outside the window', () => {
    expect(moveItem(plan, D, 1, D2, 'lunch', TODAY).error).toMatch(/already in that meal/);
    expect(moveItem({ [D]: [pi('chili', 'lunch')], [D2]: [pi('chili', 'lunch')] }, D, 0, D2, 'lunch', TODAY).error).toMatch(/already in that meal/);
    const full = { [D]: [pp('chili')], [D2]: Array.from({ length: 8 }, (_, i) => pp(`r${i}`)) };
    expect(moveItem(full, D, 0, D2, 'dinner', TODAY).error).toMatch(/8 planned/);
    expect(moveItem({ ...full, [D]: [pi('chili')] }, D, 0, D2, 'dinner', TODAY).error).toBeNull(); // an available item is not held to the 8
    expect(moveItem({ [D]: [pi('chili')], [D2]: Array.from({ length: 40 }, (_, i) => pi(`r${i}`)) }, D, 0, D2, 'dinner', TODAY).error).toMatch(/40 things/);
    expect(moveItem(plan, D, 0, '2100-03-01', 'dinner', TODAY).error).toMatch(/52 weeks/);
  });
  it('a listed daily snack moves between days in Snack without counting, and a planned item keeps its marker when moved (brief snacks-day-cap)', () => {
    const list = [{ id: 'yog' }], eight = Array.from({ length: 8 }, (_, i) => pp(`r${i}`));
    const full = { [D]: [pi('yog', 'snack')], [D2]: eight };
    expect(moveItem(full, D, 0, D2, 'snack', TODAY, list).plan![D2]).toHaveLength(9);
    expect(moveItem(full, D, 0, D2, 'lunch', TODAY, list).error).toBeNull(); // stored without a marker: available, so a full planned set does not refuse it
    const sameDay = { [D]: [...eight, pp('x')] };
    expect(moveItem({ [D]: [pp('c')], [D2]: [] }, D, 0, D2, 'lunch', TODAY).plan![D2]![0]).toEqual({ k: 'r', id: 'c', s: 'lunch', p: true });
    expect(moveItem(sameDay, D, 0, D, 'dinner', TODAY, list).error).toBeNull(); // moving within its day is not capped
  });
  it('allows the same food in another meal of the day, as adding does', () => {
    const r = moveItem({ [D]: [pi('chili', 'lunch')], [D2]: [pi('chili', 'dinner')] }, D, 0, D2, 'lunch', TODAY);
    expect(r.error).toBeNull();
    expect(r.plan![D2]).toEqual([{ k: 'r', id: 'chili', s: 'dinner' }, { k: 'r', id: 'chili', s: 'lunch' }]);
  });
  it('can set an item to no meal', () => {
    const r = moveItem(plan, D, 0, D, undefined, TODAY);
    expect(r.plan![D]![0]).toEqual({ k: 'r', id: 'chili' });
  });
});

describe('addItemsToDays and copyItemToDays', () => {
  const T = '2026-11-14', day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
  it('copies a planned item to the same meal and portion of each day, dropping the eaten tick', () => {
    const plan = { [T]: [{ ...pi('chili', 'dinner', 1.5), e: ['e1'] }] };
    const r = copyItemToDays(plan, T, 0, [day(15), day(16)], T);
    expect(r.error).toBeNull();
    expect(r.added).toEqual([day(15), day(16)]);
    expect(r.plan[day(15)]).toEqual([pi('chili', 'dinner', 1.5)]);
    expect(r.plan[T]).toEqual(plan[T]);
  });
  it('skips the own day, a full day, a duplicate in that meal and a day outside the window, naming each', () => {
    const full = Array.from({ length: 8 }, (_, i) => pp(`f${i}`, 'lunch'));
    const plan = { [T]: [pp('chili', 'dinner')], [day(15)]: full, [day(16)]: [pi('chili', 'dinner')], [day(17)]: [pi('chili', 'lunch')] };
    const r = copyItemToDays(plan, T, 0, [T, day(15), day(16), day(17), '2027-11-15', day(13)], T);
    expect(r.added).toEqual([day(17)]); // the same food in another meal is fine
    expect(r.plan[day(17)]).toHaveLength(2); expect(r.plan[day(17)]![1]!.p).toBe(true); // the copy keeps its marker
    expect(r.skipped).toEqual([{ day: T, reason: 'its own day' }, { day: day(15), reason: 'full' }, { day: day(16), reason: 'already there' }, { day: '2027-11-15', reason: 'out of reach' }, { day: day(13), reason: 'out of reach' }]);
  });
  it('an all-skipped batch returns the plan unchanged with an error; a missing item is gone', () => {
    const plan = { [T]: [pi('chili', 'dinner')] };
    const r = copyItemToDays(plan, T, 0, [T], T);
    expect(r.plan).toBe(plan);
    expect(r.error).toBe('Nothing copied. Skipped Sat 14: its own day.');
    expect(copyItemToDays(plan, T, 3, [day(15)], T).error).toBe('That is gone.');
  });
  it('addItemsToDays adds different items to different days and counts earlier adds', () => {
    const adds = [{ day: day(15), item: pi('rice', 'lunch') }, { day: day(15), item: pi('rice', 'lunch') }, { day: day(16), item: pi('salad') }];
    const r = addItemsToDays({}, adds, T);
    expect(r.added).toEqual([day(15), day(16)]);
    expect(r.skipped).toEqual([{ day: day(15), reason: 'already there' }]);
  });
});

describe('usual meal and drinks on the board (brief nutrition-meal-labels-year-repeat)', () => {
  const oats = rec('oats', 'other', 300, 10, { meal: 'breakfast' }), coffee = rec('coffee', 'other', 5, 0, { uses: ['drink'], meal: 'breakfast' }), tea = rec('tea', 'drinks', 2, 0);
  const all = [...recipes, oats, coffee, tea];
  it('puts an item with no meal of its own under its usual meal, and leaves a hand-placed one where it was put', () => {
    const d = boardDay({ [D]: [pi('oats'), pi('toast'), { ...pi('oats', 'dinner') }] }, D, all, [], null);
    expect(d.slots.find(s => s.slot === 'breakfast')!.items.map(x => x.index)).toEqual([0]);
    expect(d.slots.find(s => s.slot === 'dinner')!.items.map(x => x.index)).toEqual([2]);
    expect(d.slots.find(s => s.slot === null)!.items.map(x => x.index)).toEqual([1]); // no usual meal: still "Not set"
  });
  it('changing the usual meal moves every unplaced item with it', () => {
    const later = all.map(r => (r.id === 'oats' ? { ...r, meal: 'snack' as const } : r));
    expect(boardDay({ [D]: [pi('oats')] }, D, later, [], null).slots.find(s => s.slot === 'snack')!.items).toHaveLength(1);
  });
  it('lists a drink in Drinks, by label or by the Drinks category, outside every meal and its plate check, keeping its calories in the day', () => {
    const d = boardDay({ [D]: [pi('coffee'), pi('tea', 'lunch'), pi('toast', 'breakfast')] }, D, all, [], null);
    expect(d.drinks.map(x => x.r.item.id)).toEqual(['coffee', 'tea']);
    expect(d.slots.flatMap(s => s.items.map(x => x.r.item.id))).toEqual(['toast']);
    expect(d.slots.find(s => s.slot === 'lunch')).toMatchObject({ items: [], need: [], fixes: [] }); // a lunch holding only a drink asks for nothing
    expect(d.kcal).toBe(Math.round(5 + 2 + (toast.kcal ?? 0)));
    expect(d.count).toBe(3);
  });
  it('leaves drinks out of the 8-item cap but holds them to their own limit', () => {
    const eight = Array.from({ length: 8 }, (_, i) => pp(`r${i}`));
    const drinks = new Set(['coffee']);
    expect(addItemsToDays({ [D]: eight }, [{ day: D, item: pi('coffee') }], TODAY, undefined, drinks).added).toEqual([D]);
    expect(addItemsToDays({ [D]: eight }, [{ day: D, item: pp('toast') }], TODAY, undefined, drinks).skipped).toEqual([{ day: D, reason: 'full' }]);
    const six = Array.from({ length: 6 }, (_, i) => pi('coffee', (['breakfast', 'lunch', 'dinner', 'snack'] as const)[i % 4]!, i < 4 ? undefined : 2));
    expect(moveItem({ [D]: [...eight, pi('coffee')] }, D, 8, D2, 'lunch', TODAY, undefined, drinks).error).toBeNull();
    expect(six.length).toBe(6);
  });
});
