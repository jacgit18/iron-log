import { test, expect } from './fixtures.js';

// Ready-made foods and the recipe-first day screen (brief recipe-first-diet-log). The cleaner, the day limits and the logging rules are node tests
// (recipes.test.ts, recipeDraft.test.ts, dietLog.test.ts); this covers the wiring a unit test cannot: the real form and list, the address and Back, the
// detail without ingredients, Ate this on a chosen day, the lookup filling the form (route stubbed), and the folded One-off food form.
const diet = page => page.getByRole('region', { name: 'Diet' });
const openRecipes = async page => { await page.click('#tab-daily'); await page.click('#daily-recipes'); };
const openDiet = async page => { await page.click('#tab-daily'); await page.click('#daily-supplements'); };
const hits = [{ id: 1, name: 'Oats, rolled', kcal: 379, p: 13.2, c: 67.7, f: 6.5 }];
const stub = page => page.route('**/api/foods/search*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, hits }) }));
const make = async (page, name = 'Frozen lasagna') => {
  await openRecipes(page);
  await page.getByRole('button', { name: 'New ready-made food' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Calories per serving').fill('420');
  await page.getByLabel('Protein per serving (g)').fill('22');
  await page.getByLabel('Carbs per serving (g), optional').fill('48');
  await page.getByLabel('Fat per serving (g), optional').fill('15');
  await page.getByRole('button', { name: 'Save food' }).click();
};

test('a ready-made food needs a name and numbers, lists under its chip, and its page has no ingredients or steps', async ({ page }) => {
  await openRecipes(page);
  await page.getByRole('button', { name: 'New ready-made food' }).click();
  await expect(page).toHaveURL(/#\/daily\/recipes\/form$/);
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByRole('alert')).toHaveText('Give the food a name.');
  await page.getByLabel('Name', { exact: true }).fill('Frozen lasagna');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByRole('alert')).toContainText('Calories per serving');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await make(page);
  await expect(page.getByRole('heading', { name: /Frozen lasagna/ })).toBeVisible();
  await expect(page.getByText('Per portion: 420 kcal · 22 g protein · 48 g carbs · 15 g fat')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ingredients' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Steps' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /missing to To get/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to recipes' }).click();
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Ready-made' }).click();
  await expect(page.getByRole('button', { name: /Frozen lasagna/ })).toBeVisible();
  await page.getByRole('button', { name: 'Can make' }).click(); // nothing is missing from a food with no ingredients, but it is not "can make"
  await expect(page.getByRole('button', { name: /Frozen lasagna/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Can make' }).click();
  await page.reload();
  await openRecipes(page);
  await expect(page.getByRole('button', { name: /Frozen lasagna/ })).toBeVisible();
});

test('Ate this logs a ready-made food as a snapshot, to today or to a chosen day, and refuses a future day', async ({ page }) => {
  await make(page);
  await page.getByRole('button', { name: 'Ate this' }).click();
  await expect(page.getByText('Logged 1 portion of Frozen lasagna to today.')).toBeVisible();
  const yesterday = await page.evaluate(() => { const d = new Date(Date.now() - 86400000); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); });
  const tomorrow = await page.evaluate(() => { const d = new Date(Date.now() + 86400000); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); });
  await page.getByLabel('Day').fill(tomorrow);
  await page.getByRole('button', { name: 'Ate this' }).click();
  await expect(page.getByRole('alert')).toHaveText('Pick today or an earlier day.');
  await page.getByLabel('Day').fill(yesterday);
  await page.getByRole('button', { name: 'Ate this' }).click();
  await expect(page.getByText(`Logged 1 portion of Frozen lasagna to ${yesterday}.`)).toBeVisible();
  await openDiet(page);
  await expect(diet(page).locator('.dt-entry')).toHaveCount(1); // today's only; yesterday's is on the other day
  await expect(diet(page).locator('.dt-entry')).toContainText('Frozen lasagna');
});

test('the food lookup in the ready-made form fills the numbers, still editable', async ({ page }) => {
  await stub(page);
  await openRecipes(page);
  await page.getByRole('button', { name: 'New ready-made food' }).click();
  await page.getByLabel('Look up nutrition').fill('oats');
  await page.getByRole('button', { name: 'Oats, rolled · 379 kcal per 100 g' }).click();
  await page.getByLabel('Grams').fill('50');
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Oats, rolled');
  await expect(page.getByLabel('Calories per serving')).toHaveValue('190');
  await expect(page.getByLabel('Protein per serving (g)')).toHaveValue('6.6');
  await page.getByLabel('Calories per serving').fill('185');
  await page.getByRole('button', { name: 'Save food' }).click();
  await expect(page.getByText('Per portion: 185 kcal · 6.6 g protein')).toBeVisible();
});

test('the day screen has no separate lookup box, and the One-off food form starts folded and opens on a pick', async ({ page }) => {
  await stub(page);
  await page.click('#tab-daily');
  await page.click('#daily-supplements');
  await expect(diet(page).getByLabel('Look up nutrition')).toHaveCount(0);
  await expect(diet(page).getByLabel('Food', { exact: true })).toBeHidden();
  await diet(page).getByRole('button', { name: 'Add one' }).click();
  await expect(diet(page).getByLabel('Food', { exact: true })).toBeVisible();
  await diet(page).getByRole('button', { name: 'Hide' }).click();
  await expect(diet(page).getByLabel('Food', { exact: true })).toBeHidden();
  await diet(page).getByLabel('Search your past meals and recipes').fill('oats');
  await diet(page).getByRole('button', { name: 'Oats, rolled · 379 kcal per 100 g' }).click();
  await diet(page).getByRole('button', { name: 'Use', exact: true }).click();
  await expect(diet(page).getByLabel('Food', { exact: true })).toHaveValue('Oats, rolled');
});

test('Enter in the lookup box does not save the form, and the Ready-made filter is dropped when you open the Library', async ({ page }) => {
  await stub(page);
  await openRecipes(page);
  await page.getByRole('button', { name: 'New ready-made food' }).click();
  await page.getByLabel('Look up nutrition').fill('oats');
  await page.getByLabel('Look up nutrition').press('Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Oats, rolled · 379 kcal per 100 g' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Ready-made' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Ready-made' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
});

test('the normal recipe form does not offer Ready-made as a category', async ({ page }) => {
  await openRecipes(page);
  await page.getByRole('button', { name: 'New recipe' }).click();
  await expect(page.getByLabel('Category').locator('option', { hasText: 'Ready-made' })).toHaveCount(0);
});
