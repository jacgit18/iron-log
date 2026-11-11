import { test, expect } from './fixtures.js';
import { startRecipe } from './recipesNav.js';

// The meal planner (brief diet-meal-planner). The rules (window, order, portions, totals, what logging adds, which recipes the shop needs) are node tests in dietPlan.test.ts;
// this covers the wiring: plan a recipe and a saved meal, change a portion, Log on today and a day with no Log button.
import { closeSheet, openAdd, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// The Nutrition board's planner, once the Diet panel's Plan strip (brief diet-meal-planner, now on the week board of brief nutrition-board). The rules (window, order, portions, totals, what logging adds, which recipes the shop needs) are node tests in dietPlan.test.ts;
// this covers the wiring: plan a recipe and a saved meal from the add sheet, change a portion, Log on today and a day with no Log button.
const TOMORROW = '2026-09-25'; // the fixed clock is Thursday 2026-09-24
const board = page => page.locator('.nb');
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const status = page => board(page).locator('.nb-msg');
const nutrition = openNutrition;
// A day's planned card moved to today (the add sheet no longer plans on today, so a test that needs a planned card on today plans a day ahead and moves it, which is also how a person does it).
const moveToToday = async (page, name, from) => {
  const c = col(page, from);
  await c.locator('.wb-card', { hasText: name }).click();
  await c.getByRole('button', { name: `Move ${name}`, exact: true }).click();
  await c.getByRole('group', { name: `Move ${name} to` }).getByRole('button', { name: 'Thu, Sep 24' }).click();
  await todayCol(page).locator('.nb-dayname').click();
};
// Picks a day on the board (by its name), opens the add sheet's Recipes or Saved meals way and plans into a meal.
const planRecipe = async (page, name, day, meal = 'Dinner') => {
  if (!day || day === '2026-09-24') { await planRecipe(page, name, TOMORROW, meal); await moveToToday(page, name, TOMORROW); return; }
  await col(page, day).locator('.nb-dayname').click();
  const sheet = await openAdd(page, 'Recipes');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: meal, exact: true }).click();
  await sheet.getByLabel('Find a recipe').fill(name);
  await sheet.getByRole('button', { name: `Plan ${name} for ${meal}` }).click();
  await closeSheet(page);
};
const logFood = async (page, name, kcal, p) => {
  const sheet = await openAdd(page, 'One-off food');
  await sheet.getByLabel('Food', { exact: true }).fill(name);
  await sheet.getByLabel('Calories', { exact: true }).fill(String(kcal));
  await sheet.getByLabel('Protein (g)').fill(String(p));
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
};
const newRecipe = async (page, name, kcal, p, ing) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await startRecipe(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Edit nutrition per serving' }).click();
  await page.getByLabel('Calories per serving').fill(String(kcal));
  await page.getByLabel('Protein per serving (g)').fill(String(p));
  for (const [i, n] of ing.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.getByLabel(`Ingredient ${i + 1}`, { exact: true }).fill(n);
  }
  await page.getByRole('button', { name: 'Save recipe' }).click();
};

