import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import { ymd } from '../shared/dates.js';

// Your food log and typed targets (ADR 086): added, fixed, removed with Undo, capped per day, and carried through the data file.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(() => { clearStorage(); useAppStore.setState({ diet: [], removed: null }); st().mutateCfg(c => { delete c.diet; }); });

const day = '2026-10-29';
const rice = { d: day, n: 'Rice', kcal: 200, p: 4 };

describe('addDietEntry', () => {
  it('adds an entry with an id and keeps the numbers', () => {
    const r = st().addDietEntry(rice);
    expect(r.error).toBeNull();
    expect(st().diet).toEqual([{ id: r.id, ...rice }]);
  });
  it('refuses bad numbers or a blank name and changes nothing', () => {
    expect(st().addDietEntry({ ...rice, kcal: 0 }).error).toMatch(/calories/);
    expect(st().addDietEntry({ ...rice, n: ' ' }).error).toMatch(/name/);
    expect(st().addDietEntry({ ...rice, p: NaN }).error).toBeTruthy();
    expect(st().diet).toEqual([]);
  });
  it('refuses a day too far back to keep, saying so', () => {
    const r = st().addDietEntry({ ...rice, d: '2020-01-01' });
    expect(r.id).toBeNull(); expect(r.error).toMatch(/400 days/);
    expect(st().diet).toEqual([]);
  });
  it('refuses the 21st entry of a day but not of another day', () => {
    for (let i = 0; i < MAX_DIET_PER_DAY; i++) expect(st().addDietEntry(rice).error).toBeNull();
    expect(st().addDietEntry(rice).error).toBe('You can log 20 things a day.');
    expect(st().addDietEntry({ ...rice, d: '2026-10-28' }).error).toBeNull();
  });
});

describe('the hour of an entry', () => {
  it('is stamped on an entry for today and left off one for another day', () => {
    const today = ymd(new Date());
    const before = new Date().getHours();
    const a = st().addDietEntry({ ...rice, d: today }), b = st().addDietEntry(rice);
    expect([before, new Date().getHours()]).toContain(st().diet.find(e => e.id === a.id)!.t); // the hour may turn while the test runs
    expect(st().diet.find(e => e.id === b.id)!.t).toBeUndefined();
  });
  it('survives an edit', () => {
    const today = ymd(new Date());
    const id = st().addDietEntry({ ...rice, d: today }).id!;
    const t = st().diet[0]!.t;
    expect(t).toBeDefined();
    st().updateDietEntry(id, { kcal: 250 });
    expect(st().diet[0]!.t).toBe(t);
  });
});

describe('carbs and fat', () => {
  it('adds an entry with carbs and fat, and one without', () => {
    st().addDietEntry({ ...rice, c: 44, f: 0.5 }); st().addDietEntry({ ...rice, n: 'Toast' });
    expect(st().diet[0]).toMatchObject({ c: 44, f: 0.5 });
    expect(st().diet[1]).not.toHaveProperty('c');
  });
  it('an edit can set and clear them', () => {
    const id = st().addDietEntry(rice).id!;
    expect(st().updateDietEntry(id, { c: 30, f: 5 })).toBeNull();
    expect(st().diet[0]).toMatchObject({ c: 30, f: 5 });
    expect(st().updateDietEntry(id, { c: null })).toBeNull();
    expect(st().diet[0]).not.toHaveProperty('c');
    expect(st().diet[0]).toMatchObject({ f: 5 });
  });
  it('typed targets can include carbs and fat, and clear one at a time', () => {
    expect(st().setDietTarget('carbs', 400)).toBeNull(); expect(st().setDietTarget('fat', 80)).toBeNull();
    expect(st().cfg.diet).toEqual({ carbs: 400, fat: 80 });
    expect(st().setDietTarget('fat', 5)).toMatch(/Fat/);
    st().setDietTarget('carbs', null);
    expect(st().cfg.diet).toEqual({ fat: 80 });
  });
});

