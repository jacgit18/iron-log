import { test, expect } from './fixtures.js';
import { openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief portion-scaled-micros (PR 1): the eaten-row Edit sheet shows ONE portion's numbers and amounts with a live total; the portion rescales them; an item with no amounts can have them typed per portion;
// the optional "also save to the recipe" tick writes per-serving amounts only to a recipe with none. The maths is node-tested (src/lib/portionBasis.test.ts); this covers the wiring. Fixed clock: Thursday 2026-09-24, 18:30.
const TODAY = '2026-09-24';
const seed = async (page, diet, recipes = []) => {
  await page.evaluate(([d, r]) => { localStorage.setItem('ironlog:diet/main', JSON.stringify({ items: d })); localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: r })); }, [diet, recipes]);
  await page.reload();
};
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const storedRecipes = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:recipes/main') || '{}').items || []);
const recipe = (id, extra = {}) => ({ id, n: 'Oats bowl', cat: 'meal', ing: [{ n: 'oats' }], steps: [], kcal: 300, p: 12, ...extra });
const openEdit = async (page, name) => {
  await todayCol(page).locator('.nb-eatrow', { hasText: name }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  return page.getByRole('dialog');
};

test('a logged portion opens per portion, rescales amounts with the portion and saves the total', async ({ page }) => {
  await seed(page, [{ id: 'o', d: TODAY, n: 'Oats bowl', kcal: 600, p: 24, t: 8, x: 2, micro: { calcium: 200 } }], [recipe('r1', { micro: { calcium: 100 } })]);
  await openNutrition(page);
  const dlg = await openEdit(page, 'Oats bowl');
  await expect(dlg.locator('input[id$="-k"]')).toHaveValue('300'); // one portion
  await expect(dlg.getByLabel('Amount 1')).toHaveValue('100');
  await expect(dlg.locator('[id$="-total"]')).toContainText('You ate 2 portions: 600 kcal');
  await expect(dlg.locator('input[id$="-tick"]')).toHaveCount(0); // the recipe already has amounts: no tick
  await dlg.getByRole('button', { name: 'More portions' }).click();
  await expect(dlg.locator('[id$="-total"]')).toContainText('You ate 2.5 portions: 750 kcal');
  await expect(dlg.getByLabel('Amount 1')).toHaveValue('100'); // the boxes stay per portion
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  const e = (await stored(page)).find(x => x.id === 'o');
  expect(e).toMatchObject({ kcal: 750, p: 30, x: 2.5, micro: { calcium: 250 } });
  expect((await storedRecipes(page))[0].micro).toEqual({ calcium: 100 }); // never overwritten
});

test('an item with no amounts takes them per portion: 2 portions saves doubled, and the tick fills the recipe', async ({ page }) => {
  await seed(page, [{ id: 'o', d: TODAY, n: 'Oats bowl', kcal: 300, p: 12, t: 8, from: 'r1', x: 1 }], [recipe('r1')]);
  await openNutrition(page);
  const dlg = await openEdit(page, 'Oats bowl');
  await dlg.getByRole('button', { name: /Vitamins and minerals per serving/ }).click();
  await dlg.getByRole('button', { name: '+ Add a nutrient' }).click();
  await dlg.getByLabel('Nutrient 1').selectOption('iron');
  await dlg.getByLabel('Amount 1').fill('12');
  await dlg.getByLabel('Unit 1').selectOption('mg');
  await dlg.getByRole('button', { name: 'More portions', exact: true }).click(); // 1.5
  await dlg.getByRole('button', { name: 'More portions', exact: true }).click(); // 2
  await expect(dlg.locator('input[id$="-tick"]')).toBeChecked();
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await stored(page)).find(x => x.id === 'o')).toMatchObject({ kcal: 600, x: 2, micro: { iron: 24 } });
  expect((await storedRecipes(page))[0].micro).toEqual({ iron: 12 }); // per serving
});

test('an entry logged before this change opens as 1 portion with a note, and offers no tick (its portion is a guess)', async ({ page }) => {
  await seed(page, [{ id: 'o', d: TODAY, n: 'Oats bowl', kcal: 300, p: 12, t: 8, from: 'r1' }], [recipe('r1')]);
  await openNutrition(page);
  const dlg = await openEdit(page, 'Oats bowl');
  await expect(dlg.locator('[id$="-total"]')).toContainText('You ate 1 portion');
  await expect(dlg.locator('[id$="-unrec"]')).toContainText('not recorded');
  await dlg.getByRole('button', { name: /Vitamins and minerals per serving/ }).click();
  await dlg.getByRole('button', { name: '+ Add a nutrient' }).click();
  await dlg.getByLabel('Amount 1').fill('5');
  await expect(dlg.locator('input[id$="-tick"]')).toHaveCount(0); // never writes a guessed per-serving amount to the recipe
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await stored(page)).find(x => x.id === 'o').micro).toBeTruthy();
  expect((await storedRecipes(page))[0].micro).toBeUndefined();
});

test('the tick can be turned off: the entry keeps the amounts and the recipe stays without', async ({ page }) => {
  await seed(page, [{ id: 'o', d: TODAY, n: 'Oats bowl', kcal: 300, p: 12, t: 8, from: 'r1', x: 1 }], [recipe('r1')]);
  await openNutrition(page);
  const dlg = await openEdit(page, 'Oats bowl');
  await dlg.getByRole('button', { name: /Vitamins and minerals per serving/ }).click();
  await dlg.getByRole('button', { name: '+ Add a nutrient' }).click();
  await dlg.getByLabel('Amount 1').fill('5');
  await dlg.locator('input[id$="-tick"]').uncheck();
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await stored(page)).find(x => x.id === 'o').micro).toBeTruthy();
  expect((await storedRecipes(page))[0].micro).toBeUndefined();
});

test('opening and saving with no edit keeps the amounts exactly, and a calorie change drops the ones that came with the old calories', async ({ page }) => {
  await seed(page, [{ id: 'o', d: TODAY, n: 'Oats bowl', kcal: 900, p: 36, t: 8, x: 3, micro: { calcium: 100 } }], [recipe('r1', { micro: { calcium: 1 } })]);
  await openNutrition(page);
  let dlg = await openEdit(page, 'Oats bowl');
  await expect(dlg.getByLabel('Amount 1')).toHaveValue('33.333');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await stored(page)).find(x => x.id === 'o')).toMatchObject({ kcal: 900, x: 3, micro: { calcium: 100 } }); // not 99.999
  await dlg.getByRole('button', { name: 'Edit', exact: true }).click(); // the sheet is back on the item's view after a save
  await dlg.locator('input[id$="-k"]').fill('200'); // a different calorie number per portion: the old amounts no longer match
  await expect(dlg.getByLabel('Amount 1')).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  const e = (await stored(page)).find(x => x.id === 'o');
  expect(e).toMatchObject({ kcal: 600, x: 3 });
  expect(e.micro).toBeUndefined();
});
