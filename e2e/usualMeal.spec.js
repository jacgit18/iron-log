import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openNutrition } from './nutritionBoardHelpers.js';
import { startRecipe } from './recipesNav.js';

// A food's usual meal and the Drinks section (brief nutrition-meal-labels-year-repeat, PR 2). The rules (which meal an item sits in, what a drink is, the cap and the drinks limit) are node tests
// (usualMeal.test.ts, weekBoard.test.ts, plate.test.ts); this covers the wiring: the pickers on the recipe form, the add sheet's pre-pick, the board following a change, and the Drinks list.
// The fixed clock is Thursday 2026-09-24, 18:30; Friday 25 is a day ahead, so it plans.
const FRI = '2026-09-25';
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const mk = (id, n, extra = {}) => ({ id, n, cat: 'other', ing: [{ n: 'x' }], steps: ['Cook.'], kcal: 200, p: 8, ...extra });
const seed = async (page, items) => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), items); await page.reload(); };
const planOn = async (page, day, short, pick, flowName = /^Recipes/) => {
  await col(page, day).getByRole('button', { name: new RegExp(`^${short}`) }).click();
  const sheet = await openAdd(page);
  if (pick) await sheet.getByRole('button', { name: pick, exact: true }).click();
  await sheet.getByRole('button', { name: flowName }).click();
  return sheet;
};

test('the recipe form saves a usual meal and Beverage, and the card shows the meal', async ({ page }) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill('Oatmeal');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('oats');
  const usual = page.getByRole('group', { name: 'Usual meal' });
  for (const m of ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'None']) await expect(usual.getByRole('button', { name: m, exact: true })).toBeVisible();
  await usual.getByRole('button', { name: 'Breakfast', exact: true }).click();
  await expect(usual.getByRole('button', { name: 'Breakfast', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const bev = page.getByRole('group', { name: 'Beverage' }).getByRole('button');
  await expect(bev).toHaveAttribute('aria-pressed', 'false');
  await bev.click();
  await expect(page.getByRole('group', { name: 'Used as' }).getByRole('button', { name: 'Drink' })).toHaveAttribute('aria-pressed', 'true'); // the same Drink label
  await bev.click();
  await expect(page.getByRole('group', { name: 'Used as' }).getByRole('button', { name: 'Drink' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:recipes/main') || '{}').items);
  expect(saved.map(r => [r.n, r.meal])).toEqual([['Oatmeal', 'breakfast']]);
});

test('the add sheet pre-picks the usual meal, a pressed meal wins, and a hand-placed copy is stored with its own meal', async ({ page }) => {
  await seed(page, [mk('oats', 'Oatmeal', { meal: 'breakfast' }), mk('rice', 'Rice')]);
  await openNutrition(page);
  let sheet = await planOn(page, FRI, 'Fri 25');
  await expect(sheet.getByRole('button', { name: 'Plan Oatmeal for Breakfast' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Plan Rice for / })).toBeVisible(); // no usual meal: the sheet's own start pick
  await sheet.getByRole('button', { name: 'Plan Oatmeal for Breakfast' }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Planned Oatmeal for Breakfast');
  await sheet.getByRole('button', { name: 'Dinner', exact: true }).click(); // pressing a meal puts everything there
  await expect(sheet.getByRole('button', { name: 'Plan Oatmeal for Dinner' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Plan Oatmeal for Dinner' }).click(); // a second, hand-placed copy in Dinner
  await closeSheet(page);
  const fri = col(page, FRI);
  await expect(fri.locator('.wb-slot', { hasText: 'Breakfast' }).locator('.wb-card')).toContainText('Oatmeal');
  await expect(fri.locator('.wb-slot', { hasText: 'Dinner' }).locator('.wb-card')).toContainText('Oatmeal');
  // The first copy was added with no meal pressed, so it is stored with no meal of its own and follows the recipe; the second was pressed into Dinner, so it keeps it.
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:config/main') || '{}').diet?.plan?.['2026-09-25']);
  expect(plan).toEqual([{ k: 'r', id: 'oats' }, { k: 'r', id: 'oats', s: 'dinner' }]);
});

test('an item with no meal of its own follows the food, and a change of usual meal moves it on every day', async ({ page }) => {
  await seed(page, [mk('oats', 'Oatmeal', { meal: 'breakfast' })]);
  await page.evaluate(() => localStorage.setItem('ironlog:config/main', JSON.stringify({ diet: { plan: { '2026-09-24': [{ k: 'r', id: 'oats' }], '2026-09-25': [{ k: 'r', id: 'oats' }], '2026-09-26': [{ k: 'r', id: 'oats', s: 'dinner' }] } } })));
  await page.reload();
  await openNutrition(page);
  const inSlot = (day, name) => col(page, day).locator('.wb-slot', { hasText: name }).locator('.wb-card');
  await expect(inSlot('2026-09-25', 'Breakfast')).toContainText('Oatmeal');
  await expect(inSlot('2026-09-24', 'Breakfast')).toContainText('Oatmeal');
  await expect(inSlot('2026-09-26', 'Dinner')).toContainText('Oatmeal'); // placed by hand: stays
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.locator('.rc-row', { hasText: 'Oatmeal' }).first().click();
  await expect(page.getByText('Usual meal: Breakfast').first()).toBeVisible();
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const usual = page.getByRole('group', { name: 'Usual meal' });
  await usual.getByRole('button', { name: 'Snack', exact: true }).click();
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await openNutrition(page);
  await expect(inSlot('2026-09-25', 'Snack')).toContainText('Oatmeal');
  await expect(inSlot('2026-09-24', 'Snack')).toContainText('Oatmeal');
  await expect(inSlot('2026-09-26', 'Dinner')).toContainText('Oatmeal');
  await expect(inSlot('2026-09-25', 'Breakfast')).toHaveCount(0);
});

test('a drink lands in the day\'s Drinks list, outside the meals, the plate check and the 8-item limit', async ({ page }) => {
  await seed(page, [mk('brew', 'Cold brew', { uses: ['drink'], kcal: 5, p: 0 }), ...Array.from({ length: 8 }, (_, i) => mk(`f${i}`, `Food ${i}`))]);
  const plan = Array.from({ length: 8 }, (_, i) => ({ k: 'r', id: `f${i}`, s: 'lunch' }));
  await page.evaluate(p => localStorage.setItem('ironlog:config/main', JSON.stringify({ diet: { plan: { '2026-09-25': p } } })), plan);
  await page.reload();
  await openNutrition(page);
  const fri = col(page, FRI);
  await expect(fri.getByRole('region', { name: 'Drinks' })).toHaveCount(0); // none yet: nothing drawn
  const sheet = await planOn(page, FRI, 'Fri 25');
  await sheet.getByRole('button', { name: /^Plan Cold brew for / }).click(); // a ninth thing, but a drink: not refused
  await expect(sheet.getByRole('status').last()).toContainText('Planned Cold brew');
  await closeSheet(page);
  const drinks = fri.getByRole('region', { name: 'Drinks' });
  await expect(drinks).toContainText('Cold brew');
  await expect(drinks).toContainText('Not in the plate check or the 8-item limit');
  await expect(fri.locator('.wb-slot', { hasText: 'Lunch' }).locator('.wb-card')).toHaveCount(8); // the meal holds only the eight foods
});