describe('updateDietEntry and removeDietEntry', () => {
  it('fixes the numbers and keeps the day and the recipe link', () => {
    const id = st().addDietEntry({ ...rice, from: 'chili-1' }).id!;
    expect(st().updateDietEntry(id, { kcal: 250, p: 5 })).toBeNull();
    expect(st().diet[0]).toMatchObject({ id, d: day, kcal: 250, p: 5, from: 'chili-1' });
    expect(st().updateDietEntry(id, { kcal: 99999 })).toMatch(/calories/);
    expect(st().diet[0]!.kcal).toBe(250);
  });
  it('keeps a looked-up food\'s vitamins and minerals through an edit of the name, and drops them when the calories change', () => {
    const id = st().addDietEntry({ ...rice, micro: { calcium: 120, iron: 2 } }).id!;
    expect(st().updateDietEntry(id, { n: 'Brown rice' })).toBeNull();
    expect(st().diet[0]).toMatchObject({ n: 'Brown rice', micro: { calcium: 120, iron: 2 } });
    expect(st().updateDietEntry(id, { kcal: rice.kcal })).toBeNull(); // the same calories: nothing changed
    expect(st().diet[0]!.micro).toEqual({ calcium: 120, iron: 2 });
    expect(st().updateDietEntry(id, { kcal: rice.kcal + 50 })).toBeNull();
    expect('micro' in st().diet[0]!).toBe(false);
  });
  it('takes an explicit micro from the typed rows: it replaces the amounts even when calories change, and null clears them (brief type-food-amounts)', () => {
    const id = st().addDietEntry({ ...rice, micro: { calcium: 120, iron: 2 } }).id!;
    expect(st().updateDietEntry(id, { kcal: rice.kcal + 50, micro: { zinc: 1.5 } })).toBeNull();
    expect(st().diet[0]).toMatchObject({ kcal: rice.kcal + 50, micro: { zinc: 1.5 } });
    expect(st().updateDietEntry(id, { micro: null })).toBeNull();
    expect('micro' in st().diet[0]!).toBe(false);
    expect(st().updateDietEntry(id, { micro: { iron: 99999 } })).toBeNull(); // over the cap: cleaned away, the entry still saves
    expect('micro' in st().diet[0]!).toBe(false);
  });
  it('removes with an Undo that puts the entry back in place', () => {
    const a = st().addDietEntry(rice).id!; const b = st().addDietEntry({ ...rice, n: 'Toast' }).id!;
    st().removeDietEntry(a);
    expect(st().diet.map(e => e.id)).toEqual([b]);
    expect(st().removed?.scope).toBe('diet');
    st().undoRemoved();
    expect(st().diet.map(e => e.id)).toEqual([a, b]);
  });
  it('removes quietly when asked (the log control undo)', () => {
    const id = st().addDietEntry(rice).id!;
    st().removeDietEntry(id, false);
    expect(st().diet).toEqual([]);
    expect(st().removed).toBeNull();
  });
});

describe('setDietTarget', () => {
  it('stores only what you typed, clears with null, and drops the key when empty', () => {
    expect(st().setDietTarget('kcal', 3000)).toBeNull();
    expect(st().cfg.diet).toEqual({ kcal: 3000 });
    expect(st().setDietTarget('protein', 180)).toBeNull();
    expect(st().cfg.diet).toEqual({ kcal: 3000, protein: 180 });
    st().setDietTarget('kcal', null); st().setDietTarget('protein', null);
    expect(st().cfg).not.toHaveProperty('diet');
  });
  it('refuses a number out of range', () => {
    expect(st().setDietTarget('kcal', 100)).toMatch(/Calories/);
    expect(st().setDietTarget('protein', 5)).toMatch(/Protein/);
    expect(st().cfg).not.toHaveProperty('diet');
  });
});

describe('setDietPace', () => {
  it('stores a preset, Custom with its rate, and goes back to the default with null', () => {
    expect(st().setDietPace('fast')).toBeNull();
    expect(st().cfg.diet).toEqual({ pace: 'fast' });
    expect(st().setDietPace('custom', 0.8)).toBeNull();
    expect(st().cfg.diet).toEqual({ pace: 'custom', rate: 0.8 });
    expect(st().setDietPace('slow')).toBeNull();
    expect(st().cfg.diet).toEqual({ pace: 'slow' }); // the Custom rate does not linger
    st().setDietPace(null);
    expect(st().cfg).not.toHaveProperty('diet');
  });
  it('refuses a Custom rate out of range or missing, and keeps the typed targets when the pace changes', () => {
    expect(st().setDietPace('custom', 9)).toMatch(/Pace/);
    expect(st().setDietPace('custom')).toMatch(/Pace/);
    expect(st().cfg).not.toHaveProperty('diet');
    st().setDietTarget('kcal', 3000); st().setDietPace('steady');
    expect(st().cfg.diet).toEqual({ kcal: 3000, pace: 'steady' });
    st().setDietTarget('kcal', null);
    expect(st().cfg.diet).toEqual({ pace: 'steady' }); // clearing the typed numbers keeps the pace
  });
});

