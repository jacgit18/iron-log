import { test, expect } from './fixtures.js';
import { closeSheet, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Brief nutrition-meal-add-today (button review N8, stage 2): a meal's own Add on today logs into that meal, and the entry carries it (`s`). The rules (the stamped port, which ways are offered, where an entry is placed) are node tests
// (stampMeal.test.ts, nutritionBoard.test.ts); this covers the wiring: the header button, the ways offered, an entry landing in the pressed meal ahead of the hour, and a reload keeping it.
// The fixed clock is Thursday 2026-09-24, 18:30, so an unplaced food logged now would land in Dinner.
const slot = (page, name) => todayCol(page).locator('.wb-slot', { has: page.locator('.wb-slothd b', { hasText: new RegExp(`^${name}$`) }) });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog:diet/main') || '{}').items || []);
const mk = (id, n) => ({ id, n, cat: 'other', ing: [{ n: 'x' }], steps: ['Cook.'], kcal: 300, p: 12 });
const seedRecipes = async (page, items) => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), items); await page.reload(); };
const oneOff = async (sheet, name) => {
  await sheet.getByRole('button', { name: /^One-off food/ }).click();
  await sheet.locator('#dt-add-n').fill(name);
  await sheet.locator('#dt-add-k').fill('90');
  await sheet.locator('#dt-add-p').fill('3');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByRole('status').last()).toContainText(`Added ${name}.`);
};

test('today\'s meals each have an Add; its sheet says which meal and offers only the ways that log into it', async ({ page }) => {
  await openNutrition(page);
  for (const m of ['Breakfast', 'Lunch', 'Dinner', 'Snack']) await expect(slot(page, m).getByRole('button', { name: `Add to ${m}` })).toBeVisible();
  await slot(page, 'Breakfast').getByRole('button', { name: 'Add to Breakfast' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Adding to Thu 24 · today · into Breakfast');
  await expect(sheet.locator('.nb-menu .btn b')).toHaveText(['Quick add', 'One-off food', 'Find food', 'Recipes', 'Saved meals']); // no scan, no Copy yesterday, no Save as a meal
  await expect(sheet.getByRole('group', { name: 'Which meal' })).toHaveCount(0); // today asks no meal: the one pressed is the meal
});

test('a food added from a meal\'s Add lands in that meal ahead of the hour, is stored with it, and stays after a reload; the toolbar still places by the hour', async ({ page }) => {
  await openNutrition(page);
  await slot(page, 'Breakfast').getByRole('button', { name: 'Add to Breakfast' }).click();
  await oneOff(page.getByRole('dialog'), 'Toast');
  await closeSheet(page);
  await expect(slot(page, 'Breakfast')).toContainText('Toast'); // not Dinner, which is where 18:30 would put it
  await expect(slot(page, 'Dinner')).not.toContainText('Toast');
  expect((await stored(page)).find(e => e.n === 'Toast')).toMatchObject({ s: 'breakfast' });
  await page.reload();
  await openNutrition(page);
  await expect(slot(page, 'Breakfast')).toContainText('Toast');
  await page.locator('#nb-add').click(); // the toolbar's Add food: no meal pressed, so the hour places it
  await oneOff(page.getByRole('dialog'), 'Rice');
  await closeSheet(page);
  await expect(slot(page, 'Dinner')).toContainText('Rice');
  expect((await stored(page)).find(e => e.n === 'Rice')).not.toHaveProperty('s');
});

test('a recipe logged from a meal\'s Add goes into that meal, not its usual meal or the hour', async ({ page }) => {
  await openNutrition(page);
  await seedRecipes(page, [{ ...mk('chili', 'Chili'), meal: 'dinner' }]);
  await openNutrition(page);
  await slot(page, 'Snack').getByRole('button', { name: 'Add to Snack' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /^Recipes/ }).click();
  await sheet.getByRole('button', { name: 'Log Chili' }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Logged Chili');
  await closeSheet(page);
  await expect(slot(page, 'Snack')).toContainText('Chili'); // its usual meal is Dinner
  expect((await stored(page)).find(e => e.n === 'Chili')).toMatchObject({ s: 'snack' });
});
