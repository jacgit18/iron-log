import { test, expect } from './fixtures.js';

// The meal planner (brief diet-meal-planner). The rules (window, order, portions, totals, what logging adds, which recipes the shop needs) are node tests in dietPlan.test.ts;
// this covers the wiring: plan a recipe and a saved meal, change a portion, Log on today, a day with no Log button, and the missing ingredients on To get.
const diet = page => page.getByRole('region', { name: 'Diet' });
const nutrition = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const plan = page => diet(page).locator('.dt-plan');
const logFood = async (page, name, kcal, p) => {
  await diet(page).getByLabel('Food', { exact: true }).fill(name);
  await diet(page).getByLabel('Calories', { exact: true }).fill(String(kcal));
  await diet(page).getByLabel('Protein (g)').fill(String(p));
  await diet(page).getByRole('button', { name: 'Add', exact: true }).click();
};
const newRecipe = async (page, name, kcal, p, ing) => {
  await page.click('#tab-daily'); await page.click('#daily-recipes');
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Calories per serving').fill(String(kcal));
  await page.getByLabel('Protein per serving (g)').fill(String(p));
  for (const [i, n] of ing.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.getByLabel(`Ingredient ${i + 1}`, { exact: true }).fill(n);
  }
  await page.getByRole('button', { name: 'Save recipe' }).click();
};

test('plan a saved meal on a day, see the totals, and Log it only on today', async ({ page }) => {
  await nutrition(page);
  await expect(plan(page).getByText('Nothing planned.')).toBeVisible();
  await expect(plan(page).getByRole('button', { name: 'Add to plan' })).toBeVisible();
  await logFood(page, 'Oats', 350, 12);
  await diet(page).getByRole('button', { name: 'Save as meal' }).click();
  await diet(page).getByRole('checkbox', { name: /Oats/ }).check();
  await diet(page).getByLabel('Meal name').fill('Breakfast');
  await diet(page).getByRole('button', { name: 'Save meal' }).click();
  await plan(page).getByRole('button', { name: 'Add to plan' }).click();
  await plan(page).getByRole('button', { name: 'Breakfast (meal)' }).click();
  await expect(plan(page).getByText(/^Planned 350 kcal/)).toBeVisible();
  await plan(page).getByRole('button', { name: 'Log Breakfast' }).click();
  await expect(diet(page).locator('.dt-entry')).toHaveCount(2);
  await expect(plan(page).getByRole('status')).toContainText('Logged 1 from Breakfast.');
  // tomorrow: plan it, but there is no Log button on a future day
  await plan(page).getByRole('list', { name: /Plan/ }).getByRole('button').nth(1).click();
  await plan(page).getByRole('button', { name: 'Add to plan' }).click();
  await plan(page).getByRole('button', { name: 'Breakfast (meal)' }).click();
  await expect(plan(page).getByRole('button', { name: 'Log Breakfast' })).toHaveCount(0);
  await expect(plan(page).getByRole('button', { name: 'Remove Breakfast' })).toBeVisible();
  await page.reload();
  await nutrition(page);
  await expect(plan(page).getByRole('button', { name: /planned/ })).toHaveCount(2);
});

test('a recipe has a portion stepper, and the plan sends its missing ingredients to To get', async ({ page }) => {
  await newRecipe(page, 'Chili', 600, 40, ['Kidney beans', 'Chili powder']);
  await nutrition(page);
  await plan(page).getByRole('button', { name: 'Add to plan' }).click();
  await plan(page).getByRole('button', { name: 'Chili (recipe)' }).click();
  await expect(plan(page).getByText(/^Planned 600 kcal · 40 g protein/)).toBeVisible();
  await plan(page).getByRole('button', { name: 'More Chili' }).click();
  await expect(plan(page).getByText(/^Planned 900 kcal · 60 g protein/)).toBeVisible();
  await plan(page).getByRole('button', { name: 'Add missing ingredients to To get' }).click();
  await expect(plan(page).getByRole('status')).toContainText('Added 2 to To get.');
  await page.click('#daily-grocery');
  await expect(page.getByText('Kidney beans').first()).toBeVisible();
});

test('This week and Next week switch between two strips of seven days', async ({ page }) => {
  await nutrition(page);
  const strip = plan(page).getByRole('list', { name: 'Plan' });
  await expect(strip.getByRole('listitem')).toHaveCount(7);
  await expect(plan(page).getByRole('button', { name: 'This week' })).toBeDisabled();
  await plan(page).getByRole('button', { name: 'Next week' }).click();
  await expect(plan(page).getByRole('button', { name: 'Next week' })).toBeDisabled();
  await expect(strip.getByRole('listitem')).toHaveCount(7);
});