describe('the data file', () => {
  it('carries the log and the targets out and back in', async () => {
    const { buildDataFile, parseDataFile } = await import('../lib/export.js');
    st().addDietEntry(rice); st().setDietTarget('kcal', 3000);
    const text = JSON.stringify(buildDataFile(st().snapshot(), {}));
    const back = parseDataFile(text);
    expect(back.diet).toEqual(st().diet);
    expect(back.config.diet).toEqual({ kcal: 3000 });
  });
  it('leaves the log out of the file when there is none', async () => {
    const { buildDataFile } = await import('../lib/export.js');
    expect(buildDataFile(st().snapshot(), {})).not.toHaveProperty('diet');
  });
});

// The old saved-meals list (cfg.diet.meals) still exists until a later PR removes it; these tests seed it directly, since Save meal now makes a Recipes meal.
const oldMeal = (name: string, entryIds: string[]) => {
  const meals = st().cfg.diet?.meals ?? [];
  const items = st().diet.filter(e => entryIds.includes(e.id)).map(e => ({ n: e.n, kcal: e.kcal, p: e.p, ...(e.from ? { from: e.from } : {}) }));
  st().mutateCfg(c => { c.diet = { ...(c.diet || {}), meals: [...meals, { id: `m${meals.length + 1}`, n: name, items }] }; });
};

describe('Save meal makes a Recipes meal', () => {
  const log = (n: string, kcal = 100) => st().addDietEntry({ d: day, n, kcal, p: 5 }).id!;
  beforeEach(async () => { const { normGrocery } = await import('../lib/grocery.js'); useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {}, recipes: [] }); });
  it('saves the ticked entries as a meal recipe with their totals, and leaves the old list alone', () => {
    const a = log('Oats', 350), b = log('Banana', 100); log('Skipped');
    expect(st().saveDietMeal('Breakfast', [a, b])).toBeNull();
    expect(st().recipes).toHaveLength(1);
    expect(st().recipes[0]).toMatchObject({ n: 'Breakfast', cat: 'other', kcal: 450, p: 10 });
    expect(st().recipes[0]!.ing.map(i => i.n)).toEqual(['Oats', 'Banana']);
    expect(st().cfg.diet?.meals).toBeUndefined();
  });
  it('refuses a blank name, nothing ticked and a name a recipe already has, and changes nothing', () => {
    const a = log('Oats');
    expect(st().saveDietMeal(' ', [a])).toMatch(/name/);
    expect(st().saveDietMeal('M', [])).toMatch(/Tick/);
    expect(st().saveDietMeal('Breakfast', [a])).toBeNull();
    expect(st().saveDietMeal('breakfast', [a])).toMatch(/already/);
    expect(st().recipes).toHaveLength(1);
  });
});

describe('moveSavedMeals', () => {
  const log = (n: string, kcal = 100) => st().addDietEntry({ d: day, n, kcal, p: 5 }).id!;
  beforeEach(() => { useAppStore.setState({ recipes: [], recipesLoaded: true }); });
  it('copies each saved meal into Recipes once, records it, and leaves the old list', () => {
    oldMeal('One', [log('Oats')]); oldMeal('Two', [log('Toast')]);
    expect(st().moveSavedMeals()).toBe(2);
    expect(st().recipes.map(r => r.n)).toEqual(['One', 'Two']);
    expect(Object.keys(st().cfg.diet!.mealsMoved!)).toEqual(['m1', 'm2']);
    expect(st().cfg.diet!.meals).toHaveLength(2);
    expect(st().moveSavedMeals()).toBe(0);
    expect(st().recipes).toHaveLength(2);
  });
  it('a second device with the recipes but no moved record adds no copy and writes the record back', () => {
    oldMeal('One', [log('Oats')]);
    st().moveSavedMeals();
    const recipes = st().recipes;
    st().mutateCfg(c => { delete c.diet!.mealsMoved; });
    expect(st().cfg.diet!.mealsMoved).toBeUndefined();
    expect(st().moveSavedMeals()).toBe(0);
    expect(st().recipes).toEqual(recipes);
    expect(st().cfg.diet!.mealsMoved).toEqual({ m1: recipes[0]!.id });
  });
  it('does nothing before the recipes list has been read', () => {
    oldMeal('One', [log('Oats')]);
    useAppStore.setState({ recipesLoaded: false });
    expect(st().moveSavedMeals()).toBe(0);
    expect(st().recipes).toHaveLength(0);
    expect(st().cfg.diet!.mealsMoved).toBeUndefined();
  });
  it('points a planned saved meal at the recipe it became', () => {
    const id = log('Oats'); oldMeal('One', [id]);
    st().addPlanItem(ymd(new Date()), 'm', 'm1');
    st().moveSavedMeals();
    const plan = st().cfg.diet!.plan![ymd(new Date())]!;
    expect(plan).toEqual([{ k: 'r', id: st().recipes[0]!.id }]);
  });
});