test('plan a saved meal on a day, see the totals, and Log a planned recipe only on today', async ({ page }) => {
  await newRecipe(page, 'Chili', 600, 40, ['Kidney beans']);
  await nutrition(page);
  await expect(todayCol(page).getByText('Nothing planned')).toHaveCount(3);
  await logFood(page, 'Oats', 350, 12);
  await expect(todayCol(page).locator('.nb-eat', { hasText: 'Oats' })).toBeVisible();
  let sheet = await openAdd(page, 'Save as a meal');
  await sheet.getByRole('button', { name: 'Save as a meal', exact: true }).click();
  await sheet.getByRole('checkbox', { name: /Oats/ }).check();
  await sheet.getByLabel('Meal name').fill('Breakfast');
  await sheet.getByRole('button', { name: 'Save meal' }).click();
  await closeSheet(page);
  // tomorrow: plan the saved meal into Breakfast; the day's meter counts the plan, and there is no Log button on a future day
  await col(page, TOMORROW).locator('.nb-dayname').click();
  sheet = await openAdd(page, 'Saved meals');
  await sheet.getByRole('group', { name: 'Which meal' }).getByRole('button', { name: 'Breakfast', exact: true }).click();
  await sheet.getByRole('button', { name: /^Breakfast · 1 food · 350 kcal/ }).click();
  await closeSheet(page);
  await expect(col(page, TOMORROW).getByRole('img', { name: /^Calories planned: 350 / })).toBeVisible();
  await col(page, TOMORROW).locator('.wb-card', { hasText: 'Breakfast' }).click();
  await expect(col(page, TOMORROW).getByRole('checkbox', { name: /Breakfast as eaten/ })).toHaveCount(0);
  await expect(col(page, TOMORROW).getByRole('button', { name: 'Remove Breakfast' })).toBeVisible();
  // today: plan the recipe and check it; it is not listed again under Also eaten
  await planRecipe(page, 'Chili', '2026-09-24');
  const kcal = () => todayCol(page).getByRole('img', { name: /^Calories / });
  await expect(kcal()).toHaveAttribute('aria-label', /: 350 /);
  await todayCol(page).getByRole('checkbox', { name: 'Check Chili as eaten' }).click();
  await expect(todayCol(page).getByRole('checkbox', { name: 'Uncheck Chili as eaten' })).toBeChecked();
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(1); // Oats, which was typed in, not planned
  await expect(todayCol(page).locator('.wb-slothd b', { hasText: 'Also eaten' })).toBeVisible(); // only the unplanned food is under Also eaten
  await expect(status(page)).toContainText('Logged 1 from Chili.');
  await expect(kcal()).toHaveAttribute('aria-label', /: 950 /); // the meters moved by the planned 600
  await todayCol(page).getByRole('checkbox', { name: 'Uncheck Chili as eaten' }).click(); // unticking removes that log
  await expect(todayCol(page).getByRole('checkbox', { name: 'Check Chili as eaten' })).not.toBeChecked();
  await expect(kcal()).toHaveAttribute('aria-label', /: 350 /);
  await expect(todayCol(page).locator('.nb-eat')).toHaveCount(1);
  await todayCol(page).getByRole('checkbox', { name: 'Check Chili as eaten' }).click();
  await expect(todayCol(page).getByRole('checkbox', { name: 'Uncheck Chili as eaten' })).toBeChecked();
  await page.reload();
  await nutrition(page);
  await expect(col(page, TOMORROW).locator('.wb-card', { hasText: 'Breakfast' })).toBeVisible();
});

test('a recipe has a portion stepper', async ({ page }) => {
  await newRecipe(page, 'Chili', 600, 40, ['Kidney beans', 'Chili powder']);
  await nutrition(page);
  await planRecipe(page, 'Chili', TOMORROW);
  const next = col(page, TOMORROW);
  await expect(next.getByText('600 kcal · 40 g protein')).toBeVisible();
  await next.getByText('Chili', { exact: true }).click();
  await next.getByRole('button', { name: 'More Chili' }).click();
  await expect(next.getByText('900 kcal · 60 g protein')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add missing ingredients to Shopping/ })).toHaveCount(0); // removed from Nutrition (brief nutrition-mobile-layout); the recipe keeps its own button
});

test('The week arrows move between Last week, This week and Next week, which switches the week the board shows', async ({ page }) => {
  await nutrition(page);
  const week = board(page).getByRole('group', { name: 'Week' });
  await expect(board(page).locator('.nb-col')).toHaveCount(7);
  await expect(board(page).locator('.nb-weekname')).toHaveText('This week');
  await expect(board(page).getByRole('status').filter({ hasText: 'This week · Sep' })).toBeVisible();
  await week.getByRole('button', { name: 'Next week' }).click();
  await expect(board(page).locator('.nb-weekname')).toHaveText('Next week');
  await expect(week.getByRole('button', { name: 'Next week' })).toHaveAttribute('aria-disabled', 'true'); // the end of the board
  await expect(board(page).locator('.nb-col')).toHaveCount(7);
  await expect(board(page).locator('.nb-col.today')).toHaveCount(0);
  await week.getByRole('button', { name: 'Previous week' }).click();
  await week.getByRole('button', { name: 'Previous week' }).click();
  await expect(board(page).locator('.nb-weekname')).toHaveText('Last week');
  await expect(board(page).locator('.nb-col')).toHaveCount(7);
});
