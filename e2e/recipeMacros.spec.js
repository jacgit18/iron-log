import { test, expect } from './fixtures.js';

// Recipe macros from ingredients (brief recipe-ingredient-macros). The rules (grams from an amount, the sums, per serving, what is left out) are node tests
// in recipeMacros.test.ts; this covers the wiring with the food route stubbed: the panel, a lookup per row, a Grams box for an amount in cups, the Servings
// divide, Use these numbers filling the form (only Save recipe changes the recipe), and a lookup that is down.
const FOODS = {
  chicken: [{ id: 1, name: 'Chicken breast, raw', kcal: 120, p: 22.5, c: 0, f: 2.6 }],
  rice: [{ id: 2, name: 'Rice, white, cooked', kcal: 130, p: 2.7, c: 28, f: 0.3 }],
  seasoning: [{ id: 3, name: 'Seasoning mix', kcal: 50, p: 1 }],
};
const stub = page => page.route('**/api/foods/search*', route => {
  const q = new URL(route.request().url()).searchParams.get('q') ?? '';
  const key = Object.keys(FOODS).find(k => q.toLowerCase().includes(k));
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hits: key ? FOODS[key] : [] }) });
});
const open = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
// An amount is typed in the picker panel under its row (recipeServings.spec.js does the same).
const setAmount = async (page, i, text) => {
  await page.getByRole('button', { name: new RegExp(`^Amount for ingredient ${i + 1}:`) }).click();
  await page.getByLabel('Type an amount instead').fill(text);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
};
// The nutrition card is folded away: Edit shows its four fields, and its summary line shows what is set.
const editNutrition = page => page.getByRole('button', { name: 'Edit nutrition per serving' }).click();
const start = async (page, servings = '2') => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Chicken and rice');
  await page.getByLabel('Servings', { exact: true }).fill(servings);
  await page.getByLabel('Ingredient 1', { exact: true }).fill('chicken breast');
  await setAmount(page, 0, '400 g');
  await page.getByRole('button', { name: 'Add ingredient' }).click();
  await page.getByLabel('Ingredient 2', { exact: true }).fill('rice');
  await setAmount(page, 1, '2 cups');
};
const panel = page => page.getByRole('region', { name: 'Calculate from ingredients' });
const pickFood = async (page, ingredient, label) => {
  await panel(page).getByRole('button', { name: `Look up ${ingredient}` }).click();
  await panel(page).getByRole('button', { name: label }).click();
};

test('pick a food per ingredient, give grams for the cups, and the per-serving numbers fill the form', async ({ page }) => {
  await stub(page);
  await start(page);
  await page.getByRole('button', { name: 'Calculate from ingredients' }).click();
  await expect(panel(page).getByLabel('Grams for chicken breast')).toHaveAttribute('placeholder', '400');
  await expect(panel(page).getByLabel('Grams for rice')).toHaveAttribute('placeholder', 'grams');
  await expect(panel(page).getByText('Counted 0 of 2 ingredients.')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Use these numbers' })).toBeDisabled();
  await pickFood(page, 'chicken breast', 'Chicken breast, raw · 120 kcal per 100 g');
  await expect(panel(page).getByText('Counted 1 of 2 ingredients.')).toBeVisible();
  await pickFood(page, 'rice', 'Rice, white, cooked · 130 kcal per 100 g');
  await expect(panel(page).getByLabel('Grams for rice')).toHaveValue('100'); // an amount in cups starts at the food's 100 g and is yours to change
  await panel(page).getByLabel('Grams for rice').fill('200');
  await expect(panel(page).getByText('Counted 2 of 2 ingredients.')).toBeVisible();
  await expect(panel(page).getByText('Per serving (÷ 2): 370 kcal · 47.7 g protein · 28 g carbs · 5.5 g fat')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Use these numbers' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByText('370 kcal · 47.7 g protein · 28 g carbs · 5.5 g fat')).toBeVisible();
  await editNutrition(page);
  await expect(page.getByLabel('Calories per serving')).toHaveValue('370');
  await expect(page.getByLabel('Fat per serving (g), optional')).toHaveValue('5.5');
  await page.getByLabel('Calories per serving').fill('365'); // still editable
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.reload();
  await open(page);
  await page.getByRole('button', { name: /Chicken and rice/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await editNutrition(page);
  await expect(page.getByLabel('Calories per serving')).toHaveValue('365');
  await expect(page.getByLabel('Protein per serving (g)')).toHaveValue('47.7');
});

test('changing Servings keeps the per-serving numbers for gram amounts, and Close changes nothing', async ({ page }) => {
  await stub(page);
  await start(page, '4');
  await setAmount(page, 1, '100 g');
  await editNutrition(page);
  await page.getByLabel('Carbs per serving (g), optional').fill('9');
  await page.getByRole('button', { name: 'Calculate from ingredients' }).click();
  await pickFood(page, 'chicken breast', 'Chicken breast, raw · 120 kcal per 100 g');
  await pickFood(page, 'rice', 'Rice, white, cooked · 130 kcal per 100 g');
  await expect(panel(page).getByText('Per serving (÷ 4): 153 kcal · 23.2 g protein · 7 g carbs · 2.7 g fat')).toBeVisible();
  await page.getByLabel('Servings', { exact: true }).fill('2'); // the amounts halve with it, so each serving is the same
  await expect(panel(page).getByLabel('Grams for chicken breast')).toHaveAttribute('placeholder', '200');
  await expect(panel(page).getByText('Per serving (÷ 2): 153 kcal · 23.2 g protein · 7 g carbs · 2.7 g fat')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByLabel('Calories per serving')).toHaveValue('');
  await expect(page.getByLabel('Carbs per serving (g), optional')).toHaveValue('9');
});

test('a food with no carbs or fat leaves those two as typed, and says so', async ({ page }) => {
  await stub(page);
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Plain');
  await page.getByLabel('Servings', { exact: true }).fill(''); // servings start at 1; emptied, the totals say they assumed 1
  await page.getByLabel('Ingredient 1', { exact: true }).fill('seasoning');
  await setAmount(page, 0, '10 g');
  await editNutrition(page);
  await page.getByLabel('Carbs per serving (g), optional').fill('9');
  await page.getByRole('button', { name: 'Calculate from ingredients' }).click();
  await pickFood(page, 'seasoning', 'Seasoning mix · 50 kcal per 100 g');
  await expect(panel(page).getByText('Per serving (Servings is empty, so 1): 5 kcal · 0.1 g protein')).toBeVisible();
  await expect(panel(page).getByText('Some foods have no carbs or fat, so those stay as typed.')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Use these numbers' }).click();
  await expect(page.getByLabel('Calories per serving')).toHaveValue('5');
  await expect(page.getByLabel('Carbs per serving (g), optional')).toHaveValue('9');
});

test('with no ingredients the button is off, and a lookup that is down says so while the rest works', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await expect(page.getByRole('button', { name: 'Calculate from ingredients' })).toBeDisabled();
  await expect(page.getByText('Add ingredients first.')).toBeVisible();
  await page.route('**/api/foods/search*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'x' }) }));
  await page.getByLabel('Ingredient 1', { exact: true }).fill('oats');
  await setAmount(page, 0, '50 g');
  await page.getByRole('button', { name: 'Calculate from ingredients' }).click();
  await panel(page).getByRole('button', { name: 'Look up oats' }).click();
  await expect(panel(page).getByText('Food search is not available right now. You can still type the numbers.')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Use these numbers' })).toBeDisabled();
});