describe('saved meals', () => {
  const log = (n: string, kcal = 100) => st().addDietEntry({ d: day, n, kcal, p: 5 }).id!;
  it('targets and pace changes keep the old saved meals', () => {
    const a = log('Oats');
    oldMeal('One', [a]);
    st().setDietTarget('kcal', 3000); st().setDietPace('slow');
    expect(st().cfg.diet).toMatchObject({ kcal: 3000, pace: 'slow', meals: [{ n: 'One' }] });
    st().setDietTarget('kcal', null); st().setDietPace(null);
    expect(st().cfg.diet!.meals).toHaveLength(1);
  });
});

describe('the meal planner', () => {
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 864e5));
  const recipe = (id: string, n: string, extra = {}) => ({ id, n, cat: 'protein' as const, ing: [{ n: 'Chicken' }, { n: 'Rice' }], steps: [], kcal: 600, p: 40, ...extra });
  beforeEach(() => { useAppStore.setState({ recipes: [recipe('r1', 'Chili'), recipe('r2', 'Stir fry', { ing: [{ n: 'Chicken' }, { n: 'Peppers' }] })] }); });
  const meal = () => { const a = st().addDietEntry({ ...rice, d: today }).id!; oldMeal('Breakfast', [a]); return st().cfg.diet!.meals![0]!.id; };

  it('plans a recipe and a saved meal on a day, in order', () => {
    const m = meal();
    expect(st().addPlanItem(tomorrow, 'r', 'r1')).toBeNull();
    expect(st().addPlanItem(tomorrow, 'm', m)).toBeNull();
    expect(st().cfg.diet!.plan![tomorrow]).toEqual([{ k: 'r', id: 'r1' }, { k: 'm', id: m }]);
  });
  it('refuses a recipe or meal that is gone, a repeat and a day outside the window', () => {
    expect(st().addPlanItem(today, 'r', 'zzz')).toMatch(/gone/);
    expect(st().addPlanItem(today, 'm', 'zzz')).toMatch(/gone/);
    st().addPlanItem(today, 'r', 'r1');
    expect(st().addPlanItem(today, 'r', 'r1')).toMatch(/already/);
    expect(st().addPlanItem('2020-01-01', 'r', 'r2')).toMatch(/two weeks/);
  });
  it('sets a portion and removes an item; removing the last leaves no plan or diet key behind', () => {
    st().addPlanItem(today, 'r', 'r1');
    st().setPlanPortion(today, 0, 2);
    expect(st().cfg.diet!.plan![today]).toEqual([{ k: 'r', id: 'r1', x: 2 }]);
    st().removePlanItem(today, 0);
    expect(st().cfg.diet).toBeUndefined();
  });
  it('targets, pace and saved meals keep the plan', () => {
    st().addPlanItem(today, 'r', 'r1');
    st().setDietTarget('kcal', 3000); st().setDietPace('slow'); meal();
    expect(st().cfg.diet).toMatchObject({ kcal: 3000, pace: 'slow', plan: { [today]: [{ k: 'r', id: 'r1' }] }, meals: [{ n: 'Breakfast' }] });
  });
  it('writing the plan drops days before today', () => {
    st().mutateCfg(c => { c.diet = { plan: { '2020-01-01': [{ k: 'r', id: 'r1' }] } }; });
    st().addPlanItem(today, 'r', 'r2');
    expect(Object.keys(st().cfg.diet!.plan!)).toEqual([today]);
  });
});

describe('planToShopping (week to Shopping)', () => {
  const today = ymd(new Date());
  const plan = (...items: { k: 'r' | 'm'; id: string; e?: string[] }[]) => st().mutateCfg(c => { c.diet = { plan: { [today]: items } }; });
  const itemNames = () => st().grocery.items.map(i => i.n).sort();
  beforeEach(async () => { const { normGrocery } = await import('../lib/grocery.js'); useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {}, recipes: [] }); });

  it('adds each missing ingredient of the planned recipes once and reports the new items', () => {
    st().saveRecipe({ n: 'Pasta', cat: 'protein', ing: [{ n: 'garlic' }, { n: 'pasta' }], steps: [] });
    st().saveRecipe({ n: 'Bread', cat: 'carbs', ing: [{ n: 'garlic' }, { n: 'flour' }], steps: [] });
    const [a, b] = st().recipes;
    plan({ k: 'r', id: a!.id }, { k: 'r', id: b!.id });
    const r = st().planToShopping([today]);
    expect(itemNames()).toEqual(['flour', 'garlic', 'pasta']);
    expect(r).toMatchObject({ added: 3, recipes: 2, refused: null });
    expect(r.ids).toHaveLength(3);
  });
  it('leaves what is already on the list and adds nothing for an eaten item, a saved meal or no plan', () => {
    st().addGroceryItem({ n: 'Garlic', store: '', qty: '1', price: '', every: false });
    st().saveRecipe({ n: 'Pasta', cat: 'protein', ing: [{ n: 'garlic' }, { n: 'pasta' }], steps: [] });
    const id = st().recipes[0]!.id;
    plan({ k: 'r', id, e: ['gone-entry'] }, { k: 'm', id: 'm1' });
    expect(st().planToShopping([today])).toMatchObject({ added: 1, already: 1 }); // the eaten mark points at a removed entry, so the item still counts
    plan({ k: 'm', id: 'm1' });
    expect(st().planToShopping([today])).toMatchObject({ added: 0, recipes: 0, ids: [] });
    expect(st().planToShopping([])).toMatchObject({ added: 0, recipes: 0 });
  });
  it('lets Undo remove exactly the items the call created', () => {
    st().addGroceryItem({ n: 'Garlic', store: '', qty: '1', price: '', every: false });
    st().saveRecipe({ n: 'Pasta', cat: 'protein', ing: [{ n: 'garlic' }, { n: 'pasta' }], steps: [] });
    plan({ k: 'r', id: st().recipes[0]!.id });
    const r = st().planToShopping([today]);
    for (const id of r.ids) st().removeGroceryItem(id, { quiet: true });
    expect(itemNames()).toEqual(['Garlic']);
    expect(st().planToShopping([today]).added).toBe(1); // a second tap adds it again
  });
});

describe('copyDietEntry (brief nutrition-move-copy-eaten)', () => {
  const today = ymd(new Date()), past = '2026-10-29';
  const eaten = () => st().addDietEntry({ d: today, n: 'Rice', kcal: 200, p: 4, micro: { calcium: 120 } }).id!;
  it('copies to an earlier day with the hour and micronutrients; the original stays', () => {
    const id = eaten(), t = st().diet[0]!.t;
    expect(typeof t).toBe('number');
    const r = st().copyDietEntry(id, past);
    expect(r.error).toBeNull();
    const c = st().diet.find(e => e.id === r.id)!;
    expect(c).toMatchObject({ d: past, n: 'Rice', kcal: 200, p: 4, t, micro: { calcium: 120 } });
    expect(st().diet.filter(e => e.d === today)).toHaveLength(1);
    expect(st().removed).toBeNull();
  });
  it('a move removes the original and Undo puts it back without leaving the copy', () => {
    const id = eaten();
    const r = st().copyDietEntry(id, past, true);
    expect(st().diet.map(e => e.id)).toEqual([r.id]);
    expect(st().removed?.verb).toBe('Moved');
    st().undoRemoved();
    expect(st().diet.map(e => e.id)).toEqual([id]);
  });
  it('a full target day or the same day refuses and changes nothing', () => {
    const id = eaten();
    for (let i = 0; i < MAX_DIET_PER_DAY; i++) st().addDietEntry({ ...rice, d: past });
    const before = st().diet.length;
    expect(st().copyDietEntry(id, past, true).error).toBe('You can log 20 things a day.');
    expect(st().copyDietEntry(id, today).error).toBe('Pick another day.');
    expect(st().diet).toHaveLength(before);
    expect(st().removed).toBeNull();
  });
});

describe('Undo of a move respects the 20 a day limit (brief nutrition-move-copy-eaten)', () => {
  it('refuses to put the original back onto a day that filled up', () => {
    const today = ymd(new Date());
    const id = st().addDietEntry({ d: today, n: 'Rice', kcal: 200, p: 4 }).id!;
    st().copyDietEntry(id, '2026-10-29', true);
    for (let i = 0; i < MAX_DIET_PER_DAY; i++) st().addDietEntry({ d: today, n: `F${i}`, kcal: 100, p: 1 });
    st().undoRemoved();
    expect(st().diet.filter(e => e.d === today)).toHaveLength(MAX_DIET_PER_DAY);
    expect(st().diet.some(e => e.n === 'Rice' && e.d === '2026-10-29')).toBe(true);
  });
});
